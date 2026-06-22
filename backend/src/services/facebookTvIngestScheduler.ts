import cron, { ScheduledTask } from "node-cron";
import { FACEBOOK_TV_INGEST_SLOTS } from "../config/facebookTvIngest";
import { runFacebookTvIngestForSlot } from "./facebookTvIngestService";
import { isFacebookGraphConfigured } from "./facebookGraphApi";
import { logger } from "./monitoring";
import { isDbConnected } from "../data/db";
import { isWorldNewsAutopostDay } from "../utils/worldNewsSchedule";

let started = false;
const scheduledTasks: ScheduledTask[] = [];

const slotRunState: Record<
  string,
  { lastRunAt?: string; lastOk?: boolean; lastMessage?: string }
> = {};

function slotKey(pageSlug: string, cronExpr: string): string {
  return `${pageSlug}::${cronExpr}`;
}

export function getFacebookTvIngestSchedulerStatus() {
  return {
    enabled: process.env.FACEBOOK_TV_INGEST_ENABLED !== "0",
    graphConfigured: isFacebookGraphConfigured(),
    timezone: process.env.FACEBOOK_TV_INGEST_TZ || "Africa/Johannesburg",
    slots: FACEBOOK_TV_INGEST_SLOTS.map((s) => ({
      botId: s.botId,
      pageSlug: s.pageSlug,
      pageLabel: s.pageLabel,
      cron: s.cron,
      ...(slotRunState[slotKey(s.pageSlug, s.cron)] || {}),
    })),
  };
}

export function startFacebookTvIngestScheduler(): void {
  if (started) return;
  if (process.env.FACEBOOK_TV_INGEST_ENABLED === "0") {
    logger.info("Facebook TV ingest scheduler disabled (FACEBOOK_TV_INGEST_ENABLED=0)");
    return;
  }

  const tz = process.env.FACEBOOK_TV_INGEST_TZ || "Africa/Johannesburg";

  for (const slot of FACEBOOK_TV_INGEST_SLOTS) {
    if (!cron.validate(slot.cron)) {
      logger.warn(`Facebook TV ingest: invalid cron for ${slot.pageSlug}: ${slot.cron}`);
      continue;
    }
    const key = slotKey(slot.pageSlug, slot.cron);
    const task = cron.schedule(
      slot.cron,
      async () => {
        if (!isDbConnected()) {
          logger.warn("Facebook TV ingest skipped: DB not connected");
          return;
        }
        slotRunState[key] = { lastRunAt: new Date().toISOString() };
        try {
          if (slot.botId === "sports") {
            const tz = process.env.FACEBOOK_TV_INGEST_TZ || "Africa/Johannesburg";
            if (!isWorldNewsAutopostDay(new Date(), tz)) {
              slotRunState[key] = {
                lastRunAt: new Date().toISOString(),
                lastOk: true,
                lastMessage: "skipped: @worldnews sports ingest only on Tuesday/Friday",
              };
              return;
            }
          }
          const result = await runFacebookTvIngestForSlot(slot);
          slotRunState[key] = {
            lastRunAt: new Date().toISOString(),
            lastOk: result.ok,
            lastMessage: result.skipped
              ? result.reason || "skipped"
              : result.tvPostId
                ? `published ${result.tvPostId}`
                : result.reason,
          };
        } catch (err) {
          slotRunState[key] = {
            lastRunAt: new Date().toISOString(),
            lastOk: false,
            lastMessage: String((err as Error)?.message || err),
          };
          logger.error("Facebook TV ingest cron error", { page: slot.pageSlug, err });
        }
      },
      { timezone: tz }
    );
    scheduledTasks.push(task);
  }

  started = true;
  logger.info(
    `Facebook TV ingest scheduler started (${FACEBOOK_TV_INGEST_SLOTS.length} slots, tz=${tz}, graph=${isFacebookGraphConfigured() ? "yes" : "NO TOKEN"})`
  );
}

export function stopFacebookTvIngestScheduler(): void {
  for (const t of scheduledTasks) {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  }
  scheduledTasks.length = 0;
  started = false;
}
