// Payment & escrow routes for PayGate + FNB integration
import express, { Request, Response } from "express";
import crypto from "crypto";
import Payment from "../data/models/Payment";
import Wallet from "../data/models/Wallet";
import Transaction from "../data/models/Transaction";
import Order from "../data/models/Order";
import AuditLog from "../data/models/AuditLog";
import StoredCard from "../data/models/StoredCard";
import WalletPaymentRequest from "../data/models/WalletPaymentRequest";
import CheckoutSession from "../data/models/CheckoutSession";
import Escrow from "../data/models/Escrow";
import LedgerEntry from "../data/models/LedgerEntry";
import Task from "../data/models/Task";
import User from "../data/models/User";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import {
  initiatePayment,
  processPaymentCallback,
  getPayGateFlatFeeZar,
  getPayGateFlatFeeZarResolved,
  verifyPayGateBridgeQuery,
  buildPayGateRedirectHtml,
  getPayGateProcessUrl,
} from "../services/payment";
import payoutService from "../services/payoutService";
import fnbService from "../services/fnbService";
import logger from "../utils/logger";
import { trySettleMoneyRequestAfterTopup, finalizeMoneyRequestAfterDirectCard } from "../services/moneyRequestService";
import { generateReference } from "../utils/helpers";
import { walletPaymentLimiter } from "../middleware/rateLimit";
import { notifyOrderPaid, notifyBuyerDeliveryPrepaid, notifyBuyerOrderPurchase } from "../services/orderNotification";
import { settleFoodPickupOrderPaid } from "../services/foodOrderSettlement";
import { finalizeCourierOnOrderPaid } from "../services/courierOrderHooks";
import { forwardOrderToExternalSupplier } from "../services/orderForwardingService";
import MusicPurchase from "../data/models/MusicPurchase";
import Song from "../data/models/Song";
import Cart from "../data/models/Cart";
import {
  cancelPendingOrderIfUnpaid,
  clearBuyerCartAfterOrderPaid,
  restoreCartLinesFromOrder,
} from "../services/checkoutCartLifecycle";
import { sendSms } from "../services/otpDelivery";
import BankImport from "../data/models/BankImport";
import BankTransaction from "../data/models/BankTransaction";
import PaymentReceipt from "../data/models/PaymentReceipt";
import AgentTransaction from "../data/models/AgentTransaction";

const MUSIC_PLATFORM_COMMISSION_PCT = 30;
const MUSIC_OWNER_SHARE_PCT = 70;

const router = express.Router();
router.use(walletPaymentLimiter);

const AGENT_CASHIN_FEE_ZAR = Math.max(0, Number(process.env.AGENT_CASHIN_FEE_ZAR || 5));

function isAdminUser(req: AuthRequest): boolean {
  const roles = Array.isArray(req.user?.role) ? req.user!.role : [];
  return roles.includes("admin") || roles.includes("superadmin");
}

function normalizeReference(input: string): string {
  return String(input || "").trim().toLowerCase().replace(/\s+/g, "");
}

