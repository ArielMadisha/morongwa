// PayGate payment gateway integration service
import crypto from "crypto";
import axios from "axios";
import { logger } from "./monitoring";

interface PaymentRequest {
  amount: number;
  reference: string;
  email: string;
  returnUrl: string;
  notifyUrl: string;
  /** PayVault: request tokenization (VAULT=1) */
  vault?: boolean;
  /** PayVault: use existing token for payment (user enters CVV only) */
  vaultId?: string;
}

interface PaymentResponse {
  success: boolean;
  paymentUrl?: string;
  transactionId?: string;
  error?: string;
}

function isLocalHostUrl(raw?: string): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1";
  } catch {
    return /localhost|127\.0\.0\.1|::1/i.test(raw);
  }
}

export function getCardPaymentConfigIssues(): string[] {
  const issues: string[] = [];
  const frontendUrl = process.env.FRONTEND_URL || "";
  const backendUrl = process.env.BACKEND_URL || "";
  if (isLocalHostUrl(frontendUrl)) {
    issues.push("FRONTEND_URL points to localhost");
  }
  if (isLocalHostUrl(backendUrl)) {
    issues.push("BACKEND_URL points to localhost");
  }
  return issues;
}

export const initiatePayment = async (request: PaymentRequest): Promise<PaymentResponse> => {
  try {
    const configIssues = getCardPaymentConfigIssues();
    if (configIssues.length > 0) {
      return {
        success: false,
        error: `Card payments blocked: ${configIssues.join(
          ", "
        )}. Use public tunnel URLs (ngrok/cloudflare) and whitelist RETURN_URL/NOTIFY_URL in PayGate.`,
      };
    }

    const paygateId = process.env.PAYGATE_ID || "";
    const paygateSecret = process.env.PAYGATE_SECRET || "";
    const configuredUrl = process.env.PAYGATE_URL || "https://secure.paygate.co.za/payweb3/process.trans";
    const paygateInitiateUrl = configuredUrl.includes("process.trans")
      ? configuredUrl.replace("process.trans", "initiate.trans")
      : configuredUrl;
    const paygateProcessUrl = configuredUrl.includes("initiate.trans")
      ? configuredUrl.replace("initiate.trans", "process.trans")
      : configuredUrl;

    const data: Record<string, string | number> = {
      PAYGATE_ID: paygateId,
      REFERENCE: request.reference,
      AMOUNT: Math.round(request.amount * 100), // Amount in cents
      CURRENCY: "ZAR",
      RETURN_URL: request.returnUrl,
      TRANSACTION_DATE: new Date().toISOString().split("T")[0].replace(/-/g, ""),
      LOCALE: "en-za",
      COUNTRY: "ZAF",
      EMAIL: request.email,
      NOTIFY_URL: request.notifyUrl,
    };
    if (request.vault) data.VAULT = "1";
    if (request.vaultId) data.VAULT_ID = request.vaultId;

    const checksum = generateChecksum({ ...data, ENCRYPTION_KEY: paygateSecret });
    const payload = { ...data, CHECKSUM: checksum };

    const response = await axios.post(paygateInitiateUrl, new URLSearchParams(payload as any).toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const responseData = new URLSearchParams(response.data);
    const transactionId = responseData.get("PAY_REQUEST_ID");
    const responseChecksum = responseData.get("CHECKSUM");

    if (!transactionId || !responseChecksum) {
      throw new Error("Invalid response from PayGate");
    }

    const paymentUrl = `${paygateProcessUrl}?PAY_REQUEST_ID=${transactionId}&CHECKSUM=${responseChecksum}`;

    logger.info("Payment initiated", { reference: request.reference, transactionId });

    return {
      success: true,
      paymentUrl,
      transactionId,
    };
  } catch (error: any) {
    logger.error("Payment initiation failed:", error);
    const status = error?.response?.status;
    const responseBody = typeof error?.response?.data === "string" ? error.response.data : "";
    const hint =
      status === 403
        ? "PayGate rejected the request (403). Ensure credentials are live/valid and RETURN_URL/NOTIFY_URL are publicly reachable/whitelisted."
        : "";
    return {
      success: false,
      error: hint || error.message || "Payment initiation failed",
    };
  }
};

export const verifyWebhookSignature = (
  data: Record<string, any>,
  receivedChecksum: string
): boolean => {
  const paygateSecret = process.env.PAYGATE_SECRET || "";
  const calculatedChecksum = generateChecksum({ ...data, ENCRYPTION_KEY: paygateSecret });
  return calculatedChecksum === receivedChecksum;
};

const generateChecksum = (data: Record<string, any>): string => {
  const keys = Object.keys(data).sort();
  const values = keys.map((key) => data[key]).join("");
  return crypto.createHash("md5").update(values).digest("hex");
};

export interface PaymentCallbackResult {
  success: boolean;
  reference: string;
  status: string;
  vaultId?: string;
  payvaultData1?: string;
  payvaultData2?: string;
  payMethodDetail?: string;
}

export const processPaymentCallback = async (
  callbackData: Record<string, any>
): Promise<PaymentCallbackResult> => {
  try {
    const checksum = callbackData.CHECKSUM;
    delete callbackData.CHECKSUM;

    if (!verifyWebhookSignature(callbackData, checksum)) {
      throw new Error("Invalid webhook signature");
    }

    const status = callbackData.TRANSACTION_STATUS === "1" ? "successful" : "failed";

    logger.info("Payment callback processed", {
      reference: callbackData.REFERENCE,
      status,
    });

    const result: PaymentCallbackResult = {
      success: true,
      reference: callbackData.REFERENCE,
      status,
    };
    if (callbackData.VAULT_ID) result.vaultId = callbackData.VAULT_ID;
    if (callbackData.PAYVAULT_DATA_1) result.payvaultData1 = callbackData.PAYVAULT_DATA_1;
    if (callbackData.PAYVAULT_DATA_2) result.payvaultData2 = callbackData.PAYVAULT_DATA_2;
    if (callbackData.PAY_METHOD_DETAIL) result.payMethodDetail = callbackData.PAY_METHOD_DETAIL;
    return result;
  } catch (error: any) {
    logger.error("Payment callback processing failed:", error);
    throw error;
  }
};
