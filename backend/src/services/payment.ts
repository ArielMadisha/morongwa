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
}

interface PaymentResponse {
  success: boolean;
  paymentUrl?: string;
  transactionId?: string;
  error?: string;
}

export const initiatePayment = async (request: PaymentRequest): Promise<PaymentResponse> => {
  try {
    const paygateId = process.env.PAYGATE_ID || "";
    const paygateSecret = process.env.PAYGATE_SECRET || "";
    const paygateUrl = process.env.PAYGATE_URL || "https://secure.paygate.co.za/payweb3/process.trans";

    const data = {
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

    const checksum = generateChecksum({ ...data, ENCRYPTION_KEY: paygateSecret });
    const payload = { ...data, CHECKSUM: checksum };

    const response = await axios.post(paygateUrl, new URLSearchParams(payload as any).toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const responseData = new URLSearchParams(response.data);
    const transactionId = responseData.get("PAY_REQUEST_ID");
    const responseChecksum = responseData.get("CHECKSUM");

    if (!transactionId || !responseChecksum) {
      throw new Error("Invalid response from PayGate");
    }

    const paymentUrl = `${paygateUrl}?PAY_REQUEST_ID=${transactionId}&CHECKSUM=${responseChecksum}`;

    logger.info("Payment initiated", { reference: request.reference, transactionId });

    return {
      success: true,
      paymentUrl,
      transactionId,
    };
  } catch (error: any) {
    logger.error("Payment initiation failed:", error);
    return {
      success: false,
      error: error.message || "Payment initiation failed",
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

export const processPaymentCallback = async (
  callbackData: Record<string, any>
): Promise<{ success: boolean; reference: string; status: string }> => {
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

    return {
      success: true,
      reference: callbackData.REFERENCE,
      status,
    };
  } catch (error: any) {
    logger.error("Payment callback processing failed:", error);
    throw error;
  }
};
