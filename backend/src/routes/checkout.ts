import express, { Response } from "express";
import Cart from "../data/models/Cart";
import Order from "../data/models/Order";
import Product from "../data/models/Product";
import Song from "../data/models/Song";
import Supplier from "../data/models/Supplier";
import ResellerWall from "../data/models/ResellerWall";
import Wallet from "../data/models/Wallet";
import Payment from "../data/models/Payment";
import MusicPurchase from "../data/models/MusicPurchase";
import User from "../data/models/User";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { initiatePayment } from "../services/payment";
import { ADMIN_PRODUCT_COMMISSION_PCT } from "../config/fees.config";
import { notifyOrderPaid } from "../services/orderNotification";
import { forwardOrderToExternalSupplier } from "../services/orderForwardingService";
import { getFxRates, convertUsdTo } from "../services/fxService";

const MUSIC_PLATFORM_COMMISSION_PCT = 30;
const MUSIC_OWNER_SHARE_PCT = 70;

const router = express.Router();

const DEFAULT_SHIPPING_PER_SUPPLIER = 100; // R100 flat rate for South African (internal) suppliers only

function getEffectivePrice(product: { price: number; discountPrice?: number }): number {
  const p = product as any;
  if (p.discountPrice != null && p.discountPrice >= 0 && p.discountPrice < p.price) return p.discountPrice;
  return p.price;
}

function getProductPriceForQty(product: any, qty: number): number {
  const tiers = product?.bulkTiers;
  if (Array.isArray(tiers) && tiers.length > 0) {
    const tier = tiers
      .filter((t: any) => qty >= t.minQty && qty <= t.maxQty)
      .sort((a: any, b: any) => b.minQty - a.minQty)[0];
    if (tier && tier.price >= 0) return Number(tier.price);
  }
  return getEffectivePrice(product);
}

/** Convert product price to ZAR for checkout. ACBPayWallet/PayGate require ZAR. */
async function toZAR(amount: number, currency: string): Promise<number> {
  if (!currency || currency === "ZAR") return amount;
  if (currency === "USD") {
    const { rates } = await getFxRates();
    return convertUsdTo(amount, "ZAR", rates);
  }
  return amount;
}

// Get reseller commission for a product from wall (3-7%)
async function getResellerCommissionPct(resellerId: string, productId: string): Promise<number | null> {
  const wall = await ResellerWall.findOne({ resellerId });
  if (!wall) return null;
  const wp = (wall.products as any[]).find((p) => (p.productId as any).toString() === productId);
  return wp?.resellerCommissionPct ?? null;
}

/** Normalize country to ISO code (e.g. "South Africa" -> "ZA"). */
function toCountryCode(v: string | undefined): string {
  if (!v || typeof v !== "string") return "ZA";
  const u = v.trim().toUpperCase();
  if (u.length === 2) return u;
  const map: Record<string, string> = {
    "SOUTH AFRICA": "ZA", ZA: "ZA",
    "BOTSWANA": "BW", BW: "BW",
    "NAMIBIA": "NA", NA: "NA",
    "LESOTHO": "LS", LS: "LS",
    "ESWATINI": "SZ", "SWAZILAND": "SZ", SZ: "SZ",
    "ZIMBABWE": "ZW", ZW: "ZW",
    "ZAMBIA": "ZM", ZM: "ZM",
  };
  return map[u] ?? map[v.trim()] ?? "ZA";
}

