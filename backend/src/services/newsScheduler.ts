import cron from "node-cron";
import { logger } from "./monitoring";
import {
  generateAiNewsBatchForToday,
  generateAndPublishAiNewsPost,
  rejectIncompleteAiNewsPosts,
} from "./aiNewsService";
import { AppError } from "../middleware/errorHandler";
import { isWorldNewsAutopostDay } from "../utils/worldNewsSchedule";

let started = false;
let realtimeTimer: NodeJS.Timeout | null = null;
let realtimeWindowStartedAt = Date.now();
let realtimePublishedInWindow = 0;

type SchedulerRunState = {
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastErrorAt?: string;
  lastErrorMessage?: string;
};

const schedulerStatus: {
  techDaily: SchedulerRunState;
  techRealtime: SchedulerRunState;
  sports: SchedulerRunState;
  entertainment: SchedulerRunState;
  motoring: SchedulerRunState;
} = {
  techDaily: {},
  techRealtime: {},
  sports: {},
  entertainment: {},
  motoring: {},
};

function markRunStart(key: keyof typeof schedulerStatus): void {
  schedulerStatus[key].lastRunAt = new Date().toISOString();
}

function markRunSuccess(key: keyof typeof schedulerStatus): void {
  schedulerStatus[key].lastSuccessAt = new Date().toISOString();
  schedulerStatus[key].lastErrorAt = undefined;
  schedulerStatus[key].lastErrorMessage = undefined;
}

function markRunError(key: keyof typeof schedulerStatus, err: unknown): void {
  schedulerStatus[key].lastErrorAt = new Date().toISOString();
  schedulerStatus[key].lastErrorMessage = err instanceof Error ? err.message : String(err || "Unknown error");
}

export function getNewsSchedulerStatus() {
  return {
    techDaily: { ...schedulerStatus.techDaily },
    techRealtime: { ...schedulerStatus.techRealtime },
    sports: { ...schedulerStatus.sports },
    entertainment: { ...schedulerStatus.entertainment },
    motoring: { ...schedulerStatus.motoring },
  };
}

function resetRealtimeWindowIfNeeded() {
  const now = Date.now();
  if (now - realtimeWindowStartedAt >= 60 * 60 * 1000) {
    realtimeWindowStartedAt = now;
    realtimePublishedInWindow = 0;
  }
}

async function runRealtimeTick(maxPerHour: number): Promise<void> {
  markRunStart("techRealtime");
  const timezone = String(process.env.AI_NEWS_TIMEZONE || "Africa/Johannesburg").trim();
  if (!isWorldNewsAutopostDay(new Date(), timezone)) {
    logger.info("AI news realtime skipped: @worldnews autopost runs on Tuesday/Friday only");
    return;
  }
  resetRealtimeWindowIfNeeded();
  if (realtimePublishedInWindow >= maxPerHour) {
    logger.info(
      `AI news realtime skipped: hourly cap reached (${realtimePublishedInWindow}/${maxPerHour})`
    );
    return;
  }

  try {
    const result = await generateAndPublishAiNewsPost({ category: "tech" });
    realtimePublishedInWindow += 1;
    logger.info(
      `AI news realtime published: ${result.postId} (${result.title}) [hourly ${realtimePublishedInWindow}/${maxPerHour}]`
    );
    markRunSuccess("techRealtime");
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 409) {
      logger.info("AI news realtime skipped: no unique live item/topic available right now");
      markRunSuccess("techRealtime");
      return;
    }
    markRunError("techRealtime", err);
    logger.error("AI news realtime tick failed:", err);
  }
}

function isSportsPostingWeekday(date = new Date(), timezone = "Africa/Johannesburg"): boolean {
  return isWorldNewsAutopostDay(date, timezone);
}

async function runSportsScheduledTick(postsPerRun: number): Promise<void> {
  const sportsTimezone = String(
    process.env.AI_SPORTS_TIMEZONE || process.env.AI_NEWS_TIMEZONE || "Africa/Johannesburg"
  ).trim();
  if (!isSportsPostingWeekday(new Date(), sportsTimezone)) {
    logger.info("AI sports scheduler skipped: @worldnews autopost runs on Tuesday/Friday only");
    return;
  }
  markRunStart("sports");
  let published = 0;
  let attempts = 0;
  const maxAttempts = Math.max(postsPerRun * 3, 6);

  while (published < postsPerRun && attempts < maxAttempts) {
    attempts += 1;
    try {
      const result = await generateAndPublishAiNewsPost({ category: "sports" });
      published += 1;
      logger.info(`AI sports news published: ${result.postId} (${result.title})`);
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 409) {
        continue;
      }
      markRunError("sports", err);
      logger.error("AI sports scheduler tick failed:", err);
      break;
    }
  }
  if (published === 0) {
    logger.info("AI sports scheduler skipped: no unique sports item available right now");
  }
  markRunSuccess("sports");
}