function parseCsvRows(csvText: string): Array<{ date?: string; amount: number; reference: string }> {
  const lines = String(csvText || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const body = lines.slice(1);
  const rows: Array<{ date?: string; amount: number; reference: string }> = [];
  for (const line of body) {
    const parts = line.split(",").map((x) => x.trim());
    if (parts.length < 3) continue;
    const [date, amountRaw, ...refParts] = parts;
    const amount = Number(String(amountRaw).replace(/[^\d.-]/g, ""));
    const reference = refParts.join(",").trim();
    if (!reference || !(amount > 0)) continue;
    rows.push({ date, amount, reference });
  }
  return rows;
}

async function resolveUserFromBankReference(reference: string) {
  const raw = String(reference || "").trim();
  if (!raw) return null;
  const normalized = normalizeReference(raw);
  const digits = raw.replace(/\D/g, "");

  let user =
    (digits ? await User.findOne({ phone: { $regex: `${digits}$` } }).select("_id phone email").lean() : null) ||
    null;
  if (user) return user;

  // Supports WLT-<mongoUserId>
  if (normalized.startsWith("wlt-")) {
    const maybeId = raw.slice(raw.indexOf("-") + 1).trim();
    if (/^[a-fA-F0-9]{24}$/.test(maybeId)) {
      user = await User.findById(maybeId).select("_id phone email").lean();
      if (user) return user;
    }
  }
  return null;
}

async function createReceipt(params: {
  userId?: any;
  amount: number;
  method: "paygate" | "bank" | "agent" | "wallet";
  reference: string;
  purpose?: string;
  status?: "completed" | "pending" | "failed";
  meta?: Record<string, any>;
}) {
  const receipt = await PaymentReceipt.findOneAndUpdate(
    { reference: params.reference },
    {
      $setOnInsert: {
        user: params.userId,
        amount: params.amount,
        method: params.method,
        reference: params.reference,
        purpose: params.purpose || "Payment",
        status: params.status || "completed",
        deliveredWeb: true,
        deliveredWhatsapp: false,
        deliveredEmail: false,
        meta: params.meta || {},
      },
    },
    { upsert: true, new: true }
  );

  if (params.userId) {
    const user = await User.findById(params.userId).select("phone").lean();
    const phone = String((user as any)?.phone || "").trim();
    if (phone) {
      const text = [
        "Payment Received",
        `Amount: R${Number(params.amount || 0).toFixed(2)}`,
        `Method: ${params.method.toUpperCase()}`,
        `Reference: ${params.reference}`,
        `Purpose: ${params.purpose || "Payment"}`,
        `Status: ${(params.status || "completed").toUpperCase()}`,
      ].join("\n");
      try {
        await sendSms({ phone, text, channel: "whatsapp" });
        await PaymentReceipt.updateOne({ _id: (receipt as any)._id }, { $set: { deliveredWhatsapp: true } });
      } catch {
        // Non-blocking receipt delivery.
      }
    }
  }
  return receipt;
}

/** Browser/mobile open this URL after initiate — returns HTML that POSTs to PayWeb3 process.trans (GET to process.trans is invalid). */
router.get("/paygate-redirect", (req: Request, res: Response) => {
  const v = verifyPayGateBridgeQuery(req.query as Record<string, unknown>);
  if (!v.ok) {
    const safe = String(v.reason || "Invalid link").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    return res.status(400).type("html").send(`<!DOCTYPE html><html><body><p>${safe}</p></body></html>`);
  }
  const html = buildPayGateRedirectHtml(getPayGateProcessUrl(), v.payRequestId, v.checksum);
  res.setHeader(
    "Content-Security-Policy",
    "script-src 'unsafe-inline'; default-src 'none'; form-action https://secure.paygate.co.za https://*.paygate.co.za"
  );
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  return res.status(200).type("html").send(html);
});

async function creditAdminPayGateFee(reference: string): Promise<void> {
  // Flat fee is only for wallet top-up style flows (not checkout/store card payments).
  const ref = String(reference || "").trim().toUpperCase();
  const feeEligible = ref.startsWith("TOPUP-") || ref.startsWith("PAY-");
  if (!feeEligible) return;
  const fee = await getPayGateFlatFeeZarResolved();
  if (!(fee > 0)) return;
  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim();
  if (!adminEmail) return;
  const adminUser = await User.findOne({ email: adminEmail }).select("_id").lean();
  if (!adminUser?._id) return;
  let adminWallet = await Wallet.findOne({ user: adminUser._id });
  if (!adminWallet) adminWallet = await Wallet.create({ user: adminUser._id });
  const feeRef = `PAYGATE-FEE-${reference}`;
  const alreadyCredited = (adminWallet.transactions || []).some((t: any) => String(t?.reference || "") === feeRef);
  if (alreadyCredited) return;
  adminWallet.balance += fee;
  adminWallet.transactions.push({
    type: "credit",
    amount: fee,
    reference: feeRef,
    createdAt: new Date(),
  });
  await adminWallet.save();
  await AuditLog.create({
    action: "PAYGATE_FEE_CREDITED_ADMIN",
    user: adminUser._id,
    meta: { reference, fee },
  });
}

async function ensureOrderVisibleInBuyerWalletHistory(order: any): Promise<void> {
  const buyerId = String(order?.buyerId || "").trim();
  const orderId = String(order?._id || "").trim();
  if (!buyerId || !orderId) return;
  const amount = Number(order?.amounts?.total ?? 0);
  if (!(amount > 0)) return;
  const reference = `ORDER-${orderId}`;

  let wallet = await Wallet.findOne({ user: buyerId });
  if (!wallet) wallet = await Wallet.create({ user: buyerId as any });
  const exists = (wallet.transactions || []).some(
    (tx: any) => String(tx?.reference || "").trim() === reference
  );
  if (exists) return;

  // History-only debit row (no balance mutation): card checkout should still appear in ACBPay history.
  wallet.transactions.push({
    type: "debit",
    amount: -amount,
    reference,
    createdAt: order?.paidAt ? new Date(order.paidAt) : new Date(),
  });
  await wallet.save();
}

async function notifyDirectWalletSendSuccess(params: {
  senderUserId?: string;
  recipientUserId: string;
  paymentReference: string;
  sendAmount: number;
  senderPhone?: string;
  recipientPhone?: string;
}): Promise<void> {
  const { senderUserId, recipientUserId, paymentReference, sendAmount, senderPhone, recipientPhone } = params;
  try {
    const [sender, recipient] = await Promise.all([
      senderUserId ? User.findById(senderUserId).select("phone").lean() : Promise.resolve(null),
      User.findById(recipientUserId).select("phone").lean(),
    ]);

    const senderPhoneOut = String((sender as any)?.phone || senderPhone || "").trim();
    const recipientPhoneOut = String((recipient as any)?.phone || recipientPhone || "").trim();
    const amountText = `R${Number(sendAmount || 0).toFixed(2)}`;
    const senderLabel = senderPhoneOut ? `+${senderPhoneOut.replace(/^\+/, "")}` : "the sender";

    if (senderPhoneOut) {
      await sendSms({
        phone: senderPhoneOut,
        channel: "whatsapp",
        text: `Payment sent successfully. ${amountText} sent to +${recipientPhoneOut.replace(/^\+/, "") || "recipient"}. Ref: ${paymentReference}`,
      }).catch(() => {});
    }
    if (recipientPhoneOut) {
      await sendSms({
        phone: recipientPhoneOut,
        channel: "whatsapp",
        text: `Payment of ${amountText} received from user ${senderLabel}. Ref: ${paymentReference}`,
      }).catch(() => {});
    }
  } catch {
    // non-fatal notification path
  }
}

async function processMusicPurchases(
  musicItems: Array<{ songId: any; qty: number; price: number }>,
  buyerId: any
): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminUser = adminEmail ? await User.findOne({ email: adminEmail }).select("_id") : null;
  if (!adminUser?._id) return;
  for (const m of musicItems) {
    const song = await Song.findById(m.songId).lean();
    if (!song) continue;
    let ownerWallet = await Wallet.findOne({ user: (song as any).userId });
    if (!ownerWallet) ownerWallet = await Wallet.create({ user: (song as any).userId });
    let adminWallet = await Wallet.findOne({ user: adminUser._id });
    if (!adminWallet) adminWallet = await Wallet.create({ user: adminUser._id });
    const adminCommission = Math.round((m.price * m.qty * MUSIC_PLATFORM_COMMISSION_PCT / 100) * 100) / 100;
    const ownerShare = Math.round((m.price * m.qty * MUSIC_OWNER_SHARE_PCT / 100) * 100) / 100;
    const reference = `MUSIC-${m.songId}-${Date.now()}`;
    ownerWallet.balance += ownerShare;
    ownerWallet.transactions.push({ type: "credit", amount: ownerShare, reference: `${reference}-OWNER`, createdAt: new Date() });
    await ownerWallet.save();
    adminWallet.balance += adminCommission;
    adminWallet.transactions.push({ type: "credit", amount: adminCommission, reference: `${reference}-ADMIN`, createdAt: new Date() });
    await adminWallet.save();
    await MusicPurchase.create({
      songId: m.songId,
      buyerId,
      ownerId: (song as any).userId,
      amount: m.price * m.qty,
      adminCommission,
      ownerShare,
      reference,
    });
  }
}

