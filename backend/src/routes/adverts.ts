import express, { Request, Response } from "express";
import Advert from "../data/models/Advert";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import SponsoredVideoAd from "../data/models/SponsoredVideoAd";
import SponsoredVideoImpression from "../data/models/SponsoredVideoImpression";
import Advertiser from "../data/models/Advertiser";
import AdTransaction from "../data/models/AdTransaction";
import PlatformAdRevenue from "../data/models/PlatformAdRevenue";
import { AppError } from "../middleware/errorHandler";
import { isSponsoredVideoUrl } from "../services/sponsoredVideoAdService";
import {
  advertiserWebGateOk,
  inferModuleCategoryFromLegacyPlacementKey,
  inferModuleCategoryFromPlacements,
  resolveAdvertiserCreativePlacements,
} from "../utils/advertiserWebSurface";
import {
  AUDIENCE_MULTIPLIER,
  calcAdvertiserEventCharge,
  creditAdvertiserWallet,
  dateKeyFrom,
  impressionRateLimitPerUserPerHour,
  round2,
  splitGrossAdvertiserCharge,
} from "../services/sponsoredAdBilling";

const router = express.Router();

/** Get active adverts by slot. Public endpoint. */
router.get("/", async (req: Request, res: Response, next) => {
  try {
    const { slot } = req.query;
    const now = new Date();

    const query: any = {
      active: true,
      $and: [
        { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }] },
      ],
    };
    if (slot && (slot === "random" || slot === "promo")) {
      query.slot = slot;
    }

    const adverts = await Advert.find(query)
      .sort({ order: 1, createdAt: -1 })
      .limit(20)
      .lean();

    res.json({ data: adverts });
  } catch (err) {
    next(err);
  }
});

