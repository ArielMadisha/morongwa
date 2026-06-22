/**
 * Worldpay Access — Account Payouts API v2 (single payout).
 * Try: https://try.access.worldpay.com | Live: https://access.worldpay.com
 *
 * Sandbox / production: set WORLDPAY_ACCESS_MODE=try|live and credentials in .env.
 * entity + instructingTreasuryId are 6-digit values from your Implementation Manager.
 */
import axios, { AxiosError } from "axios";
import crypto from "crypto";
import logger from "../utils/logger";

const TRY_BASE = "https://try.access.worldpay.com";
const LIVE_BASE = "https://access.worldpay.com";

const PAYOUT_CONTENT_TYPE = "application/vnd.worldpay.wts.payout-v2+json";

export type WorldpayAccessMode = "try" | "live";

export function getWorldpayAccountPayoutConfig(): {
  enabled: boolean;
  mode: WorldpayAccessMode;
  baseUrl: string;
  referenceId: string;
  credential: string;
  entity: string;
  instructingTreasuryId: string;
  wpApiVersion: string;
} {
  const enabled = String(process.env.WORLDPAY_ACCOUNT_PAYOUT_ENABLED || "").trim() === "1";
  const modeRaw = String(process.env.WORLDPAY_ACCESS_MODE || "try").trim().toLowerCase();
  const mode: WorldpayAccessMode = modeRaw === "live" ? "live" : "try";
  const baseUrl = (mode === "live" ? LIVE_BASE : TRY_BASE).replace(/\/$/, "");
  const referenceId = String(process.env.WORLDPAY_REFERENCE_ID || "").trim();
  const credential = String(process.env.WORLDPAY_CREDENTIAL || "").trim();
  const entity = String(process.env.WORLDPAY_ENTITY || "").trim();
  const instructingTreasuryId = String(process.env.WORLDPAY_INSTRUCTING_TREASURY_ID || entity).trim();
  const wpApiVersion = String(process.env.WORLDPAY_WP_API_VERSION || "2025-01-01").trim();
  return {
    enabled,
    mode,
    baseUrl,
    referenceId,
    credential,
    entity,
    instructingTreasuryId,
    wpApiVersion,
  };
}

export function isWorldpayAccountPayoutReady(): boolean {
  const c = getWorldpayAccountPayoutConfig();
  if (!c.enabled) return false;
  if (!c.referenceId || !c.credential) return false;
  if (c.entity.length !== 6 || c.instructingTreasuryId.length !== 6) return false;
  return true;
}

function basicAuthHeader(referenceId: string, credential: string): string {
  const token = Buffer.from(`${referenceId}:${credential}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

/** Merge requester defaults; generate apiRequestReference if missing (idempotency with treasury). */
function mergeBody(
  body: Record<string, unknown>,
  entity: string,
  instructingTreasuryId: string
): Record<string, unknown> {
  const existing = (body.requester && typeof body.requester === "object" ? body.requester : {}) as Record<
    string,
    unknown
  >;
  const apiRequestReference =
    typeof existing.apiRequestReference === "string" && existing.apiRequestReference.length > 0
      ? existing.apiRequestReference
      : `mw-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  return {
    ...body,
    requester: {
      ...existing,
      entity: typeof existing.entity === "string" && existing.entity.length === 6 ? existing.entity : entity,
      instructingTreasuryId:
        typeof existing.instructingTreasuryId === "string" && existing.instructingTreasuryId.length === 6
          ? existing.instructingTreasuryId
          : instructingTreasuryId,
      apiRequestReference,
    },
  };
}

/**
 * POST /payouts/accounts/single — see Worldpay Account Payouts v2 OpenAPI.
 * Body must include at least: countryCode, sourceCurrency, targetCurrency, transactionReference,
 * transactionTypeCode, bankDetails, beneficiary parties (per onboarding).
 */
export async function postSingleAccountPayout(body: Record<string, unknown>): Promise<{
  status: number;
  data: unknown;
}> {
  const c = getWorldpayAccountPayoutConfig();
  if (!isWorldpayAccountPayoutReady()) {
    throw new Error(
      "Worldpay Account Payouts not configured. Set WORLDPAY_ACCOUNT_PAYOUT_ENABLED=1, WORLDPAY_REFERENCE_ID, WORLDPAY_CREDENTIAL, WORLDPAY_ENTITY (6 chars), WORLDPAY_ACCESS_MODE=try|live"
    );
  }
  const payload = mergeBody(body, c.entity, c.instructingTreasuryId);
  const url = `${c.baseUrl}/payouts/accounts/single`;
  const correlationId = crypto.randomUUID();

  try {
    const res = await axios.post(url, payload, {
      timeout: 60000,
      headers: {
        Authorization: basicAuthHeader(c.referenceId, c.credential),
        "Content-Type": PAYOUT_CONTENT_TYPE,
        Accept: PAYOUT_CONTENT_TYPE,
        "WP-Api-Version": c.wpApiVersion,
        "WP-CorrelationId": correlationId,
        "WP-CallerId": "morongwa-backend",
      },
      validateStatus: () => true,
    });
    if (res.status >= 400) {
      logger.warn("Worldpay single payout non-success", {
        status: res.status,
        correlationId,
        mode: c.mode,
        data: res.data,
      });
    }
    return { status: res.status, data: res.data };
  } catch (err) {
    const ax = err as AxiosError;
    logger.error("Worldpay single payout request failed", {
      correlationId,
      message: ax.message,
      response: ax.response?.data,
    });
    throw err;
  }
}

/** Phase-1 corridors (ZAR-funded): validate countryCode only — optional guard for scripts/UI. */
export const WORLDPAY_PHASE1_COUNTRIES = ["ZA", "BW", "ZM"] as const;
