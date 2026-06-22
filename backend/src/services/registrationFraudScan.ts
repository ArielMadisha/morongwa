import crypto from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import mongoose from "mongoose";
import AuditLog from "../data/models/AuditLog";
import TuckshopCashAgentRegistration from "../data/models/TuckshopCashAgentRegistration";
import { logger } from "./monitoring";
import { getAgentRegistrationIncentiveForWaDigits } from "../config/agentRegistrationIncentive.config";

const UPLOADS_ROOT = path.join(__dirname, "../../uploads");

const GPS_NEAR_DUP_METERS = 95;
const PHOTO_DHASH_NEAR_MAX = 13;
const RECENT_PEER_LIMIT = 450;

export function normalizeApplicantId(raw: string): string {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 48);
}

function waDigitsOnly(input: string): string {
  return String(input || "").replace(/\D/g, "");
}

function resolveStoredUploadAbsolute(stored: string): string | null {
  const s = String(stored || "").trim();
  if (!s || /^https?:\/\//i.test(s)) return null;
  let rel = s.replace(/^\/+/, "");
  if (rel.startsWith("uploads/")) rel = rel.slice("uploads/".length);
  const abs = path.join(UPLOADS_ROOT, rel);
  try {
    if (!abs.startsWith(UPLOADS_ROOT)) return null;
  } catch {
    return null;
  }
  return fs.existsSync(abs) ? abs : null;
}

async function sha256File(absPath: string): Promise<string | null> {
  try {
    const buf = await fs.promises.readFile(absPath);
    return crypto.createHash("sha256").update(buf).digest("hex");
  } catch {
    return null;
  }
}

/** 64-bit difference hash as 16 hex chars. */
async function computeDhashImage(absPath: string): Promise<string | null> {
  try {
    const { data, info } = await sharp(absPath)
      .resize(9, 8, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== 9 || info.height !== 8 || !data?.length) return null;
    let bits = "";
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const left = data[y * 9 + x];
        const right = data[y * 9 + x + 1];
        bits += left < right ? "1" : "0";
      }
    }
    let hex = "";
    for (let i = 0; i < 64; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  } catch {
    return null;
  }
}

