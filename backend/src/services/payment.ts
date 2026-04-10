// PayGate payment gateway integration service
import crypto from "crypto";
import axios from "axios";
import { logger } from "./monitoring";

interface PaymentRequest {
  /** Base amount in ZAR (before PayGate flat fee). */
  amount: number;
  reference: string;
  email: string;
  returnUrl: string;
  notifyUrl: string;
  /** PayVault: request tokenization (VAULT=1) */
  vault?: boolean;
  /** PayVault: use existing token for payment (user enters CVV only) */
  vaultId?: string;
  /** When true, do not add PAYGATE_FLAT_FEE_ZAR (rare / tests only). */
  skipPayGateFee?: boolean;
}

interface PaymentResponse {
  success: boolean;
  /** Signed URL on our API that returns HTML and POSTs to PayGate (mobile + web). */
  paymentUrl?: string;
  /** Use CHECKSUM from initiate — POST these fields to processUrl (PayWeb3; GET redirects fail). */
  payGateRedirect?: { processUrl: string; payRequestId: string; checksum: string };
  transactionId?: string;
  error?: string;
  /** ZAR added on top of `amount` for PayGate (default 5). */
  paygateFeeZar?: number;
  /** Total ZAR sent to PayGate (amount + fee). */
  chargedZar?: number;
}

