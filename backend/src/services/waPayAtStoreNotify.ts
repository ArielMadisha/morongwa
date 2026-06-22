import WaConversationState from "../data/models/WaConversationState";
import User from "../data/models/User";
import { logger } from "./monitoring";
import {
  buildPayAtStoreConfirmCaption,
  sendWaPayAtStoreQrMessage,
} from "./waPayAtStoreMessaging";

const WA_WALLET_SCOPE = "wallet";
const WA_PAY_AT_STORE_CONFIRM_STEP = "pay_at_store_confirm";
const WA_WALLET_INACTIVITY_TIMEOUT_MIN = 3;
const FRONTEND_URL = process.env.FRONTEND_URL || "https://www.qwertymates.com";

async function upsertWaWalletConfirmState(
  userId: string,
  payload: Record<string, unknown>
): Promise<void> {
  await WaConversationState.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        scope: WA_WALLET_SCOPE,
        step: WA_PAY_AT_STORE_CONFIRM_STEP,
        payload,
        expiresAt: new Date(Date.now() + WA_WALLET_INACTIVITY_TIMEOUT_MIN * 60 * 1000),
      },
    },
    { upsert: true, new: true }
  );
}

/** Push payer to confirm a store scan charge on WhatsApp (mirrors web wallet pending payment). */
export async function notifyWaPayAtStorePaymentRequest(params: {
  payerId: string;
  paymentRequestId: string;
  amount: number;
  merchantName: string;
}): Promise<void> {
  const { payerId, paymentRequestId, amount, merchantName } = params;
  const user = await User.findById(payerId).select("phone").lean();
  const phone = String((user as any)?.phone || "").trim();
  if (!phone) return;

  const walletUrl = `${FRONTEND_URL.replace(/\/$/, "")}/wallet?pendingPayment=${paymentRequestId}`;

  try {
    await upsertWaWalletConfirmState(payerId, {
      paymentRequestId,
      amount,
      merchantName,
    });
    const caption = [
      buildPayAtStoreConfirmCaption(merchantName, amount),
      "",
      `Or confirm on the web: ${walletUrl}`,
    ].join("\n");
    const sent = await sendWaPayAtStoreQrMessage(phone, payerId, caption);
    if (!sent) {
      logger.warn("notifyWaPayAtStorePaymentRequest: QR message not sent", { payerId });
    }
  } catch (e) {
    logger.warn("notifyWaPayAtStorePaymentRequest failed (non-fatal)", {
      error: String((e as any)?.message || e),
      payerId,
    });
  }
}
