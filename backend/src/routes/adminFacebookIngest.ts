import express, { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import {
  FACEBOOK_TV_BOT_LABELS,
  FACEBOOK_TV_INGEST_SLOTS,
} from "../config/facebookTvIngest";
import { getFacebookIngestStatus, runFacebookTvIngestForSlot } from "../services/facebookTvIngestService";
import { getFacebookTvIngestSchedulerStatus } from "../services/facebookTvIngestScheduler";
import { isFacebookGraphConfigured, debugFacebookAccessToken, missingFacebookPublishScopes } from "../services/facebookGraphApi";
import {
  getQwertymatesFacebookPageId,
  publishProductToQwertymatesFacebook,
} from "../services/facebookMarketplacePostService";
import AuditLog from "../data/models/AuditLog";

const router = express.Router();

router.get("/status", async (_req: AuthRequest, res: Response) => {
  let marketplacePost: Record<string, unknown> = {
    pageId: getQwertymatesFacebookPageId(),
    autoPostEnabled: !["0", "false", "off", "no"].includes(
      String(process.env.FACEBOOK_MARKETPLACE_AUTO_POST || "1").trim().toLowerCase()
    ),
  };
  if (isFacebookGraphConfigured()) {
    try {
      const debug = await debugFacebookAccessToken();
      marketplacePost = {
        ...marketplacePost,
        tokenValid: debug.isValid,
        tokenScopes: debug.scopes,
        missingPublishScopes: missingFacebookPublishScopes(debug.scopes),
      };
    } catch (e) {
      marketplacePost = { ...marketplacePost, tokenError: String((e as Error)?.message || e) };
    }
  }
  res.json({
    ok: true,
    graphConfigured: isFacebookGraphConfigured(),
    marketplacePost,
    bots: FACEBOOK_TV_BOT_LABELS,
    scheduler: getFacebookTvIngestSchedulerStatus(),
    ingestState: await getFacebookIngestStatus(),
    slots: FACEBOOK_TV_INGEST_SLOTS,
  });
});

router.post("/run", async (req: AuthRequest, res: Response, next) => {
  try {
    const pageSlug = String(req.body?.pageSlug || req.query?.pageSlug || "").trim();
    if (!pageSlug) throw new AppError("pageSlug required", 400);
    const slot = FACEBOOK_TV_INGEST_SLOTS.find(
      (s) => s.pageSlug.toLowerCase() === pageSlug.toLowerCase()
    );
    if (!slot) throw new AppError(`Unknown page slug: ${pageSlug}`, 404);
    const result = await runFacebookTvIngestForSlot(slot);
    await AuditLog.create({
      action: "FACEBOOK_TV_INGEST_RUN",
      user: req.user!._id,
      meta: { pageSlug, result },
    });
    res.json({ ok: result.ok, result });
  } catch (err) {
    next(err);
  }
});

router.post("/run-all", async (req: AuthRequest, res: Response, next) => {
  try {
    const results: Array<{ pageSlug: string; ok: boolean; result: unknown }> = [];
    for (const slot of FACEBOOK_TV_INGEST_SLOTS) {
      const result = await runFacebookTvIngestForSlot(slot);
      results.push({ pageSlug: slot.pageSlug, ok: result.ok, result });
    }
    await AuditLog.create({
      action: "FACEBOOK_TV_INGEST_RUN_ALL",
      user: req.user!._id,
      meta: { count: results.length },
    });
    res.json({ ok: true, results });
  } catch (err) {
    next(err);
  }
});

/** Manually post (or re-post) one marketplace product to the Qwertymates Facebook Page. */
router.post("/marketplace-post/:productId", async (req: AuthRequest, res: Response, next) => {
  try {
    const force = req.body?.force === true || req.query?.force === "1";
    const result = await publishProductToQwertymatesFacebook(String(req.params.productId), { force });
    await AuditLog.create({
      action: "FACEBOOK_MARKETPLACE_POST",
      user: req.user!._id,
      meta: { productId: req.params.productId, force, result },
    });
    if (!result.ok) throw new AppError(result.error, 502);
    res.json({ ok: true, result });
  } catch (err) {
    next(err);
  }
});

export default router;