// Initiate payment
router.post("/initiate", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 10) {
      throw new AppError("Minimum payment amount is R10", 400);
    }

    const reference = generateReference("PAY");

    const payment = await Payment.create({
      user: req.user!._id,
      amount,
      reference,
      status: "pending",
    });

    const paymentResult = await initiatePayment({
      amount,
      reference,
      email: req.user!.email,
      // Use an existing frontend route in production.
      returnUrl: `${process.env.FRONTEND_URL || "https://qwertymates.com"}/wallet`,
      notifyUrl: `${process.env.BACKEND_URL}/api/payments/webhook`,
    });

    if (!paymentResult.success) {
      payment.status = "failed";
      await payment.save();
      throw new AppError(paymentResult.error || "Payment initiation failed", 500);
    }

    payment.gatewayRequest = paymentResult;
    await payment.save();

    await AuditLog.create({
      action: "PAYMENT_INITIATED",
      user: req.user!._id,
      meta: { reference, amount },
    });

    res.json({
      message: "Payment initiated successfully",
      paymentUrl: paymentResult.paymentUrl,
      payGateRedirect: paymentResult.payGateRedirect,
      reference,
      amount,
      paygateFeeZar: paymentResult.paygateFeeZar,
      chargedZar: paymentResult.chargedZar,
    });
  } catch (err) {
    next(err);
  }
});

