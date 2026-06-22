import cron from "node-cron";
import { logger } from "./monitoring";
import { publishWorldCupTvUpdates, resolveWorldCupCreatorUsername } from "./worldCupTvService";
import { AppError } from "../middleware/errorHandler";

let started = false;
let liveTimer: NodeJS.Timeout | null = null;

type RunState = {
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastErrorAt?: string;
  lastErrorMessage?: string;
  lastCreated?: number;
};

const status: { daily: RunState; live: RunState } = { daily: {}, live: {} };

function markStart(key: keyof typeof status): void {
  status[key].lastRunAt = new Date().toISOString();
}

function markSuccess(key: keyof typeof status, created: number): void {
  status[key].lastSuccessAt = new Date().toISOString();
  status[key].lastCreated = created;
  status[key].lastErrorAt = undefined;
  status[key].lastErrorMessage = undefined;
}

function markError(key: keyof typeof status, err: unknown): void {
  status[key].lastErrorAt = new Date().toISOString();
  status[key].lastErrorMessage = err instanceof Error ? err.message : String(err || "Unknown error");
}

export function getWorldCupTvSchedulerStatus() {
  return {
    daily: { ...status.daily },
    live: { ...status.live },
  };
}

async function runDaily(): Promise<void> {
  markStart("daily");
  try {
    const result = await publishWorldCupTvUpdates({ mode: "daily" });
    if (result.created > 0) {
      logger.info(`World Cup TV daily: published ${result.created} post(s) → @${resolveWorldCupCreatorUsername()}`);
    } else {
      logger.info(`World Cup TV daily: ${result.message || "no new posts"}`);
    }
    markSuccess("daily", result.created);
  } catch (err) {
    markError("daily", err);
    logger.error("World Cup TV daily run failed:", err);
  }
}

async function runLive(): Promise<void> {
  markStart("live");
  try {
    const result = await publishWorldCupTvUpdates({ mode: "live" });
    if (result.created > 0) {
      logger.info(`World Cup TV live: published ${result.created} post(s)`);
    }
    markSuccess("live", result.created);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 409) {
      markSuccess("live", 0);
      return;
    }
    markError("live", err);
    logger.error("World Cup TV live tick failed:", err);
  }
}

export function initializeWorldCupTvScheduler(): void {
  if (started) return;
  started = true;

  const enabled = String(process.env.WORLD_CUP_TV_ENABLED || "true").trim() !== "false";
  if (!enabled) {
    logger.info("World Cup TV scheduler disabled (WORLD_CUP_TV_ENABLED=false)");
    return;
  }

  const timezone = String(
    process.env.WORLD_CUP_TV_TIMEZONE || process.env.AI_NEWS_TIMEZONE || "Africa/Johannesburg"
  ).trim();
  const dailyCron = String(process.env.WORLD_CUP_TV_CRON || "0 7,19 * * *").trim();

  try {
    cron.schedule(dailyCron, () => void runDaily(), { timezone });
    logger.info(`World Cup TV daily scheduler active (${dailyCron}, ${timezone}) → @${resolveWorldCupCreatorUsername()}`);
  } catch (err) {
    logger.error(`World Cup TV daily scheduler invalid cron "${dailyCron}"`, err);
  }

  const liveInterval = Math.max(
    0,
    Math.min(120, Number(process.env.WORLD_CUP_TV_LIVE_INTERVAL_MINUTES || "25"))
  );
  if (liveInterval > 0) {
    const runOnStart = String(process.env.WORLD_CUP_TV_LIVE_RUN_ON_START || "false").trim() !== "false";
    if (runOnStart) void runLive();
    liveTimer = setInterval(() => void runLive(), liveInterval * 60 * 1000);
    logger.info(`World Cup TV live scheduler active (every ${liveInterval} min)`);
  }

  const runDailyOnStart = String(process.env.WORLD_CUP_TV_RUN_ON_START || "false").trim() !== "false";
  if (runDailyOnStart) void runDaily();
}