function hammingHex64(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 999;
  try {
    let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
    let n = 0;
    while (x > 0n) {
      n += Number(x & 1n);
      x >>= 1n;
    }
    return n;
  } catch {
    return 999;
  }
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function scoreFlags(flags: Set<string>): number {
  let s = 0;
  const add = (code: string, pts: number) => {
    if (flags.has(code)) s += pts;
  };
  add("DUPLICATE_ID_NUMBER", 42);
  add("DUPLICATE_COMPANY_CERTIFICATE", 38);
  add("DUPLICATE_PROOF_OF_RESIDENCE", 28);
  add("DUPLICATE_SHOP_PHOTO_FILE", 34);
  add("SIMILAR_SHOP_PHOTO", 24);
  add("NEAR_DUPLICATE_GPS_LOCATION", 20);
  add("ONBOARDING_DUPLICATE_ID_NUMBER", 40);
  add("ZA_ID_DIGIT_COUNT_MISMATCH", 12);
  return Math.min(100, s);
}

function shouldFlagZaIdDigits(waDigits: string, applicantRaw: string): boolean {
  const d = waDigitsOnly(waDigits);
  if (!d.startsWith("27")) return false;
  const idDigits = String(applicantRaw || "").replace(/\D/g, "");
  if (!idDigits) return false;
  return idDigits.length !== 13;
}

export async function runTuckshopFraudScan(registrationId: string): Promise<void> {
  const id = String(registrationId || "").trim();
  if (!mongoose.isValidObjectId(id)) return;

  const reg = await TuckshopCashAgentRegistration.findById(id).lean();
  if (!reg) return;

  const flags = new Set<string>();
  const waDigits = waDigitsOnly(String((reg as any).waPhoneDigits || ""));
  const incentive = getAgentRegistrationIncentiveForWaDigits(waDigits);

  const applicantNorm = normalizeApplicantId(String((reg as any).applicantIdPassport || ""));
  const photoPath = String((reg as any).photoPath || "");
  const certPath = String((reg as any).companyCertificatePath || "").trim();
  const proofPath = String((reg as any).proofOfResidencePath || "").trim();

  let photoSha256: string | undefined;
  let photoDhash: string | undefined;
  let certificateSha256: string | undefined;
  let proofSha256: string | undefined;

  const photoAbs = resolveStoredUploadAbsolute(photoPath);
  if (photoAbs) {
    const sh = await sha256File(photoAbs);
    if (sh) photoSha256 = sh;
    const dh = await computeDhashImage(photoAbs);
    if (dh) photoDhash = dh;
  }

  if (certPath) {
    const abs = resolveStoredUploadAbsolute(certPath);
    if (abs) {
      const sh = await sha256File(abs);
      if (sh) certificateSha256 = sh;
    }
  }

  if (proofPath) {
    const abs = resolveStoredUploadAbsolute(proofPath);
    if (abs) {
      const sh = await sha256File(abs);
      if (sh) proofSha256 = sh;
    }
  }

  const oid = new mongoose.Types.ObjectId(id);

  if (applicantNorm.length >= 5) {
    const dupId = await TuckshopCashAgentRegistration.countDocuments({
      applicantIdNormalised: applicantNorm,
      _id: { $ne: oid },
    });
    if (dupId > 0) flags.add("DUPLICATE_ID_NUMBER");

    const dupOnboard = await AuditLog.countDocuments({
      action: "WA_ONBOARDING_AGENT_APPLICATION",
      "meta.agentIdPassportNormalised": applicantNorm,
    });
    if (dupOnboard > 0) flags.add("DUPLICATE_ID_NUMBER");
  }

  if (certificateSha256) {
    const n = await TuckshopCashAgentRegistration.countDocuments({
      certificateSha256,
      _id: { $ne: oid },
    });
    if (n > 0) flags.add("DUPLICATE_COMPANY_CERTIFICATE");
  }

  if (proofSha256) {
    const n = await TuckshopCashAgentRegistration.countDocuments({
      proofSha256,
      _id: { $ne: oid },
    });
    if (n > 0) flags.add("DUPLICATE_PROOF_OF_RESIDENCE");
  }

  if (photoSha256) {
    const n = await TuckshopCashAgentRegistration.countDocuments({
      photoSha256,
      _id: { $ne: oid },
    });
    if (n > 0) flags.add("DUPLICATE_SHOP_PHOTO_FILE");
  }

  const lat = Number((reg as any).locationLatitude);
  const lng = Number((reg as any).locationLongitude);
  if (photoDhash && Number.isFinite(lat) && Number.isFinite(lng)) {
    const peers = await TuckshopCashAgentRegistration.find({
      _id: { $ne: oid },
      photoDhash: { $exists: true, $nin: [null, ""] },
    })
      .sort({ createdAt: -1 })
      .limit(RECENT_PEER_LIMIT)
      .select({ photoDhash: 1 })
      .lean();

    for (const p of peers) {
      const other = String((p as any).photoDhash || "");
      if (!other) continue;
      const dist = hammingHex64(photoDhash, other);
      if (dist <= PHOTO_DHASH_NEAR_MAX) {
        flags.add("SIMILAR_SHOP_PHOTO");
        break;
      }
    }
  }

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const neighbors = await TuckshopCashAgentRegistration.find({
      _id: { $ne: oid },
      locationLatitude: { $exists: true },
      locationLongitude: { $exists: true },
    })
      .sort({ createdAt: -1 })
      .limit(RECENT_PEER_LIMIT)
      .select({ locationLatitude: 1, locationLongitude: 1, applicantUser: 1 })
      .lean();

    const selfApplicant = String((reg as any).applicantUser || "");
    for (const n of neighbors) {
      const olat = Number((n as any).locationLatitude);
      const olng = Number((n as any).locationLongitude);
      if (!Number.isFinite(olat) || !Number.isFinite(olng)) continue;
      const m = haversineMeters(lat, lng, olat, olng);
      if (m <= GPS_NEAR_DUP_METERS && String((n as any).applicantUser || "") !== selfApplicant) {
        flags.add("NEAR_DUPLICATE_GPS_LOCATION");
        break;
      }
    }
  }

  if (shouldFlagZaIdDigits(waDigits, String((reg as any).applicantIdPassport || ""))) {
    flags.add("ZA_ID_DIGIT_COUNT_MISMATCH");
  }

  const fraudFlags = Array.from(flags).sort();
  const fraudRiskScore = scoreFlags(flags);

  const $set: Record<string, unknown> = {
    fraudFlags,
    fraudRiskScore,
    fraudScanAt: new Date(),
    registrationIncentiveDisplay: incentive.display,
  };
  const $unset: Record<string, 1> = { fraudScanError: 1 };

  if (applicantNorm.length >= 5) $set.applicantIdNormalised = applicantNorm;
  else $unset.applicantIdNormalised = 1;

  if (certificateSha256) $set.certificateSha256 = certificateSha256;
  else $unset.certificateSha256 = 1;

  if (proofSha256) $set.proofSha256 = proofSha256;
  else $unset.proofSha256 = 1;

  if (photoSha256) $set.photoSha256 = photoSha256;
  else $unset.photoSha256 = 1;

  if (photoDhash) $set.photoDhash = photoDhash;
  else $unset.photoDhash = 1;

  await TuckshopCashAgentRegistration.updateOne({ _id: oid }, { $set, $unset });
}

