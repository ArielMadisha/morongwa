import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Advertiser from "../data/models/Advertiser";
import SponsoredVideoAd from "../data/models/SponsoredVideoAd";
import SponsoredVideoImpression from "../data/models/SponsoredVideoImpression";
import AdTransaction from "../data/models/AdTransaction";
import { AppError } from "../middleware/errorHandler";
import { isSponsoredVideoUrl } from "../services/sponsoredVideoAdService";
import { creditAdvertiserWallet } from "../services/sponsoredAdBilling";
import {
  advertiserWebGateOk,
  inferModuleCategoryFromLegacyPlacementKey,
  inferModuleCategoryFromPlacements,
  resolveAdvertiserCreativePlacements,
} from "../utils/advertiserWebSurface";

const router = express.Router();

const OTP_EXP_MS = 5 * 60 * 1000;
const advertiserOtpStore = new Map<string, { otp: string; expiresAt: number; payload: any }>();

function advertiserToken(advertiserId: string): string {
  const secret = String(process.env.JWT_SECRET || "dev-secret-change-this-in-production-2024");
  return jwt.sign({ advertiserId, type: "advertiser" }, secret, { expiresIn: "7d" });
}

async function requireAdvertiser(req: Request): Promise<any> {
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
    const existing = await Advertiser.findOne({ $or: [{ contactEmail: email }, { contactPhone: phone }] }).lean();
    if (existing) throw new AppError("Advertiser already exists", 409);
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    advertiserOtpStore.set(phone, {
      otp,
      expiresAt: Date.now() + OTP_EXP_MS,
      payload: { businessName, email, phone, password },
    });
    // In production this should dispatch SMS/WA OTP. Keeping response explicit for now.
    res.status(201).json({ message: "OTP sent", otpDebug: otp });
  } catch (e) {
    next(e);
  }
});

router.post("/advertiser/verify-otp", async (req: Request, res: Response, next) => {
  try {
    const phone = String(req.body?.phone || "").trim();
    const otp = String(req.body?.otp || "").trim();
    const row = advertiserOtpStore.get(phone);
    if (!row || Date.now() > row.expiresAt || row.otp !== otp) throw new AppError("Invalid or expired OTP", 400);
    advertiserOtpStore.delete(phone);
    const hash = await bcrypt.hash(String(row.payload.password), 10);
    const doc = await Advertiser.create({
      name: row.payload.businessName,
      companyName: row.payload.businessName,
      contactEmail: row.payload.email,
      contactPhone: row.payload.phone,
      passwordHash: hash,
      verified: true,
      active: true,
      webOnboardingStatus: "pending",
      webPackageTier: undefined,
    });
    const token = advertiserToken(String(doc._id));
    res.json({ message: "Advertiser verified", token, advertiserId: String(doc._id) });
  } catch (e) {
    next(e);
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
    const token = advertiserToken(String(doc._id));
    res.json({ token, advertiserId: String(doc._id) });
  } catch (e) {
    next(e);
  }
});

router.post("/create", async (req: Request, res: Response, next) => {
  try {
    const advertiser = await requireAdvertiser(req);
    if (!advertiserWebGateOk(advertiser)) {
      throw new AppError("Your advertising account is pending admin approval for web onboarding.", 403);
    }
    const title = String(req.body?.title || "").trim();
    const videoUrl = String(req.body?.videoUrl || "").trim();
    const cta = String(req.body?.cta || "Learn more").trim();
    const ctaUrl = String(req.body?.ctaUrl || "/").trim();
    const adType = String(req.body?.adType || "CPM").toUpperCase();
    const surface = String(req.body?.surface || "whatsapp").trim().toLowerCase();
    const mappedPlacements = resolveAdvertiserCreativePlacements(req.body);
    const legacyMc = inferModuleCategoryFromLegacyPlacementKey(req.body);
    const moduleCategory =
      surface === "whatsapp" || surface === "wa"
        ? legacyMc ?? inferModuleCategoryFromPlacements(mappedPlacements)
        : inferModuleCategoryFromPlacements(mappedPlacements);
    if (!title || !isSponsoredVideoUrl(videoUrl)) throw new AppError("Valid title and https video URL required (.mp4/.mov/.m4v)", 400);

    const dailyBudget = Math.max(0, Number(req.body?.dailyBudget || req.body?.budget || 0));
    const cpmRate = Number(req.body?.cpmRate ?? (adType === "CPM" ? 40 : 0)) || 0;
    const cpcRate = Number(req.body?.cpcRate ?? (adType === "CPC" ? 1 : 0)) || 0;
    const cpaRate = Number(req.body?.cpaRate ?? (adType === "CPA" ? 20 : 0)) || 0;
    const objective = adType === "CPA" ? "CPA" : adType === "CPC" ? "CPC" : "CPM";

    const ad = await SponsoredVideoAd.create({
      advertiserId: advertiser._id,
      title,
      videoUrl,
      caption: `${String(req.body?.description || "").trim()}\nCTA: ${cta} (${ctaUrl})`.trim(),
      placements: mappedPlacements,
      approved: false,
      active: true,
      adType,
      cpmRate,
      cpcRate,
      cpaRate,
      rateZarPerThousandImpressions: cpmRate,
      targetAudience: String((req.body?.targetAudience || [])[0] || "generic").toLowerCase(),
      moduleCategory,
      priority: Math.max(0, Number(req.body?.priority || 0)),
    });

    advertiser.objective = objective as any;
    advertiser.targetAudience = (Array.isArray(req.body?.targetAudience) ? req.body.targetAudience : [])
      .map((x: unknown) => String(x || "").toLowerCase())
      .filter(Boolean);
    advertiser.targetLocation = (Array.isArray(req.body?.targetLocation) ? req.body.targetLocation : [])
      .map((x: unknown) => String(x || "").trim())
      .filter(Boolean);
    advertiser.behaviourTags = (Array.isArray(req.body?.behaviourTags) ? req.body.behaviourTags : [])
      .map((x: unknown) => String(x || "").trim())
      .filter(Boolean);
    advertiser.budget = dailyBudget;
    advertiser.startDate = req.body?.startDate ? new Date(req.body.startDate) : undefined;
    advertiser.endDate = req.body?.endDate ? new Date(req.body.endDate) : undefined;
    await advertiser.save();

    res.status(201).json({ data: ad, message: "Campaign created and pending approval" });
  } catch (e) {
    next(e);
  }
});

