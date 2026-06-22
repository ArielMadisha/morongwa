import express, { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import {
  FACEBOOK_TV_BOT_LABELS,
  FACEBOOK_TV_INGEST_SLOTS,
} from "../config/facebookTvIngest";
import { getFacebookIngestStatus, runFacebookTvIngestForSlot } from "../services/facebookTvIngestService";
import { getFacebookTvIngestSchedulerStatus } from "../services/facebookTvIngestScheduler";
import { isFacebookGraphConfigured } from "../services/facebookGraphApi";
import AuditLog from "../data/models/AuditLog";

const router = express.Router();

router.get("/status", async (_req: AuthRequest, res: Response) => {
  res.json({
    ok: true,
    graphConfigured: isFacebookGraphConfigured(),
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

export default router;