export async function runOnboardingAgentFraudScan(auditLogId: string): Promise<void> {
  const id = String(auditLogId || "").trim();
  if (!mongoose.isValidObjectId(id)) return;

  const log = await AuditLog.findById(id).lean();
  if (!log || String((log as any).action) !== "WA_ONBOARDING_AGENT_APPLICATION") return;

  const meta: Record<string, unknown> = {
    ...(((log as any).meta || {}) as Record<string, unknown>),
  };
  const phoneDigits = waDigitsOnly(String(meta.phone || ""));
  const incentive = getAgentRegistrationIncentiveForWaDigits(phoneDigits);
  const rawId = String(meta.agentIdPassport || "");
  const norm = normalizeApplicantId(rawId);

  const flags = new Set<string>();
  const oid = new mongoose.Types.ObjectId(id);

  if (norm.length >= 5) {
    const otherLogs = await AuditLog.countDocuments({
      action: "WA_ONBOARDING_AGENT_APPLICATION",
      "meta.agentIdPassportNormalised": norm,
      _id: { $ne: oid },
    });
    if (otherLogs > 0) flags.add("ONBOARDING_DUPLICATE_ID_NUMBER");

    const tuckDup = await TuckshopCashAgentRegistration.countDocuments({ applicantIdNormalised: norm });
    if (tuckDup > 0) flags.add("ONBOARDING_DUPLICATE_ID_NUMBER");
  }

  if (shouldFlagZaIdDigits(phoneDigits, rawId)) {
    flags.add("ZA_ID_DIGIT_COUNT_MISMATCH");
  }

  const fraudFlags = Array.from(flags).sort();
  const fraudRiskScore = scoreFlags(flags);

  await AuditLog.updateOne(
    { _id: oid },
    {
      $set: {
        "meta.agentIdPassportNormalised": norm || undefined,
        "meta.fraudFlags": fraudFlags,
        "meta.fraudRiskScore": fraudRiskScore,
        "meta.fraudScanAt": new Date(),
        "meta.suggestedRegistrationPayout": incentive.display,
      },
    }
  );
}

export function scheduleTuckshopFraudScan(registrationId: string): void {
  setImmediate(() => {
    runTuckshopFraudScan(registrationId).catch((e) => {
      logger.warn("Tuckshop fraud scan failed", { registrationId, error: String((e as any)?.message || e) });
      const oid =
        mongoose.isValidObjectId(registrationId) ? new mongoose.Types.ObjectId(registrationId) : null;
      if (!oid) return;
      TuckshopCashAgentRegistration.updateOne(
        { _id: oid },
        { $set: { fraudScanError: String((e as any)?.message || e).slice(0, 400), fraudScanAt: new Date() } }
      ).catch(() => {});
    });
  });
}

export function scheduleOnboardingAgentFraudScan(auditLogId: string): void {
  setImmediate(() => {
    runOnboardingAgentFraudScan(auditLogId).catch((e) => {
      logger.warn("Onboarding agent fraud scan failed", { auditLogId, error: String((e as any)?.message || e) });
    });
  });
}