router.get("/performance", async (req: Request, res: Response, next) => {
  try {
    const advertiser = await requireAdvertiser(req);
    const ads = await SponsoredVideoAd.find({ advertiserId: advertiser._id }).lean();
    const adIds = ads.map((a: any) => a._id).filter(Boolean);
    const metrics = await SponsoredVideoImpression.aggregate([
      { $match: { adId: { $in: adIds } } },
      {
        $group: {
          _id: "$adId",
          impressions: { $sum: { $cond: [{ $eq: ["$eventType", "impression"] }, 1, 0] } },
          clicks: { $sum: { $cond: [{ $eq: ["$eventType", "click"] }, 1, 0] } },
          conversions: { $sum: { $cond: [{ $eq: ["$eventType", "conversion"] }, 1, 0] } },
          revenue: { $sum: "$earnedZarSnapshot" },
        },
      },
    ]);
    const metricByAd = new Map(metrics.map((m: any) => [String(m._id), m]));
    const data = ads.map((a: any) => {
      const m: any = metricByAd.get(String(a._id)) || {};
      const impressions = Number(m.impressions || 0);
      const clicks = Number(m.clicks || 0);
      const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
      return {
        adId: String(a._id),
        title: a.title,
        status: a.active ? (a.approved ? "active" : "pending_approval") : "paused",
        impressions,
        clicks,
        conversions: Number(m.conversions || 0),
        ctr,
        spend: Number((m.revenue || 0).toFixed(2)),
      };
    });
    res.json({ data });
  } catch (e) {
    next(e);
  }
});

router.post("/payment", async (req: Request, res: Response, next) => {
  try {
    const advertiser = await requireAdvertiser(req);
    const amount = Math.max(0, Number(req.body?.amount || 0));
    const method = String(req.body?.method || "card");
    if (!amount) throw new AppError("amount is required", 400);
    const { walletBalance } = await creditAdvertiserWallet({
      advertiser,
      amount,
      method,
      description: `Advertiser prepaid credit via ${method}`,
    });
    res.json({
      message: "Top-up credited (gateway settlement still required for production card/EFT flows)",
      amount,
      method,
      status: "credited",
      walletBalance,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/wallet/topup", async (req: Request, res: Response, next) => {
  try {
    const advertiser = await requireAdvertiser(req);
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
  } catch (e) {
    next(e);
  }
});

router.get("/wallet/summary", async (req: Request, res: Response, next) => {
  try {
    const advertiser = await requireAdvertiser(req);
    const rows = await AdTransaction.find({ advertiserId: advertiser._id })
      .sort({ createdAt: -1 })
      .limit(40)
      .lean();
    res.json({
      data: {
        advertiserId: String(advertiser._id),
        walletBalance: Number(advertiser.walletBalance || 0),
        totalSpent: Number(advertiser.totalSpent || 0),
        status: String(advertiser.status || "active"),
        recentTransactions: rows,
      },
    });
  } catch (e) {
    next(e);
  }
});

export default router;

