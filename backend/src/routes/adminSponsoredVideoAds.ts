import express, { Response } from "express";
import mongoose from "mongoose";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";
import { enforceDelegatedAdminSectionAccess } from "../middleware/adminDelegateSectionGate";
import { AppError } from "../middleware/errorHandler";
import AuditLog from "../data/models/AuditLog";
import Advertiser from "../data/models/Advertiser";
import SponsoredVideoAd, { SPONSORED_VIDEO_PLACEMENTS, type SponsoredVideoPlacement } from "../data/models/SponsoredVideoAd";
import SponsoredVideoImpression from "../data/models/SponsoredVideoImpression";
import AdTransaction from "../data/models/AdTransaction";
import PlatformAdRevenue from "../data/models/PlatformAdRevenue";
import { isSponsoredVideoUrl } from "../services/sponsoredVideoAdService";
import {
  dateKeyFrom,
  impressionRateLimitPerUserPerHour,
  platformSharePercent,
  round2,
} from "../services/sponsoredAdBilling";

const SPONSORED_AD_TYPES = new Set(["CPM", "CPC", "CPA", "HYBRID"]);
const SPONSORED_TARGET_AUDIENCES = new Set(["generic", "wallet", "runner", "merchant", "shopper"]);
const SPONSORED_MODULE_CATEGORIES = new Set(["wallet", "marketplace", "errands", "jobs", "merchant", "general"]);

function normalizeAdType(raw: unknown): "CPM" | "CPC" | "CPA" | "HYBRID" {
  const t = String(raw || "CPM").trim().toUpperCase();
  if (!SPONSORED_AD_TYPES.has(t)) throw new AppError("Invalid adType", 400);
  return t as any;
}

function normalizeTargetAudience(raw: unknown): "generic" | "wallet" | "runner" | "merchant" | "shopper" {
  const t = String(raw || "generic").trim().toLowerCase();
  if (!SPONSORED_TARGET_AUDIENCES.has(t)) throw new AppError("Invalid targetAudience", 400);
  return t as any;
}

function normalizeModuleCategory(raw: unknown): "wallet" | "marketplace" | "errands" | "jobs" | "merchant" | "general" {
  const t = String(raw || "general").trim().toLowerCase();
  if (!SPONSORED_MODULE_CATEGORIES.has(t)) throw new AppError("Invalid moduleCategory", 400);
  return t as any;
}

const router = express.Router();
router.use(authenticate, authorize("admin", "superadmin"));
router.use(enforceDelegatedAdminSectionAccess);

function parseDate(s: unknown, fallback: Date): Date {
  const t = new Date(String(s || ""));
  return Number.isNaN(t.getTime()) ? fallback : t;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

router.get("/sponsored-video/advertisers", async (req: AuthRequest, res: Response, next) => {
  try {
    const activeOnly = String(req.query.activeOnly || "") === "1";
    const webOnboarding = String(req.query.webOnboarding || "").trim().toLowerCase();
    const q: any = {};
    if (activeOnly) q.active = true;
    if (webOnboarding === "pending") q.webOnboardingStatus = "pending";
    else if (webOnboarding === "approved") {
      q.$or = [
        { webOnboardingStatus: "approved" },
        { webOnboardingStatus: { $exists: false } },
        { webOnboardingStatus: null },
      ];
    } else if (webOnboarding === "rejected") q.webOnboardingStatus = "rejected";
    const rows = await Advertiser.find(q).sort({ name: 1 }).limit(500).lean();
    res.json({ data: rows });
  } catch (e) {
    next(e);
  }
});

router.post("/sponsored-video/advertisers", async (req: AuthRequest, res: Response, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) throw new AppError("Name is required", 400);
    const doc = await Advertiser.create({
      name,
      contactEmail: String(req.body?.contactEmail || "").trim() || undefined,
      contactPhone: String(req.body?.contactPhone || "").trim() || undefined,
      notes: String(req.body?.notes || "").trim() || undefined,
      active: req.body?.active === false ? false : true,
      webOnboardingStatus: "approved",
      webPackageTier: String(req.body?.webPackageTier || "").trim() || undefined,
    });
    await AuditLog.create({
      action: "SPONSORED_ADVERTISER_CREATED",
      user: req.user!._id,
      target: doc._id,
      meta: { name },
    });
    res.status(201).json({ data: doc });
  } catch (e) {
    next(e);
  }
});

