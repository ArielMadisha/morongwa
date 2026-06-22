import express, { Response } from "express";
import mongoose from "mongoose";
import CountryOpsProfile from "../data/models/CountryOpsProfile";
import { AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import AuditLog from "../data/models/AuditLog";
import { currencyFromCountryIso } from "../utils/phoneCountryCurrency";

const router = express.Router();

async function ensureSeed(): Promise<void> {
  const base = { whatsappNumber: "", supportNotes: "", active: true };
  await CountryOpsProfile.updateOne(
    { countryCode: "ZA" },
    {
      $setOnInsert: {
        ...base,
        countryName: "South Africa (RSA)",
        whatsappLabel: "RSA WhatsApp (configure)",
        currencyCode: currencyFromCountryIso("ZA"),
        sortOrder: 10,
      },
    },
    { upsert: true }
  );
  await CountryOpsProfile.updateOne(
    { countryCode: "BW" },
    {
      $setOnInsert: {
        ...base,
        countryName: "Botswana",
        whatsappLabel: "Botswana WhatsApp (configure)",
        currencyCode: currencyFromCountryIso("BW"),
        sortOrder: 20,
      },
    },
    { upsert: true }
  );
  await CountryOpsProfile.updateOne(
    { countryCode: "LS" },
    {
      $setOnInsert: {
        ...base,
        countryName: "Lesotho",
        whatsappLabel: "Lesotho WhatsApp (configure)",
        currencyCode: currencyFromCountryIso("LS"),
        sortOrder: 25,
      },
    },
    { upsert: true }
  );
}

function normalizeCountryCode(raw: unknown): string {
  const s = String(raw || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(s)) throw new AppError("countryCode must be ISO 3166-1 alpha-2 (e.g. ZA)", 400);
  return s;
}

function normalizeCurrency(raw: unknown): string {
  const s = String(raw || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(s)) throw new AppError("currencyCode must be ISO 4217 (e.g. ZAR)", 400);
  return s;
}

const MACGYVER_WA_POOLS = new Set(["", "wa_api", "twilio_parent", "twilio_subaccount", "twilio_subaccount_b"]);

function normalizeMacGyverPoolField(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!MACGYVER_WA_POOLS.has(s)) throw new AppError("Invalid macgyverWaTwilioPool (MacGyver WhatsApp credential bucket)", 400);
  return s;
}

router.get("/country-profiles", async (_req: AuthRequest, res: Response, next) => {
  try {
    await ensureSeed();
    const rows = await CountryOpsProfile.find().sort({ sortOrder: 1, countryCode: 1 }).lean();
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

router.post("/country-profiles", async (req: AuthRequest, res: Response, next) => {
  try {
    const countryCode = normalizeCountryCode(req.body?.countryCode);
    const countryName = String(req.body?.countryName || "").trim();
    if (!countryName) throw new AppError("countryName required", 400);
    const exists = await CountryOpsProfile.findOne({ countryCode }).lean();
    if (exists) throw new AppError("Country already exists", 409);
    const currencyCode = req.body?.currencyCode
      ? normalizeCurrency(req.body.currencyCode)
      : currencyFromCountryIso(countryCode);
    const whatsappNumber = String(req.body?.whatsappNumber ?? "").trim();
    const whatsappLabel = String(req.body?.whatsappLabel ?? "").trim() || undefined;
    const whatsappNumber2 = String(req.body?.whatsappNumber2 ?? "").trim();
    const whatsappLabel2 = String(req.body?.whatsappLabel2 ?? "").trim() || undefined;
    const macgyverWaTwilioPool1 = normalizeMacGyverPoolField(req.body?.macgyverWaTwilioPool1);
    const macgyverWaTwilioPool2 = normalizeMacGyverPoolField(req.body?.macgyverWaTwilioPool2);
    const supportNotes = String(req.body?.supportNotes ?? "").trim() || undefined;
    const sortOrder = Number(req.body?.sortOrder);
    const doc = await CountryOpsProfile.create({
      countryCode,
      countryName,
      whatsappNumber,
      whatsappLabel,
      whatsappNumber2,
      whatsappLabel2,
      macgyverWaTwilioPool1,
      macgyverWaTwilioPool2,
      currencyCode,
      supportNotes,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 100,
      active: req.body?.active !== false,
      updatedBy: req.user!._id,
    });
    await AuditLog.create({
      action: "COUNTRY_OPS_PROFILE_CREATED",
      user: req.user!._id,
      target: doc._id,
      meta: { countryCode },
    });
    res.status(201).json({ data: doc });
  } catch (err) {
    next(err);
  }
});

router.patch("/country-profiles/:countryCode", async (req: AuthRequest, res: Response, next) => {
  try {
    const countryCode = normalizeCountryCode(req.params.countryCode);
    const doc = await CountryOpsProfile.findOne({ countryCode });
    if (!doc) throw new AppError("Not found", 404);
    const body = req.body || {};
    if (typeof body.countryName === "string" && body.countryName.trim()) doc.countryName = body.countryName.trim();
    if (typeof body.whatsappNumber === "string") doc.whatsappNumber = body.whatsappNumber.trim();
    if (typeof body.whatsappLabel === "string") doc.whatsappLabel = body.whatsappLabel.trim() || undefined;
    if (typeof body.whatsappNumber2 === "string") doc.whatsappNumber2 = body.whatsappNumber2.trim();
    if (typeof body.whatsappLabel2 === "string") doc.whatsappLabel2 = body.whatsappLabel2.trim() || undefined;
    if (body.macgyverWaTwilioPool1 !== undefined)
      (doc as any).macgyverWaTwilioPool1 = normalizeMacGyverPoolField(body.macgyverWaTwilioPool1);
    if (body.macgyverWaTwilioPool2 !== undefined)
      (doc as any).macgyverWaTwilioPool2 = normalizeMacGyverPoolField(body.macgyverWaTwilioPool2);
    if (typeof body.currencyCode === "string") doc.currencyCode = normalizeCurrency(body.currencyCode);
    if (typeof body.supportNotes === "string") doc.supportNotes = body.supportNotes.trim() || undefined;
    if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) doc.sortOrder = body.sortOrder;
    if (body.active === true || body.active === false) doc.active = body.active;
    doc.updatedBy = req.user!._id;
    await doc.save();
    await AuditLog.create({
      action: "COUNTRY_OPS_PROFILE_UPDATED",
      user: req.user!._id,
      target: doc._id,
      meta: { countryCode },
    });
    res.json({ data: doc });
  } catch (err) {
    next(err);
  }
});

router.delete("/country-profiles/:countryCode", async (req: AuthRequest, res: Response, next) => {
  try {
    const countryCode = normalizeCountryCode(req.params.countryCode);
    const doc = await CountryOpsProfile.findOneAndDelete({ countryCode });
    if (!doc) throw new AppError("Not found", 404);
    await AuditLog.create({
      action: "COUNTRY_OPS_PROFILE_DELETED",
      user: req.user!._id,
      target: doc._id,
      meta: { countryCode },
    });
    res.json({ message: "Deleted" });
  } catch (err) {
    next(err);
  }
});

export default router;