// Payment webhook (PayGate callback) - must respond with "OK" for PayGate
router.post("/webhook", async (req: Request, res: Response) => {
  const sendOk = () => res.status(200).send("OK");

  try {
    const result = await processPaymentCallback(req.body);
    const ref = result.reference;

    // ADDCARD: PayVault tokenization - no Payment record
    if (ref.startsWith("ADDCARD-") && result.status === "successful" && result.vaultId) {
      const parts = ref.replace("ADDCARD-", "").split("-");
      const userId = parts[0];
      if (userId) {
        const mongoose = await import("mongoose");
        const uid = new mongoose.default.Types.ObjectId(userId);
        const existing = await StoredCard.findOne({ user: uid, vaultId: result.vaultId });
        if (!existing) {
          const payvault1 = (result.payvaultData1 || "").replace(/\D/g, "");
          const last4 = payvault1.length >= 4 ? payvault1.slice(-4) : "????";
          const brand = result.payMethodDetail || "Card";
          const payvault2 = (result.payvaultData2 || "").replace(/\D/g, "");
          const mmMatch = payvault2.length >= 4 ? payvault2.match(/^(\d{2})(\d{2})$/) : null;
          const expiryMonth = mmMatch ? Math.min(12, Math.max(1, parseInt(mmMatch[1], 10))) : 12;
          const expiryYear = mmMatch ? (parseInt(mmMatch[2], 10) <= 50 ? 2000 + parseInt(mmMatch[2], 10) : 1900 + parseInt(mmMatch[2], 10)) : new Date().getFullYear() + 5;

          const isFirst = (await StoredCard.countDocuments({ user: uid })) === 0;
          await StoredCard.create({
            user: uid,
            vaultId: result.vaultId,
            payvaultData1: result.payvaultData1,
            payvaultData2: result.payvaultData2,
            last4,
            brand,
            expiryMonth,
            expiryYear,
            isDefault: isFirst,
          });
        }
        let wallet = await Wallet.findOne({ user: uid });
        if (!wallet) wallet = await Wallet.create({ user: uid });
        wallet.balance += 1; // R1 credited from add-card charge
        wallet.transactions.push({ type: "topup", amount: 1, reference: ref, createdAt: new Date() });
        await wallet.save();
        await AuditLog.create({ action: "WALLET_CARD_ADDED", user: uid, meta: { reference: ref } });
        await createReceipt({
          userId: uid,
          amount: 1,
          method: "paygate",
          reference: ref,
          purpose: "Add card tokenization credit",
        });
      }
      return sendOk();
    }

    // CHECKOUT: E-commerce payment with card
    if (ref.startsWith("CHECKOUT-") && result.status === "successful") {
      const sessionId = ref.replace("CHECKOUT-", "");
      const session = await CheckoutSession.findById(sessionId);
      if (session && session.status === "pending") {
        // Credit merchant the session amount (goods total), not the PayGate total (includes flat card fee).
        const amount = Number(session.amount);
        let merchantWallet = await Wallet.findOne({ user: session.merchantId });
        if (!merchantWallet) merchantWallet = await Wallet.create({ user: session.merchantId });
        merchantWallet.balance += amount;
        merchantWallet.transactions.push({
          type: "credit",
          amount,
          reference: `CHECKOUT-${session.reference}`,
          createdAt: new Date(),
        });
        await merchantWallet.save();
        session.status = "completed";
        session.completedAt = new Date();
        await session.save();
        await notifyBuyerOrderPurchase({
          buyerId: String(session.payerId),
          orderId: String(session.reference),
          totalZar: amount,
        });
        await AuditLog.create({
          action: "CHECKOUT_PAY_CARD",
          user: session.payerId,
          meta: { amount, merchantId: session.merchantId, reference: session.reference },
        });
        await createReceipt({
          userId: session.payerId,
          amount,
          method: "paygate",
          reference: String(ref),
          purpose: "Marketplace checkout",
        });
      }
      return sendOk();
    }

    // CARDPMT: Pay with stored card for QR payment - no Payment record
    if (ref.startsWith("CARDPMT-") && result.status === "successful") {
      const prId = ref.replace("CARDPMT-", "");
      const pr = await WalletPaymentRequest.findById(prId);
      if (pr && pr.status === "pending") {
        // Credit payee the QR amount, not the PayGate total (includes flat card fee).
        const amount = Number(pr.amount);
        let payeeWallet = await Wallet.findOne({ user: pr.toUser });
        if (!payeeWallet) payeeWallet = await Wallet.create({ user: pr.toUser });
        payeeWallet.balance += amount;
        payeeWallet.transactions.push({ type: "credit", amount, reference: pr.reference, createdAt: new Date() });
        await payeeWallet.save();
        pr.status = "completed";
        pr.completedAt = new Date();
        await pr.save();
        await AuditLog.create({
          action: "WALLET_QR_PAYMENT_CARD",
          user: pr.fromUser,
          meta: { amount, toUser: pr.toUser, reference: pr.reference },
        });
        await createReceipt({
          userId: pr.fromUser,
          amount,
          method: "paygate",
          reference: String(ref),
          purpose: "QR payment by card",
        });
      }
      return sendOk();
    }

    const payment = await Payment.findOne({ reference: ref });
    if (!payment) {
      logger.warn("Payment webhook: no Payment found for reference", { reference: ref });
      return sendOk();
    }
    const wasSuccessful = payment.status === "successful";

    payment.status = result.status as "pending" | "successful" | "failed" | "refunded" | "disputed";
    payment.metadata = {
      ...(payment.metadata && typeof payment.metadata === "object" ? payment.metadata : {}),
      paygate: {
        transactionStatus: result.transactionStatus || null,
        resultCode: result.resultCode || null,
        resultDesc: result.resultDesc || null,
        receivedAt: new Date().toISOString(),
      },
    };
    await payment.save();

    if (result.status === "successful" && !wasSuccessful) {
      await creditAdminPayGateFee(payment.reference);
      if (payment.reference.startsWith("ORDER-")) {
        const orderId = payment.reference.replace("ORDER-", "");
        const order = await Order.findById(orderId);
        if (order && order.status === "pending_payment") {
          order.status = "paid";
          order.paidAt = new Date();
          order.paymentReference = payment.reference;
          await order.save();
          await notifyBuyerOrderPurchase({
            buyerId: order.buyerId.toString(),
            orderId: order._id.toString(),
            totalZar: Number(order.amounts?.total ?? payment.amount ?? 0),
            items: order.items.map((it: { productId: { toString(): string }; qty: number }) => ({
              productId: it.productId.toString(),
              qty: it.qty,
            })),
          });
          await ensureOrderVisibleInBuyerWalletHistory(order);
          await notifyOrderPaid({
            orderId: order._id.toString(),
            buyerId: order.buyerId.toString(),
            items: order.items.map((it: any) => ({
              productId: it.productId.toString(),
              qty: it.qty,
            })),
          });
          await settleFoodPickupOrderPaid(order._id.toString()).catch((err) =>
            console.error("Food pickup settlement failed:", err)
          );
          if ((order.amounts as any)?.deliveryPrepaid) {
            await notifyBuyerDeliveryPrepaid({
              buyerId: order.buyerId.toString(),
              orderId: order._id.toString(),
              shippingZar: Number(order.amounts?.shipping ?? 0),
            });
          }
          forwardOrderToExternalSupplier(order._id.toString()).catch((err) =>
            console.error("Order forward to external supplier failed:", err)
          );
          await finalizeCourierOnOrderPaid(order._id.toString());
          const musicItems = (order as any).musicItems;
          if (Array.isArray(musicItems) && musicItems.length > 0) {
            await processMusicPurchases(musicItems, order.buyerId);
          }
          await clearBuyerCartAfterOrderPaid(order.buyerId.toString());
        }
      } else if (payment.reference.startsWith("MUSIC-")) {
        const meta = payment.metadata as { musicItems?: Array<{ songId: any; qty: number; price: number }> } | undefined;
        const musicItems = meta?.musicItems;
        if (Array.isArray(musicItems) && musicItems.length > 0) {
          await processMusicPurchases(musicItems, payment.user);
          const cart = await Cart.findOne({ user: payment.user });
          if (cart) {
            cart.musicItems = [];
            await cart.save();
          }
        }
      } else if (payment.reference.startsWith("TOPUP-") || payment.reference.startsWith("PAY-")) {
        const meta = (payment.metadata || {}) as {
          moneyRequestId?: string;
          directToRequester?: boolean;
          directWalletSend?: boolean;
          senderUserId?: string;
          recipientUserId?: string;
          senderPhone?: string;
          recipientPhone?: string;
          sendAmount?: number;
          partialFromWallet?: number;
        };
        if (meta.directWalletSend) {
          const recipientUserId = String(meta.recipientUserId || payment.user);
          let recipientWallet = await Wallet.findOne({ user: recipientUserId });
          if (!recipientWallet) recipientWallet = await Wallet.create({ user: recipientUserId as any });
          recipientWallet.balance += payment.amount;
          recipientWallet.transactions.push({
            type: "credit",
            amount: payment.amount,
            reference: payment.reference,
            createdAt: new Date(),
          });
          await recipientWallet.save();
          await Transaction.create({
            wallet: recipientWallet._id,
            user: recipientUserId as any,
            type: "credit",
            amount: payment.amount,
            reference: payment.reference,
            status: "successful",
          });

          const sendAmount =
            Number(meta.sendAmount) > 0
              ? Number(meta.sendAmount)
              : Math.round((Number(meta.partialFromWallet || 0) + Number(payment.amount || 0)) * 100) / 100;
          await notifyDirectWalletSendSuccess({
            senderUserId: meta.senderUserId,
            recipientUserId,
            paymentReference: payment.reference,
            sendAmount,
            senderPhone: meta.senderPhone,
            recipientPhone: meta.recipientPhone,
          });
          await createReceipt({
            userId: meta.senderUserId || payment.user,
            amount: Number(meta.sendAmount || payment.amount),
            method: "paygate",
            reference: payment.reference,
            purpose: "Direct wallet send via card top-up",
          });
        } else {
          let wallet = await Wallet.findOne({ user: payment.user });
          if (!wallet) wallet = await Wallet.create({ user: payment.user });
          wallet.balance += payment.amount;
          wallet.transactions.push({
            type: "topup",
            amount: payment.amount,
            reference: payment.reference,
            createdAt: new Date(),
          });
          await wallet.save();
          await Transaction.create({
            wallet: wallet._id,
            user: payment.user,
            type: "topup",
            amount: payment.amount,
            reference: payment.reference,
            status: "successful",
          });
          await createReceipt({
            userId: payment.user,
            amount: payment.amount,
            method: "paygate",
            reference: payment.reference,
            purpose: "Wallet top-up",
          });
        }
        if (meta.moneyRequestId && meta.directToRequester) {
          await finalizeMoneyRequestAfterDirectCard(meta.moneyRequestId);
        } else if (meta.moneyRequestId) {
          await trySettleMoneyRequestAfterTopup(payment.user as any, meta.moneyRequestId);
        }
      }
    } else if (
      result.status === "failed" &&
      !wasSuccessful &&
      payment.reference.startsWith("ORDER-")
    ) {
      const orderId = payment.reference.replace("ORDER-", "");
      const order = await Order.findById(orderId);
      if (order && order.status === "pending_payment") {
        await cancelPendingOrderIfUnpaid(orderId);
        await restoreCartLinesFromOrder(order);
      }
    }

    await AuditLog.create({
      action: "PAYMENT_WEBHOOK_RECEIVED",
      user: payment.user,
      meta: {
        reference: payment.reference,
        status: payment.status,
        transactionStatus: result.transactionStatus || null,
        resultCode: result.resultCode || null,
        resultDesc: result.resultDesc || null,
      },
    });

    return sendOk();
  } catch (err: any) {
    logger.error("Payment webhook processing failed", {
      error: err?.message || String(err),
    });
    return sendOk();
  }
});