router.put("/sponsored-video/advertisers/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid id", 400);
    const doc = await Advertiser.findById(id);
    if (!doc) throw new AppError("Not found", 404);
    if ("name" in req.body) doc.name = String(req.body.name || "").trim() || doc.name;
    if ("contactEmail" in req.body) doc.contactEmail = String(req.body.contactEmail || "").trim() || undefined;
    if ("contactPhone" in req.body) doc.contactPhone = String(req.body.contactPhone || "").trim() || undefined;
    if ("notes" in req.body) doc.notes = String(req.body.notes || "").trim() || undefined;
    if ("active" in req.body) doc.active = Boolean(req.body.active);
    if ("webPackageTier" in req.body)
      (doc as any).webPackageTier = String(req.body.webPackageTier || "").trim() || undefined;
    if ("webOnboardingNotes" in req.body)
      (doc as any).webOnboardingNotes = String(req.body.webOnboardingNotes || "").trim() || undefined;
    if ("webOnboardingStatus" in req.body) {
      const s = String(req.body.webOnboardingStatus || "").trim().toLowerCase();
      if (!["pending", "approved", "rejected"].includes(s)) throw new AppError("Invalid webOnboardingStatus", 400);
      (doc as any).webOnboardingStatus = s;
    }
    await doc.save();
    await AuditLog.create({
      action: "SPONSORED_ADVERTISER_UPDATED",
      user: req.user!._id,
      target: doc._id,
      meta: {
        webOnboardingStatus: (doc as any).webOnboardingStatus,
        webPackageTier: (doc as any).webPackageTier,
      },
    });
    res.json({ data: doc });
  } catch (e) {
    next(e);
  }
});

router.delete("/sponsored-video/advertisers/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid id", 400);
    const ads = await SponsoredVideoAd.countDocuments({ advertiserId: id });
    if (ads > 0) throw new AppError("Remove or reassign sponsored video ads before deleting this client", 400);
    const r = await Advertiser.deleteOne({ _id: id });
    if (!r.deletedCount) throw new AppError("Not found", 404);
    await AuditLog.create({ action: "SPONSORED_ADVERTISER_DELETED", user: req.user!._id, target: id, meta: {} });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get("/sponsored-video/ads", async (req: AuthRequest, res: Response, next) => {
  try {
    const advertiserId = String(req.query.advertiserId || "").trim();
    const q: any = {};
    if (mongoose.isValidObjectId(advertiserId)) q.advertiserId = advertiserId;
    const rows = await SponsoredVideoAd.find(q).sort({ updatedAt: -1 }).limit(200).lean();
    res.json({ data: rows });
  } catch (e) {
    next(e);
  }
});

router.post("/sponsored-video/ads", async (req: AuthRequest, res: Response, next) => {
  try {
    const advertiserId = String(req.body?.advertiserId || "").trim();
    if (!mongoose.isValidObjectId(advertiserId)) throw new AppError("advertiserId required", 400);
    const adv = await Advertiser.findById(advertiserId).select("_id").lean();
    if (!adv) throw new AppError("Advertiser not found", 404);
    const title = String(req.body?.title || "").trim();
    const videoUrl = String(req.body?.videoUrl || "").trim();
    const caption = String(req.body?.caption || "").trim();
    if (!title) throw new AppError("title is required", 400);
    if (!isSponsoredVideoUrl(videoUrl)) throw new AppError("videoUrl must be a public https video URL (.mp4/.mov/.m4v)", 400);
    const placements = Array.isArray(req.body?.placements) ? req.body.placements.map(String) : ["wa_premenu_main"];
    const bad = placements.filter((p: string) => !(SPONSORED_VIDEO_PLACEMENTS as readonly string[]).includes(p));
    if (bad.length) throw new AppError(`Invalid placements: ${bad.join(", ")}`, 400);
    const doc = await SponsoredVideoAd.create({
      advertiserId,
      title,
      videoUrl,
      caption: caption || undefined,
      placements: placements as SponsoredVideoPlacement[],
      weight: Math.max(0, Number(req.body?.weight ?? 1) || 1),
      priority: Math.max(0, Number(req.body?.priority ?? req.body?.weight ?? 1) || 1),
      approved: Boolean(req.body?.approved),
      active: req.body?.active === false ? false : true,
      startDate: req.body?.startDate ? new Date(req.body.startDate) : undefined,
      endDate: req.body?.endDate ? new Date(req.body.endDate) : undefined,
      rateZarPerThousandImpressions: Math.max(0, Number(req.body?.rateZarPerThousandImpressions ?? 0) || 0),
      adType: normalizeAdType(req.body?.adType),
      cpmRate: Math.max(0, Number(req.body?.cpmRate ?? req.body?.rateZarPerThousandImpressions ?? 0) || 0),
      cpcRate: Math.max(0, Number(req.body?.cpcRate ?? 0) || 0),
      cpaRate: Math.max(0, Number(req.body?.cpaRate ?? 0) || 0),
      targetAudience: normalizeTargetAudience(req.body?.targetAudience),
      moduleCategory: normalizeModuleCategory(req.body?.moduleCategory),
    });
    await AuditLog.create({
      action: "SPONSORED_VIDEO_AD_CREATED",
      user: req.user!._id,
      target: doc._id,
      meta: { title, placements },
    });
    res.status(201).json({ data: doc });
  } catch (e) {
    next(e);
  }
});