async function runEntertainmentScheduledTick(postsPerRun: number): Promise<void> {
  markRunStart("entertainment");
  let published = 0;
  let attempts = 0;
  const maxAttempts = Math.max(postsPerRun * 3, 6);

  while (published < postsPerRun && attempts < maxAttempts) {
    attempts += 1;
    try {
      const result = await generateAndPublishAiNewsPost({ category: "entertainment" });
      published += 1;
      logger.info(`AI entertainment news published: ${result.postId} (${result.title})`);
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 409) {
        continue;
      }
      markRunError("entertainment", err);
      logger.error("AI entertainment scheduler tick failed:", err);
      break;
    }
  }
  if (published === 0) {
    logger.info("AI entertainment scheduler skipped: no unique entertainment item available right now");
  }
  markRunSuccess("entertainment");
}

async function runMotoringScheduledTick(postsPerRun: number): Promise<void> {
  markRunStart("motoring");
  let published = 0;
  let attempts = 0;
  const maxAttempts = Math.max(postsPerRun * 3, 6);

  while (published < postsPerRun && attempts < maxAttempts) {
    attempts += 1;
    try {
      const result = await generateAndPublishAiNewsPost({ category: "motoring" });
      published += 1;
      logger.info(`AI motoring news published: ${result.postId} (${result.title})`);
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 409) {
        continue;
      }
      markRunError("motoring", err);
      logger.error("AI motoring scheduler tick failed:", err);
      break;
    }
  }
  if (published === 0) {
    logger.info("AI motoring scheduler skipped: no unique motoring item available right now");
  }
  markRunSuccess("motoring");
}