/** Placement-aware sponsored ad loader for web/mobile/WA surfaces. */
router.get("/sponsored", async (req: Request, res: Response, next) => {
  try {
    const now = new Date();
    const placement = String(req.query.placement || "general").trim().toLowerCase();
    const audience = String(req.query.audience || "generic").trim().toLowerCase();
    const platform = String(req.query.platform || "web").trim().toLowerCase();
    const limitRaw = Number(req.query.limit || 1);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5, Math.floor(limitRaw))) : 1;

    const placementRegex = new RegExp(`^${placement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    const webPlacementRegex = new RegExp(
      `^web[_:-]?${placement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      "i"
    );

    const match: any = {
      active: true,
      approved: true,
      $and: [
        { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }] },
      ],
      $or: [
        { moduleCategory: placementRegex },
        { placements: placementRegex },
        { placements: webPlacementRegex },
      ],
    };

    let docs = await SponsoredVideoAd.find(match)
      .populate("advertiserId", "name companyName contactEmail")
      .sort({ priority: -1, weight: -1, updatedAt: -1 })
      .limit(40)
      .lean();
    if (!docs.length) {
      docs = await SponsoredVideoAd.find({
        active: true,
        approved: true,
        $and: [
          { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
          { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }] },
        ],
      })
        .populate("advertiserId", "name companyName contactEmail")
        .sort({ priority: -1, weight: -1, updatedAt: -1 })
        .limit(40)
        .lean();
    }

    const scoped = docs.filter((d: any) => {
      const target = String(d?.targetAudience || "generic").toLowerCase();
      return target === "generic" || target === audience;
    });
    const selected = (scoped.length ? scoped : docs).slice(0, limit);

    res.json({
      data: selected.map((d: any) => {
        const adv = d.advertiserId && typeof d.advertiserId === "object" ? d.advertiserId : null;
        const advertiserName = String(adv?.companyName || adv?.name || "").trim();
        return {
          id: String(d._id),
          title: String(d.title || "Sponsored"),
          caption: String(d.caption || ""),
          videoUrl: String(d.videoUrl || ""),
          imageUrl: String(d.imageUrl || d.thumbnailUrl || ""),
          advertiserName: advertiserName || "Sponsored",
          ctaLabel: "Learn more",
          ctaUrl: String(d.clickUrl || d.linkUrl || "/marketplace"),
          adType: String(d.adType || "CPM"),
          targetAudience: String(d.targetAudience || "generic"),
          moduleCategory: String(d.moduleCategory || "general"),
          placement,
          platform,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

async function recordAdEvent(
  req: Request,
  res: Response,
  eventType: "impression" | "click" | "conversion"
) {
  const adId = String(req.body?.adId || "").trim();
  if (!mongoose.isValidObjectId(adId)) {
    return res.status(400).json({ error: "adId is required" });
  }
  const ad = await SponsoredVideoAd.findById(adId).lean();
  if (!ad || !ad.active) return res.status(404).json({ error: "Ad not found" });

  const platformRaw = String(req.body?.platform || "whatsapp").toLowerCase();
  const platform =
    platformRaw === "web" || platformRaw === "android" || platformRaw === "ios" || platformRaw === "whatsapp"
      ? platformRaw
      : "whatsapp";
  const audienceRaw = String(req.body?.audience || String((ad as any)?.targetAudience || "generic")).toLowerCase();
  const audience = AUDIENCE_MULTIPLIER[audienceRaw] ? audienceRaw : "generic";
  const placementKey = String(
    req.body?.placementKey || String((ad as any)?.moduleCategory || "general")
  ).slice(0, 64);
  const menuKey = String(req.body?.menuKey || "").slice(0, 8) || undefined;
  const userExternalId = String(req.body?.userId || "").slice(0, 128) || undefined;
  const phoneRaw = String(req.body?.phone || "").replace(/\D/g, "");
  const phoneHash = phoneRaw
    ? require("crypto").createHash("sha256").update(`ad:${phoneRaw}`).digest("hex").slice(0, 32)
    : undefined;
  const earned = calcAdvertiserEventCharge(ad, eventType, audience);

  const channel: "whatsapp" | "web" = platform === "whatsapp" ? "whatsapp" : "web";

  // Impression rate-limit per viewer (fraud / bot noise).
  if (eventType === "impression" && (userExternalId || phoneHash)) {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const cap = impressionRateLimitPerUserPerHour();
    const impCount = await SponsoredVideoImpression.countDocuments({
      adId: (ad as any)._id,
      eventType: "impression",
      createdAt: { $gte: since },
      $or: [...(userExternalId ? [{ userExternalId }] : []), ...(phoneHash ? [{ phoneHash }] : [])],
    });
    if (impCount >= cap) {
      return res.status(200).json({
        data: {
          adId: String((ad as any)._id),
          eventType,
          platform,
          audience,
          revenue: 0,
          rateLimited: true,
        },
      });
    }
  }

  // Basic fraud-protection guardrails for repeated quick events.
  if ((eventType === "impression" || eventType === "click") && (userExternalId || phoneHash)) {
    const dedupeWindowStart = new Date(Date.now() - 60 * 60 * 1000);
    const duplicate = await SponsoredVideoImpression.findOne({
      adId: (ad as any)._id,
      eventType,
      createdAt: { $gte: dedupeWindowStart },
      $or: [
        ...(userExternalId ? [{ userExternalId }] : []),
        ...(phoneHash ? [{ phoneHash }] : []),
      ],
    }).select("_id").lean();
    if (duplicate) {
      return res.status(200).json({
        data: {
          adId: String((ad as any)._id),
          eventType,
          platform,
          audience,
          revenue: 0,
          deduped: true,
        },
      });
    }
  }

  const advertiserDoc = await Advertiser.findById((ad as any).advertiserId);
  if (!advertiserDoc) {
    return res.status(404).json({ error: "Advertiser not found for ad" });
  }

  const currentBalance = Number((advertiserDoc as any).walletBalance || 0);
  const charge = round2(earned);
  const { platformShare, partnerShare } = splitGrossAdvertiserCharge(charge);

  if (charge > 0 && currentBalance < charge) {
    // Auto-pause on low advertiser balance (prepaid model)
    await SponsoredVideoAd.updateOne({ _id: (ad as any)._id }, { $set: { active: false } });
    advertiserDoc.status = "paused";
    await advertiserDoc.save();
    return res.status(200).json({
      data: {
        adId: String((ad as any)._id),
        eventType,
        platform,
        audience,
        revenue: 0,
        paused: true,
        reason: "INSUFFICIENT_AD_BALANCE",
      },
    });
  }

  const row = await SponsoredVideoImpression.create({
    adId: (ad as any)._id,
    advertiserId: (ad as any).advertiserId,
    placementKey,
    channel,
    platform,
    eventType,
    menuKey,
    audience,
    userExternalId,
    earnedZarSnapshot: earned,
    phoneHash,
  });

  if (charge > 0) {
    const nextBalance = round2(currentBalance - charge);
    (advertiserDoc as any).walletBalance = nextBalance;
    (advertiserDoc as any).totalSpent = round2(Number((advertiserDoc as any).totalSpent || 0) + charge);
    (advertiserDoc as any).status = nextBalance <= 0 ? "paused" : "active";
    await advertiserDoc.save();

    await AdTransaction.create({
      advertiserId: advertiserDoc._id,
      adId: (ad as any)._id,
      eventId: row._id,
      eventType,
      amount: charge,
      type: "debit",
      description: `Ad ${eventType} charge`,
      platformShare,
      partnerShare,
      balanceAfter: nextBalance,
    });

    const dateKey = dateKeyFrom(new Date());
    const metricField =
      eventType === "impression" ? { impressions: 1 } : eventType === "click" ? { clicks: 1 } : { conversions: 1 };
    await PlatformAdRevenue.updateOne(
      { dateKey, platform: platform as any },
      {
        $setOnInsert: { dateKey, platform },
        $inc: {
          totalRevenue: charge,
          platformShare,
          partnerShare,
          ...metricField,
        },
      },
      { upsert: true }
    );
  }
  res.status(201).json({
    data: {
      id: row._id,
      adId: String((ad as any)._id),
      eventType,
      platform,
      audience,
      revenue: earned,
      balanceAfter: Number((advertiserDoc as any).walletBalance || 0),
      platformShare,
      partnerShare,
    },
  });
}

router.post("/impression", async (req: Request, res: Response, next) => {
  try {
    await recordAdEvent(req, res, "impression");
  } catch (err) {
    next(err);
  }
});

router.post("/click", async (req: Request, res: Response, next) => {
  try {
    await recordAdEvent(req, res, "click");
  } catch (err) {
    next(err);
  }
});

router.post("/conversion", async (req: Request, res: Response, next) => {
  try {
    await recordAdEvent(req, res, "conversion");
  } catch (err) {
    next(err);
  }
});

router.get("/metrics", async (req: Request, res: Response, next) => {
  try {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const rows = await SponsoredVideoImpression.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: "$eventType",
          count: { $sum: 1 },
          revenue: { $sum: "$earnedZarSnapshot" },
        },
      },
    ]);
    const byType = Object.fromEntries(
      rows.map((r: any) => [String(r._id), { count: Number(r.count || 0), revenue: Math.round(Number(r.revenue || 0) * 100) / 100 }])
    );
    const impressions = Number(byType.impression?.count || 0);
    const clicks = Number(byType.click?.count || 0);
    const conversions = Number(byType.conversion?.count || 0);
    const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;
    res.json({
      data: {
        from,
        to,
        impressions,
        clicks,
        conversions,
        ctr,
        revenue:
          Math.round(
            ((byType.impression?.revenue || 0) + (byType.click?.revenue || 0) + (byType.conversion?.revenue || 0)) *
              100
          ) / 100,
        byType,
      },
    });
  } catch (err) {
    next(err);
  }
});

const advertiserOtpStore = new Map<string, { otp: string; expiresAt: number; payload: any }>();
const ADVERTISER_OTP_EXP_MS = 5 * 60 * 1000;

function signAdvertiserToken(advertiserId: string): string {
  const secret = String(process.env.JWT_SECRET || "dev-secret-change-this-in-production-2024");
  return jwt.sign({ advertiserId, type: "advertiser" }, secret, { expiresIn: "7d" });
}

async function getAdvertiserFromBearer(req: Request) {
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new AppError("Unauthorized", 401);
  const secret = String(process.env.JWT_SECRET || "dev-secret-change-this-in-production-2024");
  const decoded: any = jwt.verify(token, secret);
  if (!decoded?.advertiserId) throw new AppError("Unauthorized", 401);
  const advertiser = await Advertiser.findById(decoded.advertiserId);
  if (!advertiser) throw new AppError("Advertiser not found", 404);
  return advertiser;
}

router.post("/advertiser/signup", async (req: Request, res: Response, next) => {
  try {
    const businessName = String(req.body?.businessName || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const phone = String(req.body?.phone || "").trim();
    const password = String(req.body?.password || "");
    if (!businessName || !email || !phone || password.length < 6) {
      throw new AppError("businessName, email, phone, password(>=6) are required", 400);
    }
    const exists = await Advertiser.findOne({ $or: [{ contactEmail: email }, { contactPhone: phone }] }).lean();
    if (exists) throw new AppError("Advertiser already exists", 409);
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    advertiserOtpStore.set(phone, {
      otp,
      expiresAt: Date.now() + ADVERTISER_OTP_EXP_MS,
      payload: { businessName, email, phone, password },
    });
    res.status(201).json({ message: "OTP sent", otpDebug: otp });
  } catch (err) {
    next(err);
  }
});

router.post("/advertiser/verify-otp", async (req: Request, res: Response, next) => {
  try {
    const phone = String(req.body?.phone || "").trim();
    const otp = String(req.body?.otp || "").trim();
    const row = advertiserOtpStore.get(phone);
    if (!row || Date.now() > row.expiresAt || row.otp !== otp) throw new AppError("Invalid or expired OTP", 400);
    advertiserOtpStore.delete(phone);
    const passwordHash = await bcrypt.hash(String(row.payload.password), 10);
    const doc = await Advertiser.create({
      name: row.payload.businessName,
      companyName: row.payload.businessName,
      contactEmail: row.payload.email,
      contactPhone: row.payload.phone,
      passwordHash,
      verified: true,
      active: true,
      webOnboardingStatus: "pending",
    });
    res.json({ message: "Advertiser verified", advertiserId: String(doc._id), token: signAdvertiserToken(String(doc._id)) });
  } catch (err) {
    next(err);
  }
});

router.post("/advertiser/login", async (req: Request, res: Response, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const doc = await Advertiser.findOne({ contactEmail: email }).select("+passwordHash");
    if (!doc || !doc.passwordHash) throw new AppError("Invalid credentials", 401);
    const ok = await bcrypt.compare(password, doc.passwordHash);
    if (!ok) throw new AppError("Invalid credentials", 401);
    res.json({ advertiserId: String(doc._id), token: signAdvertiserToken(String(doc._id)) });
  } catch (err) {
    next(err);
  }
});

router.post("/create", async (req: Request, res: Response, next) => {
  try {
    const advertiser = await getAdvertiserFromBearer(req);
    if (!advertiserWebGateOk(advertiser)) {
      throw new AppError("Your advertising account is pending admin approval for web onboarding.", 403);
    }
    const title = String(req.body?.title || "").trim();
    const videoUrl = String(req.body?.videoUrl || "").trim();
    if (!title || !isSponsoredVideoUrl(videoUrl)) throw new AppError("Valid title and videoUrl required", 400);
    const surface = String(req.body?.surface || "whatsapp").trim().toLowerCase();
    const placements = resolveAdvertiserCreativePlacements(req.body);
    const legacyMc = inferModuleCategoryFromLegacyPlacementKey(req.body);
    const moduleCategory =
      surface === "whatsapp" || surface === "wa"
        ? legacyMc ?? inferModuleCategoryFromPlacements(placements)
        : inferModuleCategoryFromPlacements(placements);
    const adType = String(req.body?.adType || "CPM").toUpperCase();
    const ad = await SponsoredVideoAd.create({
      advertiserId: advertiser._id,
      title,
      videoUrl,
      caption: String(req.body?.description || "").trim() || undefined,
      placements,
      approved: false,
      active: true,
      adType,
      cpmRate: Number(req.body?.cpmRate ?? (adType === "CPM" ? 40 : 0)) || 0,
      cpcRate: Number(req.body?.cpcRate ?? (adType === "CPC" ? 1 : 0)) || 0,
      cpaRate: Number(req.body?.cpaRate ?? (adType === "CPA" ? 20 : 0)) || 0,
      rateZarPerThousandImpressions: Number(req.body?.cpmRate ?? (adType === "CPM" ? 40 : 0)) || 0,
      targetAudience: String((Array.isArray(req.body?.targetAudience) ? req.body.targetAudience[0] : req.body?.targetAudience) || "generic").toLowerCase(),
      moduleCategory,
      priority: Math.max(0, Number(req.body?.priority || 0)),
    });
    res.status(201).json({ data: ad, message: "Campaign created and pending approval" });
  } catch (err) {
    next(err);
  }
});

router.get("/performance", async (req: Request, res: Response, next) => {
  try {
    const advertiser = await getAdvertiserFromBearer(req);
    const ads = await SponsoredVideoAd.find({ advertiserId: advertiser._id }).lean();
    const adIds = ads.map((a: any) => a._id).filter(Boolean);
    const agg = await SponsoredVideoImpression.aggregate([
      { $match: { adId: { $in: adIds } } },
      {
        $group: {
          _id: "$adId",
          impressions: { $sum: { $cond: [{ $eq: ["$eventType", "impression"] }, 1, 0] } },
          clicks: { $sum: { $cond: [{ $eq: ["$eventType", "click"] }, 1, 0] } },
          conversions: { $sum: { $cond: [{ $eq: ["$eventType", "conversion"] }, 1, 0] } },
          spend: { $sum: "$earnedZarSnapshot" },
        },
      },
    ]);
    const byId = new Map(agg.map((x: any) => [String(x._id), x]));
    res.json({
      data: ads.map((a: any) => {
        const m: any = byId.get(String(a._id)) || {};
        const impressions = Number(m.impressions || 0);
        const clicks = Number(m.clicks || 0);
        return {
          adId: String(a._id),
          title: a.title,
          impressions,
          clicks,
          conversions: Number(m.conversions || 0),
          ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
          spend: Number((m.spend || 0).toFixed(2)),
          status: a.active ? (a.approved ? "active" : "pending_approval") : "paused",
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/payment", async (req: Request, res: Response, next) => {
  try {
    const advertiser = await getAdvertiserFromBearer(req);
    const amount = Math.max(0, Number(req.body?.amount || 0));
    const method = String(req.body?.method || "card");
    if (!amount) throw new AppError("amount is required", 400);
    const { walletBalance } = await creditAdvertiserWallet({
      advertiser,
      amount,
      method,
      description: `Advertiser top-up via ${method}`,
    });
    res.json({
      message: "Top-up recorded",
      amount,
      method,
      status: "credited",
      walletBalance,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/wallet/topup", async (req: Request, res: Response, next) => {
  try {
    const advertiser = await getAdvertiserFromBearer(req);
    const amount = Math.max(0, Number(req.body?.amount || 0));
    const method = String(req.body?.method || "card");
    if (!amount) throw new AppError("amount is required", 400);
    const { walletBalance } = await creditAdvertiserWallet({
      advertiser,
      amount,
      method,
      description: `Advertiser wallet top-up via ${method}`,
    });
    res.json({ message: "Wallet topped up", walletBalance });
  } catch (err) {
    next(err);
  }
});

router.get("/wallet/summary", async (req: Request, res: Response, next) => {
  try {
    const advertiser = await getAdvertiserFromBearer(req);
    const rows = await AdTransaction.find({ advertiserId: advertiser._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
    res.json({
      data: {
        advertiserId: String(advertiser._id),
        walletBalance: Number((advertiser as any).walletBalance || 0),
        totalSpent: Number((advertiser as any).totalSpent || 0),
        status: String((advertiser as any).status || "active"),
        recentTransactions: rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