router.put("/sponsored-video/ads/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid id", 400);
    const doc = await SponsoredVideoAd.findById(id);
    if (!doc) throw new AppError("Not found", 404);
    if ("advertiserId" in req.body) {
      const aid = String(req.body.advertiserId || "").trim();
      if (!mongoose.isValidObjectId(aid)) throw new AppError("Invalid advertiserId", 400);
      const adv = await Advertiser.findById(aid).select("_id").lean();
      if (!adv) throw new AppError("Advertiser not found", 404);
      doc.advertiserId = aid as any;
    }
    if ("title" in req.body) doc.title = String(req.body.title || "").trim() || doc.title;
    if ("videoUrl" in req.body) {
      const u = String(req.body.videoUrl || "").trim();
      if (!isSponsoredVideoUrl(u)) throw new AppError("videoUrl must be a public https video URL (.mp4/.mov/.m4v)", 400);
      doc.videoUrl = u;
    }
    if ("caption" in req.body) {
      const caption = String(req.body.caption || "").trim();
      doc.caption = caption || undefined;
    }
    if ("placements" in req.body) {
      const placements = Array.isArray(req.body.placements) ? req.body.placements.map(String) : doc.placements;
      const bad = placements.filter((p: string) => !(SPONSORED_VIDEO_PLACEMENTS as readonly string[]).includes(p));
      if (bad.length) throw new AppError(`Invalid placements: ${bad.join(", ")}`, 400);
      doc.placements = placements as any;
    }
    if ("weight" in req.body) doc.weight = Math.max(0, Number(req.body.weight) || 0);
    if ("priority" in req.body) (doc as any).priority = Math.max(0, Number(req.body.priority) || 0);
    if ("approved" in req.body) doc.approved = Boolean(req.body.approved);
    if ("active" in req.body) doc.active = Boolean(req.body.active);
    if ("startDate" in req.body) doc.startDate = req.body.startDate ? new Date(req.body.startDate) : undefined;
    if ("endDate" in req.body) doc.endDate = req.body.endDate ? new Date(req.body.endDate) : undefined;
    if ("rateZarPerThousandImpressions" in req.body) {
      doc.rateZarPerThousandImpressions = Math.max(0, Number(req.body.rateZarPerThousandImpressions) || 0);
    }
    if ("adType" in req.body) (doc as any).adType = normalizeAdType(req.body.adType);
    if ("cpmRate" in req.body) (doc as any).cpmRate = Math.max(0, Number(req.body.cpmRate) || 0);
    if ("cpcRate" in req.body) (doc as any).cpcRate = Math.max(0, Number(req.body.cpcRate) || 0);
    if ("cpaRate" in req.body) (doc as any).cpaRate = Math.max(0, Number(req.body.cpaRate) || 0);
    if ("targetAudience" in req.body) (doc as any).targetAudience = normalizeTargetAudience(req.body.targetAudience);
    if ("moduleCategory" in req.body) (doc as any).moduleCategory = normalizeModuleCategory(req.body.moduleCategory);
    await doc.save();
    await AuditLog.create({ action: "SPONSORED_VIDEO_AD_UPDATED", user: req.user!._id, target: doc._id, meta: {} });
    res.json({ data: doc });
  } catch (e) {
    next(e);
  }
});