export function initializeNewsScheduler(): void {
  if (started) return;
  started = true;

  void rejectIncompleteAiNewsPosts()
    .then((rejected) => {
      if (rejected > 0) {
        logger.info(`Rejected ${rejected} incomplete AI news post(s) from the public feed`);
      }
    })
    .catch((err) => logger.error("Incomplete AI news cleanup failed:", err));

  const enabled = String(process.env.AI_NEWS_ENABLED || "true").trim() !== "false";
  if (!enabled) {
    logger.info("AI news scheduler disabled by AI_NEWS_ENABLED=false");
    return;
  }

  const expression = String(process.env.AI_NEWS_CRON || "0 6 * * *").trim();
  const timezone = String(process.env.AI_NEWS_TIMEZONE || "Africa/Johannesburg").trim();
  const minPerDay = Math.max(1, Math.min(3, Number(process.env.AI_NEWS_DAILY_MIN || 1)));
  const maxPerDay = Math.max(minPerDay, Math.min(3, Number(process.env.AI_NEWS_DAILY_MAX || 1)));

  cron.schedule(
    expression,
    async () => {
      markRunStart("techDaily");
      if (!isWorldNewsAutopostDay(new Date(), timezone)) {
        logger.info("AI news daily batch skipped: @worldnews autopost runs on Tuesday/Friday only");
        return;
      }
      try {
        const results = await generateAiNewsBatchForToday({ min: minPerDay, max: maxPerDay });
        if (!results.length) {
          logger.info("AI news scheduler skipped: no unique topic left for today");
        }
        for (const result of results) {
          logger.info(`AI news published: ${result.postId} (${result.title})`);
        }
        markRunSuccess("techDaily");
      } catch (err) {
        markRunError("techDaily", err);
        logger.error("AI news scheduler failed:", err);
      }
    },
    { timezone }
  );

  logger.info(
    `AI news scheduler active (${expression}, timezone: ${timezone}, posts/day: ${minPerDay}-${maxPerDay})`
  );

  const realtimeEnabled = String(process.env.AI_NEWS_REALTIME_ENABLED || "true").trim() !== "false";
  if (!realtimeEnabled) {
    logger.info("AI news realtime scheduler disabled by AI_NEWS_REALTIME_ENABLED=false");
  } else {
    const realtimeIntervalMinutes = Math.max(
      2,
      Math.min(60, Number(process.env.AI_NEWS_REALTIME_INTERVAL_MINUTES || 10))
    );
    const realtimeMaxPerHour = Math.max(1, Math.min(60, Number(process.env.AI_NEWS_REALTIME_MAX_PER_HOUR || 6)));
    const realtimeImmediate = String(process.env.AI_NEWS_REALTIME_RUN_ON_START || "true").trim() !== "false";

    if (realtimeImmediate) {
      void runRealtimeTick(realtimeMaxPerHour);
    }
    realtimeTimer = setInterval(() => {
      void runRealtimeTick(realtimeMaxPerHour);
    }, realtimeIntervalMinutes * 60 * 1000);

    logger.info(
      `AI news realtime scheduler active (every ${realtimeIntervalMinutes} min, cap ${realtimeMaxPerHour}/hour)`
    );
  }

  const sportsEnabled = String(process.env.AI_SPORTS_ENABLED || "true").trim() !== "false";
  if (!sportsEnabled) {
    logger.info("AI sports scheduler disabled by AI_SPORTS_ENABLED=false");
  } else {
  const sportsExpression = String(process.env.AI_SPORTS_CRON || "0 8,12,18 * * 2,5").trim();
  const sportsTimezone = String(
    process.env.AI_SPORTS_TIMEZONE || process.env.AI_NEWS_TIMEZONE || "Africa/Johannesburg"
  ).trim();
  const sportsPostsPerRun = Math.max(1, Math.min(3, Number(process.env.AI_SPORTS_POSTS_PER_RUN || 1)));

  try {
    cron.schedule(
      sportsExpression,
      async () => {
        await runSportsScheduledTick(sportsPostsPerRun);
      },
      { timezone: sportsTimezone }
    );
    logger.info(
      `AI sports scheduler active (${sportsExpression}, timezone: ${sportsTimezone}, posts/run: ${sportsPostsPerRun})`
    );
  } catch (err) {
    logger.error(`AI sports scheduler disabled: invalid AI_SPORTS_CRON "${sportsExpression}"`, err);
  }
  }

  const entertainmentEnabled = String(process.env.AI_ENTERTAINMENT_ENABLED || "true").trim() !== "false";
  if (!entertainmentEnabled) {
    logger.info("AI entertainment scheduler disabled by AI_ENTERTAINMENT_ENABLED=false");
  } else {

  const entertainmentExpression = String(process.env.AI_ENTERTAINMENT_CRON || "0 9 * * 5").trim();
  const entertainmentTimezone = String(
    process.env.AI_ENTERTAINMENT_TIMEZONE || process.env.AI_NEWS_TIMEZONE || "Africa/Johannesburg"
  ).trim();
  const entertainmentPostsPerRun = Math.max(
    1,
    Math.min(3, Number(process.env.AI_ENTERTAINMENT_POSTS_PER_RUN || 1))
  );

  cron.schedule(
    entertainmentExpression,
    async () => {
      await runEntertainmentScheduledTick(entertainmentPostsPerRun);
    },
    { timezone: entertainmentTimezone }
  );

  logger.info(
    `AI entertainment scheduler active (${entertainmentExpression}, timezone: ${entertainmentTimezone}, posts/run: ${entertainmentPostsPerRun})`
  );
  }

  const motoringEnabled = String(process.env.AI_MOTORING_ENABLED || "true").trim() !== "false";
  if (!motoringEnabled) {
    logger.info("AI motoring scheduler disabled by AI_MOTORING_ENABLED=false");
  } else {

  const motoringExpression = String(process.env.AI_MOTORING_CRON || "0 8 * * 0").trim();
  const motoringTimezone = String(
    process.env.AI_MOTORING_TIMEZONE || process.env.AI_NEWS_TIMEZONE || "Africa/Johannesburg"
  ).trim();
  const motoringPostsPerRun = Math.max(1, Math.min(3, Number(process.env.AI_MOTORING_POSTS_PER_RUN || 1)));

  cron.schedule(
    motoringExpression,
    async () => {
      await runMotoringScheduledTick(motoringPostsPerRun);
    },
    { timezone: motoringTimezone }
  );

  logger.info(
    `AI motoring scheduler active (${motoringExpression}, timezone: ${motoringTimezone}, posts/run: ${motoringPostsPerRun})`
  );
  }
}