/** Flat ZAR fee added to every PayGate card transaction site-wide (default R5). Set PAYGATE_FLAT_FEE_ZAR=0 to disable. */
export function getPayGateFlatFeeZar(): number {
  const raw = process.env.PAYGATE_FLAT_FEE_ZAR;
  if (raw !== undefined && raw !== "") {
    const v = Number(raw);
    if (Number.isFinite(v) && v >= 0) return Math.round(v * 100) / 100;
  }
  return 5;
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

function coercePublicBaseUrl(raw: string | undefined, fallback: string): string {
  const v = String(raw || "").trim();
  if (!v || isLocalHostUrl(v)) return fallback;
  return v.replace(/\/$/, "");
}

function ensurePublicCallbackUrl(url: string, fallbackBase: string): string {
  const trimmed = String(url || "").trim();
  if (!trimmed) return fallbackBase;
  if (!isLocalHostUrl(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    const base = new URL(fallbackBase);
    const out = `${base.origin}${u.pathname}${u.search}`;
    return out;
  } catch {
    return fallbackBase;
  }
}

function parsePayGateKvBody(rawBody: string): Record<string, string> {
  const out: Record<string, string> = {};
  const chunks = String(rawBody || "")
    .split(/[&\r\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const chunk of chunks) {
    const idx = chunk.indexOf("=");
    if (idx < 0) continue;
    const rawKey = chunk.slice(0, idx).trim();
    const rawValue = chunk.slice(idx + 1).trim();
    if (!rawKey) continue;
    const key = decodeURIComponent(rawKey).toUpperCase();
    const value = decodeURIComponent(rawValue);
    out[key] = value;
  }
  return out;
}

/** PayWeb3 requires POST to process.trans with PAY_REQUEST_ID + CHECKSUM from initiate response (not a new MD5). */
const DEFAULT_PAYGATE_PROCESS_URL = "https://secure.paygate.co.za/payweb3/process.trans";

/** Resolve hosted payment page URL from PAYGATE_URL (defaults to live PayWeb3). */
export function getPayGateProcessUrl(): string {
  const configuredUrl = process.env.PAYGATE_URL || DEFAULT_PAYGATE_PROCESS_URL;
  if (configuredUrl.includes("initiate.trans")) return configuredUrl.replace("initiate.trans", "process.trans");
  if (configuredUrl.includes("process.trans")) return configuredUrl;
  return DEFAULT_PAYGATE_PROCESS_URL;
}

const BRIDGE_TTL_MS = 15 * 60 * 1000;

/** Public URL that loads HTML and auto-POSTs to PayGate (works with Linking.openURL on mobile). */
export function buildPayGateBridgeUrl(
  publicBackendBase: string,
  payRequestId: string,
  checksum: string
): string | null {
  const secret = process.env.PAYGATE_SECRET || "";
  if (!secret || !publicBackendBase?.trim()) return null;
  const exp = Date.now() + BRIDGE_TTL_MS;
  const payload = `${payRequestId}|${checksum}|${exp}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const base = publicBackendBase.replace(/\/$/, "");
  const q = new URLSearchParams({
    payRequestId,
    checksum,
    exp: String(exp),
    sig,
  });
  return `${base}/api/payments/paygate-redirect?${q.toString()}`;
}

export function verifyPayGateBridgeQuery(query: Record<string, unknown>): { ok: true; payRequestId: string; checksum: string } | { ok: false; reason: string } {
  const secret = process.env.PAYGATE_SECRET || "";
  if (!secret) return { ok: false, reason: "PayGate not configured" };
  const payRequestId = String(query.payRequestId || "").trim();
  const checksum = String(query.checksum || "").trim();
  const exp = Number(query.exp);
  const sig = String(query.sig || "").trim();
  if (!payRequestId || !checksum || !sig || !Number.isFinite(exp)) return { ok: false, reason: "Missing parameters" };
  if (Date.now() > exp) return { ok: false, reason: "Link expired" };
  const payload = `${payRequestId}|${checksum}|${exp}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "Invalid signature" };
  } catch {
    return { ok: false, reason: "Invalid signature" };
  }
  return { ok: true, payRequestId, checksum };
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** HTML page that POSTs PAY_REQUEST_ID + CHECKSUM to PayWeb3 process.trans (required; GET query to process.trans fails). */
export function buildPayGateRedirectHtml(processUrl: string, payRequestId: string, checksum: string): string {
  const action = escapeHtmlAttr(processUrl);
  const pr = escapeHtmlAttr(payRequestId);
  const cs = escapeHtmlAttr(checksum);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>PayGate</title></head><body>
<p>Redirecting to PayGate...</p>
<p>If redirect does not start, tap Continue.</p>
<form id="pg" method="post" action="${action}">
<input type="hidden" name="PAY_REQUEST_ID" value="${pr}"/>
<input type="hidden" name="CHECKSUM" value="${cs}"/>
<button type="submit">Continue</button>
</form>
<script>(function(){var f=document.getElementById("pg"); if(!f) return; try{f.submit();}catch(e){} setTimeout(function(){ try{f.submit();}catch(e){} }, 700); })();</script>
</body></html>`;
}

export const initiatePayment = async (request: PaymentRequest): Promise<PaymentResponse> => {
  try {
    const configIssues = getCardPaymentConfigIssues();
    if (configIssues.length > 0) {
      logger.warn("Card payment URLs include localhost; attempting public URL fallback.", {
        issues: configIssues,
      });
    }

    const paygateId = process.env.PAYGATE_ID || "";
    const paygateSecret = process.env.PAYGATE_SECRET || "";
    if (!paygateId || !paygateSecret) {
      return {
        success: false,
        error: "PayGate credentials missing: set PAYGATE_ID and PAYGATE_SECRET for live card payments.",
      };
    }
    const paygateProcessUrl = getPayGateProcessUrl();
    const paygateInitiateUrl = paygateProcessUrl.replace("process.trans", "initiate.trans");
    try {
      const host = new URL(paygateProcessUrl).hostname.toLowerCase();
      if (host.includes("sandbox") || host.includes("test.paygate")) {
        logger.warn("PayGate URL looks non-production; use https://secure.paygate.co.za/payweb3/process.trans for live.", {
          PAYGATE_URL: process.env.PAYGATE_URL,
        });
      } else if (host === "secure.paygate.co.za") {
        logger.info("PayGate: using live PayGate host (secure.paygate.co.za).");
      }
    } catch {
      /* ignore URL parse */
    }

    const feeZar = request.skipPayGateFee ? 0 : getPayGateFlatFeeZar();
    const chargedZar = Math.round((Number(request.amount) + feeZar) * 100) / 100;
    const publicFrontendBase = coercePublicBaseUrl(process.env.FRONTEND_URL, "https://qwertymates.com");
    const publicBackendBase = coercePublicBaseUrl(process.env.BACKEND_URL, "https://api.qwertymates.com");
    const safeReturnUrl = ensurePublicCallbackUrl(request.returnUrl, `${publicFrontendBase}/wallet`);
    const safeNotifyUrl = ensurePublicCallbackUrl(request.notifyUrl, `${publicBackendBase}/api/payments/webhook`);

    const data: Record<string, string | number> = {
      PAYGATE_ID: paygateId,
      REFERENCE: request.reference,
      AMOUNT: Math.round(chargedZar * 100), // Amount in cents (includes flat fee)
      CURRENCY: "ZAR",
      RETURN_URL: safeReturnUrl,
      // PayWeb3: UTC datetime per docs (not YYYYMMDD only).
      TRANSACTION_DATE: new Date().toISOString().replace("T", " ").substring(0, 19),
      LOCALE: "en-za",
      COUNTRY: "ZAF",
      EMAIL: request.email,
      NOTIFY_URL: safeNotifyUrl,
    };
    if (request.vault) data.VAULT = "1";
    if (request.vaultId) data.VAULT_ID = request.vaultId;

    const checksum = generateChecksum({ ...data, ENCRYPTION_KEY: paygateSecret });
    const payload = { ...data, CHECKSUM: checksum };

    const response = await axios.post(paygateInitiateUrl, new URLSearchParams(payload as any).toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: publicFrontendBase,
      },
      timeout: 45000,
      responseType: "text",
    });
    const rawBody =
      typeof response.data === "string"
        ? response.data
        : response.data != null
        ? String(response.data)
        : "";
    const parsed = parsePayGateKvBody(rawBody);
    const transactionId = parsed.PAY_REQUEST_ID || parsed.PAYREQUESTID || "";
    const responseChecksum = parsed.CHECKSUM || "";

    if (!transactionId || !responseChecksum) {
      const statusCode = parsed.RESULT_CODE || parsed.STATUS || "";
      const statusDesc = parsed.RESULT_DESC || parsed.ERROR || parsed.ERROR_MESSAGE || "";
      const hint = [statusCode, statusDesc].filter(Boolean).join(" - ");
      throw new Error(hint ? `Invalid response from PayGate: ${hint}` : "Invalid response from PayGate");
    }

    // PayWeb3 step 2: must use CHECKSUM returned by initiate (see PayGate PHP SDK processRequest).
    const payGateRedirect = {
      processUrl: paygateProcessUrl,
      payRequestId: transactionId,
      checksum: responseChecksum,
    };
    const bridgeUrl = buildPayGateBridgeUrl(publicBackendBase, transactionId, responseChecksum);

    logger.info("Payment initiated", {
      reference: request.reference,
      transactionId,
      baseZar: request.amount,
      paygateFeeZar: feeZar,
      chargedZar,
    });

    return {
      success: true,
      paymentUrl: bridgeUrl || undefined,
      payGateRedirect,
      transactionId,
      paygateFeeZar: feeZar,
      chargedZar,
    };
  } catch (error: any) {
    logger.error("Payment initiation failed:", error);
    const status = error?.response?.status;
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
  const encryptionKey = String(data.ENCRYPTION_KEY || "");
  let source = "";
  for (const [key, value] of Object.entries(data)) {
    if (key === "ENCRYPTION_KEY") continue;
    if (value === undefined || value === null || value === "") continue;
    source += String(value);
  }
  source += encryptionKey;
  return crypto.createHash("md5").update(source).digest("hex");
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