router.delete("/sponsored-video/ads/:id", async (req: AuthRequest, res: Response, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) throw new AppError("Invalid id", 400);
    const r = await SponsoredVideoAd.deleteOne({ _id: id });
    if (!r.deletedCount) throw new AppError("Not found", 404);
    await AuditLog.create({ action: "SPONSORED_VIDEO_AD_DELETED", user: req.user!._id, target: id, meta: {} });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get("/sponsored-video/revenue-summary", async (req: AuthRequest, res: Response, next) => {
  try {
    const now = new Date();
    const from = parseDate(req.query.from, new Date(now.getTime() - 30 * 86400000));
    const to = parseDate(req.query.to, now);
    const agg = await SponsoredVideoImpression.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: "$advertiserId",
          impressions: { $sum: 1 },
          earnedZar: { $sum: "$earnedZarSnapshot" },
          clicks: { $sum: { $cond: [{ $eq: ["$eventType", "click"] }, 1, 0] } },
          conversions: { $sum: { $cond: [{ $eq: ["$eventType", "conversion"] }, 1, 0] } },
        },
      },
      { $sort: { earnedZar: -1 } },
    ]);
    const ids = agg.map((a) => a._id).filter(Boolean);
    const names = await Advertiser.find({ _id: { $in: ids } })
      .select("name")
      .lean();
    const nameById = new Map<string, string>(names.map((n: any) => [String(n._id), String(n.name || "")]));
    const data = agg.map((row) => ({
      advertiserId: String(row._id),
      advertiserName: nameById.get(String(row._id)) || "Unknown",
      impressions: row.impressions,
      clicks: Number(row.clicks || 0),
      conversions: Number(row.conversions || 0),
      earnedZar: Math.round(Number(row.earnedZar || 0) * 100) / 100,
    }));
    const totals = data.reduce(
      (acc, r) => {
        acc.impressions += r.impressions;
        acc.earnedZar += r.earnedZar;
        return acc;
      },
      { impressions: 0, earnedZar: 0 }
    );
    res.json({ data: { from, to, rows: data, totals } });
  } catch (e) {
    next(e);
  }
});