// Get checkout quote from current cart (products + music)
router.post("/quote", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const deliveryCountry = toCountryCode(req.body?.deliveryCountry);
    const cart = await Cart.findOne({ user: req.user!._id });
    const hasProducts = cart && cart.items && cart.items.length > 0;
    const hasMusic = cart && cart.musicItems && cart.musicItems.length > 0;
    if (!cart || (!hasProducts && !hasMusic)) {
      throw new AppError("Cart is empty", 400);
    }

    const productIds = (cart.items || []).map((i) => i.productId);
    const products = productIds.length > 0
      ? await Product.find({ _id: { $in: productIds }, active: true })
          .populate("supplierId", "shippingCost storeName")
          .lean()
      : [];
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    const uniqueSupplierIds = new Set<string>();
    const uniqueExternalSupplierIds = new Set<string>();
    for (const item of cart.items || []) {
      const product = productMap.get((item.productId as any).toString());
      if (product) {
        const src = (product as any).supplierSource;
        if (src && src !== "internal") {
          const extId = (product as any).externalSupplierId?.toString();
          if (extId) uniqueExternalSupplierIds.add(extId);
        } else {
          const sid = (product as any).supplierId?._id ?? (product as any).supplierId;
          if (sid) uniqueSupplierIds.add(sid.toString());
        }
      }
    }

    const supplierIds = Array.from(uniqueSupplierIds);
    const suppliers = supplierIds.length > 0
      ? await Supplier.find({ _id: { $in: supplierIds } }).select("shippingCost storeName").lean()
      : [];
    const supplierMap = new Map(suppliers.map((s) => [s._id.toString(), s]));
    const externalSuppliers = uniqueExternalSupplierIds.size > 0
      ? await (await import("../data/models/ExternalSupplier")).default
          .find({ _id: { $in: Array.from(uniqueExternalSupplierIds) } })
          .select("shippingCost source")
          .lean()
      : [];
    const externalSupplierMap = new Map(externalSuppliers.map((s: any) => [s._id.toString(), s]));

    // CJ products: get real freight from CJ API (no flat fallback)
    const cjProductItems: Array<{ product: any; qty: number }> = [];
    for (const item of cart.items || []) {
      const product = productMap.get((item.productId as any).toString());
      if (product && (product as any).supplierSource === "cj") {
        const vid = (product as any).externalData?.variants?.[0]?.vid;
        if (!vid) throw new AppError(`Product "${(product as any).title}" is missing variant data for shipping. Please contact support.`, 400);
        cjProductItems.push({ product, qty: item.qty });
      }
    }

    let shipping = 0;
    let cjShippingZar = 0;
    for (const sid of supplierIds) {
      const s = supplierMap.get(sid);
      shipping += (s as any)?.shippingCost ?? DEFAULT_SHIPPING_PER_SUPPLIER;
    }
    if (cjProductItems.length > 0) {
      const { getCJAdapter } = await import("../services/suppliers/supplierService");
      const cjAdapter = await getCJAdapter();
      if (!cjAdapter?.getFreightQuote) {
        throw new AppError("CJ freight calculation is not available. Please try again later.", 503);
      }
      const freightReq = {
        startCountryCode: "CN",
        endCountryCode: deliveryCountry,
        products: cjProductItems.map(({ product, qty }) => ({
          vid: (product as any).externalData?.variants?.[0]?.vid,
          quantity: qty,
        })),
      };
      const freightResult = await cjAdapter.getFreightQuote(freightReq);
      if (!freightResult) {
        throw new AppError("Unable to get shipping cost for imported products. Please try again or contact support.", 503);
      }
      const { rates } = await getFxRates();
      cjShippingZar = Math.round(convertUsdTo(freightResult.logisticPrice, "ZAR", rates));
      shipping += cjShippingZar;
    }
    for (const extId of uniqueExternalSupplierIds) {
      const ext = externalSupplierMap.get(extId);
      if ((ext as any)?.source === "cj") continue; // already handled above
      const cost = (ext as any)?.shippingCost;
      if (cost != null && cost >= 0) shipping += cost;
      else throw new AppError("External supplier shipping cost not configured. Please contact support.", 400);
    }

    let subtotal = 0;
    let commissionTotal = 0;
    const breakdown: Array<{ productId?: string; songId?: string; title: string; price: number; qty: number; type?: string }> = [];

    for (const item of cart.items || []) {
      const product = productMap.get((item.productId as any).toString());
      if (!product) continue;
      const effectivePriceRaw = getProductPriceForQty(product, item.qty);
      const productCurrency = (product as any).currency || "ZAR";
      const effectivePrice = await toZAR(effectivePriceRaw, productCurrency);
      let sellingPrice = effectivePrice;
      if (item.resellerId && (product as any).allowResell) {
        const resellerCommissionPct = await getResellerCommissionPct((item.resellerId as any).toString(), (item.productId as any).toString());
        if (resellerCommissionPct != null) {
          sellingPrice = Math.round(effectivePrice * (1 + resellerCommissionPct / 100) * 100) / 100;
          commissionTotal += (effectivePrice * resellerCommissionPct) / 100 * item.qty;
        }
      }
      const linePrice = sellingPrice * item.qty;
      subtotal += linePrice;
      breakdown.push({
        productId: (product as any)._id.toString(),
        title: (product as any).title ?? "Product",
        price: sellingPrice,
        qty: item.qty,
      });
    }

    for (const item of cart.musicItems || []) {
      const song = await Song.findById(item.songId).lean();
      if (!song || !(song as any).downloadEnabled) continue;
      const price = Number((song as any).downloadPrice ?? 10);
      const linePrice = price * item.qty;
      subtotal += linePrice;
      breakdown.push({
        songId: (song as any)._id.toString(),
        title: `${(song as any).title ?? "Song"}${(song as any).artist ? ` - ${(song as any).artist}` : ""}`,
        price,
        qty: item.qty,
        type: "music",
      });
    }

    const total = subtotal + shipping;

    // Build shipping breakdown (delivery only; no collection)
    const shippingBreakdown: Array<{ supplierId: string; storeName: string; shippingCost: number }> = [];
    for (const sid of supplierIds) {
      const s = supplierMap.get(sid);
      shippingBreakdown.push({
        supplierId: sid,
        storeName: (s as any)?.storeName ?? "Supplier",
        shippingCost: (s as any)?.shippingCost ?? DEFAULT_SHIPPING_PER_SUPPLIER,
      });
    }
    if (cjShippingZar > 0) {
      shippingBreakdown.push({ supplierId: "cj", storeName: "CJ / Dropship", shippingCost: cjShippingZar });
    }
    for (const extId of uniqueExternalSupplierIds) {
      if ((externalSupplierMap.get(extId) as any)?.source === "cj") continue;
      const ext = externalSupplierMap.get(extId);
      const cost = (ext as any)?.shippingCost ?? 0;
      shippingBreakdown.push({ supplierId: extId, storeName: "Dropship", shippingCost: cost });
    }

    res.json({
      data: {
        subtotal,
        shipping,
        shippingBreakdown,
        commissionTotal,
        total,
        currency: "ZAR",
        itemCount: (cart.items?.length ?? 0) + (cart.musicItems?.length ?? 0),
        paymentBreakdown: breakdown,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Create order and pay (wallet or card)
router.post("/pay", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { paymentMethod, deliveryAddress, deliveryCountry: rawCountry } = req.body;
    const deliveryCountry = toCountryCode(rawCountry);
    if (!paymentMethod || !["wallet", "card"].includes(paymentMethod)) {
      throw new AppError("paymentMethod must be 'wallet' or 'card'", 400);
    }
    const cart = await Cart.findOne({ user: req.user!._id });
    const hasProducts = cart && cart.items && cart.items.length > 0;
    const hasMusic = cart && cart.musicItems && cart.musicItems.length > 0;
    if (!cart || (!hasProducts && !hasMusic)) {
      throw new AppError("Cart is empty", 400);
    }
    if (hasProducts && !String(deliveryAddress || "").trim()) {
      throw new AppError("Delivery address is required", 400);
    }

    const productIds = (cart.items || []).map((i) => i.productId);
    const products = productIds.length > 0
      ? await Product.find({ _id: { $in: productIds }, active: true })
          .populate("supplierId", "userId shippingCost")
          .lean()
      : [];
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    const uniqueSupplierIds = new Set<string>();
    const uniqueExternalSupplierIdsPay = new Set<string>();
    for (const item of cart.items || []) {
      const product = productMap.get((item.productId as any).toString());
      if (product) {
        const src = (product as any).supplierSource;
        if (src && src !== "internal") {
          const extId = (product as any).externalSupplierId?.toString();
          if (extId) uniqueExternalSupplierIdsPay.add(extId);
        } else {
          const sid = (product as any).supplierId?._id ?? (product as any).supplierId;
          if (sid) uniqueSupplierIds.add(sid.toString());
        }
      }
    }
    const suppliers = uniqueSupplierIds.size > 0
      ? await Supplier.find({ _id: { $in: Array.from(uniqueSupplierIds) } }).select("shippingCost").lean()
      : [];
    const supplierMap = new Map(suppliers.map((s) => [s._id.toString(), s]));
    const externalSuppliersPayData = uniqueExternalSupplierIdsPay.size > 0
      ? await (await import("../data/models/ExternalSupplier")).default
          .find({ _id: { $in: Array.from(uniqueExternalSupplierIdsPay) } })
          .select("shippingCost source")
          .lean()
      : [];
    const externalSupplierMapPay = new Map(externalSuppliersPayData.map((s: any) => [s._id.toString(), s]));

    const cjProductItemsPay: Array<{ product: any; qty: number }> = [];
    for (const item of cart.items || []) {
      const product = productMap.get((item.productId as any).toString());
      if (product && (product as any).supplierSource === "cj") {
        const vid = (product as any).externalData?.variants?.[0]?.vid;
        if (!vid) throw new AppError(`Product "${(product as any).title}" is missing variant data for shipping. Please contact support.`, 400);
        cjProductItemsPay.push({ product, qty: item.qty });
      }
    }

    let shipping = 0;
    let cjShippingZarPay = 0;
    for (const sid of uniqueSupplierIds) {
      const s = supplierMap.get(sid);
      shipping += (s as any)?.shippingCost ?? DEFAULT_SHIPPING_PER_SUPPLIER;
    }
    if (cjProductItemsPay.length > 0) {
      const { getCJAdapter } = await import("../services/suppliers/supplierService");
      const cjAdapter = await getCJAdapter();
      if (!cjAdapter?.getFreightQuote) {
        throw new AppError("CJ freight calculation is not available. Please try again later.", 503);
      }
      const freightReq = {
        startCountryCode: "CN",
        endCountryCode: deliveryCountry,
        products: cjProductItemsPay.map(({ product, qty }) => ({
          vid: (product as any).externalData?.variants?.[0]?.vid,
          quantity: qty,
        })),
      };
      const freightResult = await cjAdapter.getFreightQuote(freightReq);
      if (!freightResult) {
        throw new AppError("Unable to get shipping cost for imported products. Please try again or contact support.", 503);
      }
      const { rates } = await getFxRates();
      cjShippingZarPay = Math.round(convertUsdTo(freightResult.logisticPrice, "ZAR", rates));
      shipping += cjShippingZarPay;
    }
    for (const extId of uniqueExternalSupplierIdsPay) {
      const ext = externalSupplierMapPay.get(extId);
      if ((ext as any)?.source === "cj") continue;
      const cost = (ext as any)?.shippingCost;
      if (cost != null && cost >= 0) shipping += cost;
      else throw new AppError("External supplier shipping cost not configured. Please contact support.", 400);
    }

    const orderItems: Array<{
      productId: any;
      qty: number;
      price: number;
      resellerId?: any;
      commissionPct?: number;
      commissionValue?: number;
    }> = [];
    let subtotal = 0;
    let commissionTotal = 0;
    let supplierId: any = null;

    for (const item of cart.items || []) {
      const product = productMap.get((item.productId as any).toString());
      if (!product) throw new AppError(`Product not found: ${item.productId}`, 400);
      const supplierSource = (product as any).supplierSource;
      if (supplierSource === "internal" || !supplierSource) {
        if ((product as any).outOfStock) {
          throw new AppError(`Product ${(product as any).title} is out of stock`, 400);
        }
        if ((product as any).stock < item.qty) {
          throw new AppError(`Insufficient stock for ${(product as any).title}`, 400);
        }
      }
      if (!supplierId) supplierId = (product as any).supplierId?._id ?? (product as any).supplierId ?? (product as any).externalSupplierId;
      const priceRaw = getProductPriceForQty(product as any, item.qty);
      const productCurrency = (product as any).currency || "ZAR";
      let price = await toZAR(priceRaw, productCurrency);
      let commissionPct: number | undefined;
      if (item.resellerId && (product as any).allowResell) {
        const pct = await getResellerCommissionPct((item.resellerId as any).toString(), (item.productId as any).toString());
        if (pct != null) {
          commissionPct = pct;
          price = Math.round(price * (1 + pct / 100) * 100) / 100;
        }
      }
      const lineTotal = price * item.qty;
      subtotal += lineTotal;
      let commissionValue = 0;
      if (commissionPct != null) {
        const effectiveBase = getProductPriceForQty(product as any, item.qty);
        commissionValue = (effectiveBase * item.qty * commissionPct) / 100;
        commissionTotal += commissionValue;
      }
      orderItems.push({
        productId: product._id,
        qty: item.qty,
        price,
        resellerId: item.resellerId,
        commissionPct,
        commissionValue,
      });
    }

    let musicSubtotal = 0;
    const musicPurchaseItems: Array<{ songId: any; qty: number; price: number }> = [];
    for (const item of cart.musicItems || []) {
      const song = await Song.findById(item.songId).lean();
      if (!song) throw new AppError(`Song not found: ${item.songId}`, 400);
      if (!(song as any).downloadEnabled) throw new AppError(`Downloads not enabled for ${(song as any).title}`, 400);
      if (String((song as any).userId) === String(req.user!._id)) {
        throw new AppError(`You cannot purchase your own song: ${(song as any).title}`, 400);
      }
      const price = Number((song as any).downloadPrice ?? 10);
      musicSubtotal += price * item.qty;
      musicPurchaseItems.push({ songId: song._id, qty: item.qty, price });
    }

    const total = subtotal + musicSubtotal + shipping;

    const shippingBreakdownForOrder: Array<{ storeName: string; shippingCost: number }> = [];
    for (const sid of uniqueSupplierIds) {
      const s = supplierMap.get(sid);
      shippingBreakdownForOrder.push({
        storeName: (s as any)?.storeName ?? "Supplier",
        shippingCost: (s as any)?.shippingCost ?? DEFAULT_SHIPPING_PER_SUPPLIER,
      });
    }
    if (cjShippingZarPay > 0) {
      shippingBreakdownForOrder.push({ storeName: "CJ / Dropship", shippingCost: cjShippingZarPay });
    }
    for (const extId of uniqueExternalSupplierIdsPay) {
      if ((externalSupplierMapPay.get(extId) as any)?.source === "cj") continue;
      const ext = externalSupplierMapPay.get(extId);
      shippingBreakdownForOrder.push({ storeName: "Dropship", shippingCost: (ext as any)?.shippingCost ?? 0 });
    }

    const paymentBreakdownForOrder = {
      items: orderItems.map((oi) => {
        const p = productMap.get((oi.productId as any).toString());
        return { title: (p as any)?.title ?? "Product", price: oi.price, qty: oi.qty };
      }).concat(musicPurchaseItems.map((m) => ({
        title: "Music download",
        price: m.price,
        qty: m.qty,
      }))),
      shippingBreakdown: shippingBreakdownForOrder,
    };

    let order: any = null;
    if (orderItems.length > 0) {
    order = await Order.create({
      buyerId: req.user!._id,
      supplierId,
      status: "pending_payment",
      items: orderItems,
      musicItems: musicPurchaseItems.map((m) => ({ songId: m.songId, qty: m.qty, price: m.price })),
      amounts: {
        subtotal,
        shipping,
        commissionTotal,
        platformFee: 0,
        total,
        currency: "ZAR",
        shippingBreakdown: shippingBreakdownForOrder,
      },
      paymentBreakdown: paymentBreakdownForOrder,
      delivery: {
        method: "courier",
        address: String(deliveryAddress || "").trim(),
        countryCode: deliveryCountry,
      },
      paymentMethod,
    });
    }

    if (paymentMethod === "wallet") {
      let wallet = await Wallet.findOne({ user: req.user!._id });
      if (!wallet) wallet = await Wallet.create({ user: req.user!._id });
      if (wallet.balance < total) {
        if (order) await Order.findByIdAndUpdate(order._id, { status: "cancelled" });
        throw new AppError("Insufficient wallet balance", 400);
      }
      const ref = order ? `ORDER-${order._id}` : `MUSIC-${Date.now()}`;
      wallet.balance -= total;
      wallet.transactions.push({
        type: "debit",
        amount: -total,
        reference: ref,
        createdAt: new Date(),
      });
      await wallet.save();

      if (order) {
        order.status = "paid";
        order.paidAt = new Date();
        order.paymentReference = `WALLET-${order._id}`;
        await order.save();
        await notifyOrderPaid({
          orderId: order._id.toString(),
          buyerId: req.user!._id.toString(),
          items: order.items.map((it: { productId: unknown; qty: number }) => ({
            productId: (it.productId as any).toString(),
            qty: it.qty,
          })),
        });
        forwardOrderToExternalSupplier(order._id.toString()).catch((err) =>
          console.error("Order forward to external supplier failed:", err)
        );
      }

      for (const m of musicPurchaseItems) {
        const song = await Song.findById(m.songId).lean();
        if (!song) continue;
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminUser = adminEmail ? await User.findOne({ email: adminEmail }).select("_id") : null;
        if (!adminUser?._id) continue;
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
          buyerId: req.user!._id,
          ownerId: (song as any).userId,
          amount: m.price * m.qty,
          adminCommission,
          ownerShare,
          reference,
        });
      }

      cart.items = [];
      cart.musicItems = [];
      await cart.save();

      return res.json({
        data: {
          orderId: order?._id ?? null,
          status: "paid",
          message: order ? "Order paid with wallet" : "Music purchase complete",
        },
      });
    }

    // Card: create Payment and initiate PayGate
    const mongoose = await import("mongoose");
    const reference = order ? `ORDER-${order._id}` : `MUSIC-${new mongoose.default.Types.ObjectId()}`;
    await Payment.create({
      user: req.user!._id,
      amount: total,
      reference,
      status: "pending",
      ...(order ? {} : { metadata: { musicItems: musicPurchaseItems } }),
    });

    const returnOrderId = order?._id ?? reference;
    const paymentResult = await initiatePayment({
      amount: total,
      reference,
      email: req.user!.email,
      returnUrl: `${process.env.FRONTEND_URL || "http://localhost:3000"}/checkout/return?orderId=${returnOrderId}`,
      notifyUrl: `${process.env.BACKEND_URL || "http://localhost:4000"}/api/payments/webhook`,
    });

    if (!paymentResult.success) {
      throw new AppError(paymentResult.error || "Payment initiation failed", 502);
    }

    cart.items = [];
    cart.musicItems = [];
    await cart.save();

    res.json({
      data: {
        orderId: order?._id ?? null,
        status: "pending_payment",
        paymentUrl: paymentResult.paymentUrl,
        reference,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Get order by ID (buyer only)
router.get("/order/:orderId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate("items.productId", "title slug images price currency")
      .lean();
    if (!order) throw new AppError("Order not found", 404);
    if ((order as any).buyerId.toString() !== req.user!._id.toString()) {
      throw new AppError("Unauthorized", 403);
    }
    res.json({ data: order });
  } catch (err) {
    next(err);
  }
});

export default router;