// Get payment status
router.get("/:reference", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const payment = await Payment.findOne({ reference: req.params.reference });

    if (!payment) throw new AppError("Payment not found", 404);

    if (payment.user.toString() !== req.user!._id.toString()) {
      throw new AppError("Unauthorized", 403);
    }

    res.json({ payment });
  } catch (err) {
    next(err);
  }
});

// List user payments
router.get("/", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const payments = await Payment.find({ user: req.user!._id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ payments });
  } catch (err) {
    next(err);
  }
});

// Manual bank deposit import (CSV reconciliation) - admin only
router.post("/bank/import", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (!isAdminUser(req)) throw new AppError("Admin access required", 403);
    const fileName = String(req.body?.fileName || "bank-statement.csv").trim().slice(0, 200);
    const csvContent = String(req.body?.csvContent || "");
    if (!csvContent.trim()) throw new AppError("csvContent is required", 400);

    const rows = parseCsvRows(csvContent);
    if (!rows.length) throw new AppError("No valid CSV rows found", 400);

    const fileHash = crypto.createHash("sha256").update(csvContent).digest("hex");
    const existingImport = await BankImport.findOne({ fileHash }).lean();
    if (existingImport) throw new AppError("Duplicate CSV upload blocked", 409);

    const importRow = await BankImport.create({
      fileName,
      uploadedBy: req.user!._id,
      fileHash,
      rowCount: rows.length,
      processedAt: new Date(),
    });

    let matched = 0;
    let unmatched = 0;
    let duplicates = 0;

    for (const row of rows) {
      const normalizedReference = normalizeReference(row.reference);
      const txDate = row.date ? new Date(row.date) : undefined;
      const dateKey = txDate && !Number.isNaN(txDate.getTime()) ? txDate.toISOString().slice(0, 10) : "na";
      const dedupeKey = crypto
        .createHash("sha256")
        .update(`${dateKey}|${row.amount.toFixed(2)}|${normalizedReference}`)
        .digest("hex");

      const duplicateTx = await BankTransaction.findOne({ dedupeKey }).lean();
      if (duplicateTx) {
        duplicates += 1;
        await BankTransaction.create({
          importId: importRow._id,
          txDate: txDate && !Number.isNaN(txDate.getTime()) ? txDate : undefined,
          amount: row.amount,
          reference: row.reference,
          normalizedReference,
          status: "duplicate",
          dedupeKey: `${dedupeKey}-dup-${Date.now()}-${Math.random()}`,
        });
        continue;
      }

      const user = await resolveUserFromBankReference(row.reference);
      if (!user?._id) {
        unmatched += 1;
        await BankTransaction.create({
          importId: importRow._id,
          txDate: txDate && !Number.isNaN(txDate.getTime()) ? txDate : undefined,
          amount: row.amount,
          reference: row.reference,
          normalizedReference,
          status: "unmatched",
          dedupeKey,
        });
        continue;
      }

      let wallet = await Wallet.findOne({ user: user._id });
      if (!wallet) wallet = await Wallet.create({ user: user._id });
      const receiptReference = `BANK-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

      wallet.balance += row.amount;
      wallet.transactions.push({
        type: "topup",
        amount: row.amount,
        reference: receiptReference,
        createdAt: new Date(),
      });
      await wallet.save();

      await Transaction.create({
        wallet: wallet._id,
        user: user._id,
        type: "topup",
        amount: row.amount,
        reference: receiptReference,
        status: "successful",
        meta: {
          method: "bank",
          sourceReference: row.reference,
          importId: importRow._id,
        },
      });

      await createReceipt({
        userId: user._id,
        amount: row.amount,
        method: "bank",
        reference: receiptReference,
        purpose: "Bank deposit wallet top-up",
        meta: { sourceReference: row.reference, importId: String(importRow._id) },
      });

      matched += 1;
      await BankTransaction.create({
        importId: importRow._id,
        txDate: txDate && !Number.isNaN(txDate.getTime()) ? txDate : undefined,
        amount: row.amount,
        reference: row.reference,
        normalizedReference,
        matchedUserId: user._id,
        walletId: wallet._id,
        status: "matched",
        dedupeKey,
        receiptReference,
      });
    }

    importRow.matchedCount = matched;
    importRow.unmatchedCount = unmatched;
    importRow.duplicateCount = duplicates;
    await importRow.save();

    await AuditLog.create({
      action: "BANK_IMPORT_PROCESSED",
      user: req.user!._id,
      meta: {
        importId: importRow._id,
        rowCount: importRow.rowCount,
        matched,
        unmatched,
        duplicates,
      },
    });

    res.status(201).json({
      message: "Bank CSV processed",
      data: {
        importId: importRow._id,
        rowCount: importRow.rowCount,
        matched,
        unmatched,
        duplicates,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/bank/imports", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (!isAdminUser(req)) throw new AppError("Admin access required", 403);
    const rows = await BankImport.find().sort({ processedAt: -1 }).limit(100).lean();
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

router.get("/bank/unmatched", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (!isAdminUser(req)) throw new AppError("Admin access required", 403);
    const rows = await BankTransaction.find({ status: "unmatched" }).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/bank/allocate", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (!isAdminUser(req)) throw new AppError("Admin access required", 403);
    const bankTxId = String(req.body?.bankTxId || "").trim();
    const userId = String(req.body?.userId || "").trim();
    if (!bankTxId || !userId) throw new AppError("bankTxId and userId are required", 400);
    const bankTx = await BankTransaction.findById(bankTxId);
    if (!bankTx) throw new AppError("Bank transaction not found", 404);
    if (bankTx.status !== "unmatched") throw new AppError("Transaction already processed", 400);
    const user = await User.findById(userId).select("_id").lean();
    if (!user?._id) throw new AppError("User not found", 404);

    let wallet = await Wallet.findOne({ user: user._id });
    if (!wallet) wallet = await Wallet.create({ user: user._id });

    const receiptReference = `BANK-ALLOC-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    wallet.balance += Number(bankTx.amount || 0);
    wallet.transactions.push({
      type: "topup",
      amount: Number(bankTx.amount || 0),
      reference: receiptReference,
      createdAt: new Date(),
    });
    await wallet.save();

    await Transaction.create({
      wallet: wallet._id,
      user: user._id,
      type: "topup",
      amount: Number(bankTx.amount || 0),
      reference: receiptReference,
      status: "successful",
      meta: { method: "bank", sourceReference: bankTx.reference, allocatedByAdmin: true },
    });

    bankTx.status = "matched";
    bankTx.matchedUserId = user._id as any;
    bankTx.walletId = wallet._id as any;
    bankTx.receiptReference = receiptReference;
    await bankTx.save();

    await createReceipt({
      userId: user._id,
      amount: Number(bankTx.amount || 0),
      method: "bank",
      reference: receiptReference,
      purpose: "Bank deposit manual allocation",
      meta: { bankTxId: String(bankTx._id) },
    });

    await AuditLog.create({
      action: "BANK_TX_ALLOCATED",
      user: req.user!._id,
      meta: { bankTxId: bankTx._id, userId: user._id, amount: bankTx.amount },
    });

    res.json({ message: "Bank transaction allocated", receiptReference });
  } catch (err) {
    next(err);
  }
});