/** Ledger-style view: advertiser debits (gross charges) vs attributed platform/partner split + rolled PlatformAdRevenue. */
router.get("/sponsored-video/revenue-ledger", async (req: AuthRequest, res: Response, next) => {
  try {
    const now = new Date();
    const from = parseDate(req.query.from, new Date(now.getTime() - 30 * 86400000));
    const to = parseDate(req.query.to, now);

    const debitAgg = await AdTransaction.aggregate([
      {
        $match: {
          type: "debit",
          eventType: { $in: ["impression", "click", "conversion"] },
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: null,
          ledgerRows: { $sum: 1 },
          grossAdvertiserCharges: { $sum: "$amount" },
          platformAttributed: { $sum: "$platformShare" },
          partnerAttributed: { $sum: "$partnerShare" },
        },
      },
    ]);

    const topupAgg = await AdTransaction.aggregate([
      {
        $match: {
          type: "credit",
          eventType: "topup",
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: null,
          topupCount: { $sum: 1 },
          topupVolume: { $sum: "$amount" },
        },
      },
    ]);

    const fromKey = dateKeyFrom(from);
    const toKey = dateKeyFrom(to);

    const plate = await PlatformAdRevenue.aggregate([
      { $match: { dateKey: { $gte: fromKey, $lte: toKey } } },
      {
        $group: {
          _id: null,
          rolledRevenue: { $sum: "$totalRevenue" },
          rolledPlatform: { $sum: "$platformShare" },
          rolledPartner: { $sum: "$partnerShare" },
          impressions: { $sum: "$impressions" },
          clicks: { $sum: "$clicks" },
          conversions: { $sum: "$conversions" },
        },
      },
    ]);

    const byPlatform = await PlatformAdRevenue.aggregate([
      { $match: { dateKey: { $gte: fromKey, $lte: toKey } } },
      {
        $group: {
          _id: "$platform",
          totalRevenue: { $sum: "$totalRevenue" },
          platformShare: { $sum: "$platformShare" },
          partnerShare: { $sum: "$partnerShare" },
        },
      },
      { $sort: { totalRevenue: -1 } },
    ]);

    const d0 = debitAgg[0] || {};
    const t0 = topupAgg[0] || {};
    const p0 = plate[0] || {};

    res.json({
      data: {
        from,
        to,
        config: {
          adPlatformSharePct: platformSharePercent(),
          impressionMaxPerUserPerHour: impressionRateLimitPerUserPerHour(),
        },
        ledgerDebits: {
          rows: Number(d0.ledgerRows || 0),
          grossAdvertiserCharges: round2(Number(d0.grossAdvertiserCharges || 0)),
          platformAttributed: round2(Number(d0.platformAttributed || 0)),
          partnerAttributed: round2(Number(d0.partnerAttributed || 0)),
        },
        walletCredits: {
          topups: Number(t0.topupCount || 0),
          volume: round2(Number(t0.topupVolume || 0)),
        },
        platformRollups: {
          totalRevenue: round2(Number(p0.rolledRevenue || 0)),
          platformShare: round2(Number(p0.rolledPlatform || 0)),
          partnerShare: round2(Number(p0.rolledPartner || 0)),
          impressions: Number(p0.impressions || 0),
          clicks: Number(p0.clicks || 0),
          conversions: Number(p0.conversions || 0),
        },
        byPlatform: byPlatform.map((x: any) => ({
          platform: x._id,
          totalRevenue: round2(Number(x.totalRevenue || 0)),
          platformShare: round2(Number(x.platformShare || 0)),
          partnerShare: round2(Number(x.partnerShare || 0)),
        })),
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get("/sponsored-video/overview", async (_req: AuthRequest, res: Response, next) => {
  try {
    const from = startOfDay(new Date());
    const rows = await SponsoredVideoImpression.aggregate([
      { $match: { createdAt: { $gte: from } } },
      {
        $group: {
          _id: "$eventType",
          count: { $sum: 1 },
          revenue: { $sum: "$earnedZarSnapshot" },
        },
      },
    ]);
    const byType = Object.fromEntries(rows.map((r: any) => [String(r._id), r]));
    const topAd = await SponsoredVideoImpression.aggregate([
      { $match: { createdAt: { $gte: from } } },
      { $group: { _id: "$adId", revenue: { $sum: "$earnedZarSnapshot" }, impressions: { $sum: 1 } } },
      { $sort: { revenue: -1, impressions: -1 } },
      { $limit: 1 },
    ]);
    let topAdName = "";
    if (topAd[0]?._id) {
      const ad = await SponsoredVideoAd.findById(topAd[0]._id).select("title").lean();
      topAdName = String((ad as any)?.title || "");
    }
    res.json({
      data: {
        todayRevenue: Math.round(
          Number(byType.impression?.revenue || 0) + Number(byType.click?.revenue || 0) + Number(byType.conversion?.revenue || 0)
        ),
        impressions: Number(byType.impression?.count || 0),
        clicks: Number(byType.click?.count || 0),
        conversions: Number(byType.conversion?.count || 0),
        topPerformingAd: topAdName || null,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get("/reports", async (req: AuthRequest, res: Response, next) => {
  try {
    const now = new Date();
    const from = parseDate(req.query.from, new Date(now.getTime() - 30 * 86400000));
    const to = parseDate(req.query.to, now);
    const groupBy = String(req.query.groupBy || "day") === "month" ? "month" : "day";
    const fmt = groupBy === "month" ? "%Y-%m" : "%Y-%m-%d";
    const trend = await SponsoredVideoImpression.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { t: { $dateToString: { format: fmt, date: "$createdAt" } } },
          impressions: { $sum: { $cond: [{ $eq: ["$eventType", "impression"] }, 1, 0] } },
          clicks: { $sum: { $cond: [{ $eq: ["$eventType", "click"] }, 1, 0] } },
          conversions: { $sum: { $cond: [{ $eq: ["$eventType", "conversion"] }, 1, 0] } },
          revenue: { $sum: "$earnedZarSnapshot" },
        },
      },
      { $sort: { "_id.t": 1 } },
    ]);
    const byPlatform = await SponsoredVideoImpression.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: "$platform", impressions: { $sum: 1 }, revenue: { $sum: "$earnedZarSnapshot" } } },
      { $sort: { revenue: -1 } },
    ]);
    const topAdvertisers = await SponsoredVideoImpression.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: "$advertiserId", revenue: { $sum: "$earnedZarSnapshot" }, impressions: { $sum: 1 } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]);
    res.json({
      data: {
        from,
        to,
        trend: trend.map((r: any) => ({ period: r._id.t, ...r, _id: undefined })),
        byPlatform: byPlatform.map((r: any) => ({ platform: r._id || "unknown", impressions: r.impressions, revenue: Number(r.revenue || 0) })),
        topAdvertisers,
      },
    });
  } catch (e) {
    next(e);
  }
});

export default router;