// Agent cash-in: pre-funded agent transfers wallet float to user (offline cash accepted by agent)
router.post("/agent/cash-in", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const amount = Number(req.body?.amount || 0);
    const targetUserId = String(req.body?.userId || "").trim();
    if (!targetUserId || !(amount > 0)) throw new AppError("userId and amount are required", 400);
    if (String(req.user!._id) === targetUserId) throw new AppError("Cannot cash-in to self", 400);

    const actor = await User.findById(req.user!._id).select("merchantAgent isVerified suspended locked active").lean();
    const isApprovedAgent =
      !!(actor as any)?.isVerified &&
      !(actor as any)?.suspended &&
      !(actor as any)?.locked &&
      !!(actor as any)?.active &&
      ((actor as any)?.merchantAgent?.applicationStatus === "approved" || (actor as any)?.merchantAgent?.enabled === true);
    if (!isApprovedAgent) throw new AppError("Approved verified agent required", 403);

    let agentWallet = await Wallet.findOne({ user: req.user!._id });
    if (!agentWallet) agentWallet = await Wallet.create({ user: req.user!._id });
    if (Number(agentWallet.balance || 0) < amount) {
      throw new AppError("Insufficient agent balance. Prefund your wallet first.", 400);
    }

    const targetUser = await User.findById(targetUserId).select("_id").lean();
    if (!targetUser?._id) throw new AppError("Target user not found", 404);
    let userWallet = await Wallet.findOne({ user: targetUser._id });
    if (!userWallet) userWallet = await Wallet.create({ user: targetUser._id });

    const reference = `AGENT-CASHIN-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const now = new Date();

    agentWallet.balance -= amount;
    agentWallet.transactions.push({ type: "debit", amount: -amount, reference, createdAt: now });
    await agentWallet.save();

    userWallet.balance += amount;
    userWallet.transactions.push({ type: "credit", amount, reference, createdAt: now });
    await userWallet.save();

    await AgentTransaction.create({
      agentId: req.user!._id,
      userId: targetUser._id,
      amount,
      fee: AGENT_CASHIN_FEE_ZAR,
      reference,
    });

    await Transaction.create({
      wallet: agentWallet._id,
      user: req.user!._id,
      type: "debit",
      amount,
      reference,
      status: "successful",
      meta: { method: "agent", side: "agent_debit", feeCashKeptByAgent: AGENT_CASHIN_FEE_ZAR },
    });
    await Transaction.create({
      wallet: userWallet._id,
      user: targetUser._id,
      type: "credit",
      amount,
      reference,
      status: "successful",
      meta: { method: "agent", side: "user_credit", feeCashKeptByAgent: AGENT_CASHIN_FEE_ZAR },
    });

    await createReceipt({
      userId: targetUser._id,
      amount,
      method: "agent",
      reference,
      purpose: "Agent cash-in",
      meta: { fee: AGENT_CASHIN_FEE_ZAR, agentId: String(req.user!._id) },
    });

    res.status(201).json({
      message: "Agent cash-in completed",
      reference,
      amount,
      fee: AGENT_CASHIN_FEE_ZAR,
      agentBalance: Number(agentWallet.balance || 0),
      userBalance: Number(userWallet.balance || 0),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/agent/transactions", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const mineOnly = String(req.query.mineOnly || "true") !== "false";
    const q: any = mineOnly || !isAdminUser(req) ? { agentId: req.user!._id } : {};
    const rows = await AgentTransaction.find(q)
      .populate("agentId", "name username phone")
      .populate("userId", "name username phone")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

router.get("/receipts/:reference", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const reference = String(req.params.reference || "").trim();
    const receipt = await PaymentReceipt.findOne({ reference }).lean();
    if (!receipt) throw new AppError("Receipt not found", 404);
    if (!isAdminUser(req) && String((receipt as any).user || "") !== String(req.user!._id)) {
      throw new AppError("Unauthorized", 403);
    }
    res.json({ data: receipt });
  } catch (err) {
    next(err);
  }
});

router.get("/monitoring/summary", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (!isAdminUser(req)) throw new AppError("Admin access required", 403);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [paygate, bank, agent, unmatched, importsToday] = await Promise.all([
      Payment.aggregate([
        { $match: { createdAt: { $gte: start }, status: "successful" } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      BankTransaction.aggregate([
        { $match: { createdAt: { $gte: start }, status: "matched" } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      AgentTransaction.aggregate([
        { $match: { createdAt: { $gte: start } } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 }, fees: { $sum: "$fee" } } },
      ]),
      BankTransaction.countDocuments({ status: "unmatched" }),
      BankImport.countDocuments({ processedAt: { $gte: start } }),
    ]);
    res.json({
      data: {
        dayStart: start,
        paygate: {
          total: Number(paygate[0]?.total || 0),
          count: Number(paygate[0]?.count || 0),
        },
        bank: {
          total: Number(bank[0]?.total || 0),
          count: Number(bank[0]?.count || 0),
          unmatchedCount: Number(unmatched || 0),
          importsToday: Number(importsToday || 0),
        },
        agent: {
          total: Number(agent[0]?.total || 0),
          count: Number(agent[0]?.count || 0),
          feeCashTotal: Number(agent[0]?.fees || 0),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/reconciliation/daily", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    if (!isAdminUser(req)) throw new AppError("Admin access required", 403);
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const [paygate, bankMatched, bankUnmatched, agentCashIn] = await Promise.all([
      Payment.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to }, status: "successful" } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      BankTransaction.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to }, status: "matched" } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      BankTransaction.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to }, status: "unmatched" } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      AgentTransaction.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
    ]);
    res.json({
      data: {
        from,
        to,
        paygate: { total: Number(paygate[0]?.total || 0), count: Number(paygate[0]?.count || 0) },
        bankMatched: { total: Number(bankMatched[0]?.total || 0), count: Number(bankMatched[0]?.count || 0) },
        bankUnmatched: { total: Number(bankUnmatched[0]?.total || 0), count: Number(bankUnmatched[0]?.count || 0) },
        agentCashIn: { total: Number(agentCashIn[0]?.total || 0), count: Number(agentCashIn[0]?.count || 0) },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ===== ESCROW & PAYOUT ENDPOINTS =====

/**
 * POST /api/payments/webhook/paygate-escrow
 * PayGate settlement for task escrow — requires valid PayGate CHECKSUM.
 */
router.post("/webhook/paygate-escrow", async (req: Request, res: Response) => {
  const sendOk = () => res.status(200).send("OK");

  try {
    const callbackData = { ...(req.body || {}) };
    const result = await processPaymentCallback(callbackData);

    if (result.status !== "successful") {
      return res.status(400).json({ error: "Payment not successful", reference: result.reference });
    }

    const ref = result.reference;

    const existingEscrow = await Escrow.findOne({ paymentReference: ref });
    if (existingEscrow) {
      return sendOk();
    }

    const payment = await Payment.findOne({ reference: ref });
    if (!payment) {
      logger.warn("Escrow webhook: unknown payment reference", { ref });
      return res.status(400).json({ error: "Unknown payment reference" });
    }

    const meta = (payment.metadata || {}) as {
      escrowTaskId?: string;
      runnerId?: string;
      paymentMethod?: string;
    };
    const taskId = meta.escrowTaskId;
    if (!taskId) {
      logger.warn("Escrow webhook: payment is not an escrow payment", { ref });
      return res.status(400).json({ error: "Not an escrow payment" });
    }

    const task = await Task.findById(taskId).select("client runner escrowed").lean();
    if (!task) {
      return res.status(400).json({ error: "Task not found" });
    }

    const clientId = String(payment.user);
    const runnerId = meta.runnerId || (task.runner ? String(task.runner) : "");
    if (!runnerId) {
      return res.status(400).json({ error: "Runner not assigned for escrow" });
    }

    if (String(task.client) !== clientId) {
      return res.status(400).json({ error: "Payment user does not match task client" });
    }

    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    const escrow = await payoutService.createEscrow(
      taskId,
      clientId,
      runnerId,
      amount,
      "ZAR",
      ref,
      meta.paymentMethod || "card"
    );

    await payoutService.markPaymentSettled(escrow._id.toString(), ref);

    if (!task.escrowed) {
      await Task.findByIdAndUpdate(taskId, { escrowed: true });
    }

    payment.status = "successful";
    await payment.save();

    await AuditLog.create({
      user: clientId,
      action: "payment_settled",
      resource: "escrow",
      resourceId: escrow._id,
      metadata: { amount, reference: ref, taskId },
    });

    return sendOk();
  } catch (error: any) {
    logger.error("PayGate escrow webhook failed", { error: error.message });
    return res.status(400).send("INVALID");
  }
});

/**
 * GET /api/payments/escrow/:escrowId
 * Get escrow status (client, runner, or admin can view)
 */
router.get("/escrow/:escrowId", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { escrowId } = req.params;
    const userId = req.user!._id;

    const escrow = await Escrow.findById(escrowId)
      .populate("task", "title status")
      .populate("client", "name email")
      .populate("runner", "name email");

    if (!escrow) {
      throw new AppError("Escrow not found", 404);
    }

    // Authorization check
    if (
      escrow.client.toString() !== userId.toString() &&
      escrow.runner.toString() !== userId.toString() &&
      !(req.user as any).role?.includes("admin")
    ) {
      throw new AppError("Unauthorized", 403);
    }

    const ledger = await LedgerEntry.find({ escrow: escrowId }).sort({ createdAt: 1 });

    res.status(200).json({ escrow, ledger });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
    } else {
      res.status(500).json({ error: "Escrow inquiry failed" });
    }
  }
});

/**
 * POST /api/payments/escrow/:escrowId/release
 * Admin: Release escrow after task completion
 */
router.post(
  "/escrow/:escrowId/release",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      // Check admin role
      if (!(req.user as any).role?.includes("admin")) {
        throw new AppError("Admin access required", 403);
      }

      const { escrowId } = req.params;
      const { reason } = req.body;

      const escrow = await payoutService.releaseEscrow(
        escrowId,
        reason || "manual_release"
      );

      // Log audit
      await AuditLog.create({
        user: req.user!._id,
        action: "escrow_released",
        resource: "escrow",
        resourceId: escrowId,
        metadata: { reason, runnersNet: escrow.runnersNet },
      });

      res.status(200).json({
        success: true,
        message: "Escrow released",
        escrow,
      });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
      } else {
        res.status(500).json({ error: "Release failed" });
      }
    }
  }
);

/**
 * POST /api/payments/payout/:escrowId/initiate
 * Admin: Initiate FNB payout to runner
 */
router.post(
  "/payout/:escrowId/initiate",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!(req.user as any).role?.includes("admin")) {
        throw new AppError("Admin access required", 403);
      }

      const { escrowId } = req.params;
      const escrow = await payoutService.initiatePayout(escrowId);

      await AuditLog.create({
        user: req.user!._id,
        action: "payout_initiated",
        resource: "escrow",
        resourceId: escrowId,
        metadata: {
          fnbInstructionId: escrow.fnbInstructionId,
          amount: escrow.runnersNet,
        },
      });

      res.status(200).json({
        success: true,
        message: "Payout initiated via FNB",
        escrow,
      });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
      } else {
        res.status(500).json({ error: "Payout initiation failed" });
      }
    }
  }
);

/**
 * GET /api/payments/payout/:escrowId/status
 * Admin: Poll FNB payout status
 */
router.get(
  "/payout/:escrowId/status",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!(req.user as any).role?.includes("admin")) {
        throw new AppError("Admin access required", 403);
      }

      const { escrowId } = req.params;
      const escrow = await payoutService.pollPayoutStatus(escrowId);

      res.status(200).json({
        success: true,
        fnbStatus: escrow.fnbStatus,
        escrow,
      });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
      } else {
        res.status(500).json({ error: "Status check failed" });
      }
    }
  }
);

/**
 * POST /api/payments/escrow/:escrowId/refund
 * Admin: Refund escrow
 */
router.post(
  "/escrow/:escrowId/refund",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!(req.user as any).role?.includes("admin")) {
        throw new AppError("Admin access required", 403);
      }

      const { escrowId } = req.params;
      const { reason } = req.body;
      const escrow = await payoutService.refundEscrow(escrowId, reason || "manual_refund");

      await AuditLog.create({
        user: req.user!._id,
        action: "escrow_refunded",
        resource: "escrow",
        resourceId: escrowId,
        metadata: { reason, refundAmount: escrow.totalHeld - escrow.fees.bookingFee },
      });

      res.status(200).json({
        success: true,
        message: "Escrow refunded",
        escrow,
      });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ error: err.message });
      } else {
        res.status(500).json({ error: "Refund failed" });
      }
    }
  }
);

/**
 * GET /api/payments/reconciliation/balance
 * Admin: FNB merchant account balance
 */
router.get(
  "/reconciliation/balance",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!(req.user as any).role?.includes("admin")) {
        throw new AppError("Admin access required", 403);
      }

      const balance = await fnbService.getAccountBalance();

      res.status(200).json({
        balance,
        currency: "ZAR",
        timestamp: new Date(),
      });
    } catch (err) {
      res.status(500).json({ error: "Balance fetch failed" });
    }
  }
);

/**
 * GET /api/payments/stats/summary
 * Admin: Escrow dashboard stats
 */
router.get(
  "/stats/summary",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!(req.user as any).role?.includes("admin")) {
        throw new AppError("Admin access required", 403);
      }

      const totalHeld = await Escrow.aggregate([
        { $match: { status: "held" } },
        { $group: { _id: null, total: { $sum: "$totalHeld" } } },
      ]);

      const pendingPayouts = await Escrow.countDocuments({
        status: "released",
        fnbStatus: { $in: ["pending", "processing"] },
      });

      const failedPayouts = await Escrow.countDocuments({
        fnbStatus: "failed",
      });

      res.status(200).json({
        totalHeld: totalHeld[0]?.total || 0,
        pendingPayouts,
        failedPayouts,
        timestamp: new Date(),
      });
    } catch (err) {
      res.status(500).json({ error: "Stats fetch failed" });
    }
  }
);

export default router;
