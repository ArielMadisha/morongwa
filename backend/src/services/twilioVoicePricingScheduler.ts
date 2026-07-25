import cron, { ScheduledTask } from "node-cron";
import { logger } from "./monitoring";
import {
  getTwilioVoicePricingSyncStatus,
  runTwilioVoicePricingSyncSafe,
  voicePricingSyncEnabled,
} from "./twilioVoicePricingSync";

let started = false;
let scheduledTask: ScheduledTask | null = null;
let startupTimer: ReturnType<typeof setTimeout> | null = null;

export function getTwilioVoicePricingSchedulerStatus() {
  const cronExpr = String(process.env.VOICE_PRICING_SYNC_CRON || "0 4 * * *").trim();
  const tz = String(process.env.VOICE_PRICING_SYNC_TZ || "Africa/Johannesburg").trim();
  return {
    started,
    cron: cronExpr,
    timezone: tz,
    ...getTwilioVoicePricingSyncStatus(),
  };
}

export function startTwilioVoicePricingScheduler(): void {
  if (started) return;
  started = true;

  if (!voicePricingSyncEnabled()) {
    logger.info("Twilio voice pricing scheduler disabled (VOICE_PRICING_SYNC_ENABLED=0 or no Twilio creds)");
    return;
  }

  const cronExpr = String(process.env.VOICE_PRICING_SYNC_CRON || "0 4 * * *").trim();
  const tz = String(process.env.VOICE_PRICING_SYNC_TZ || "Africa/Johannesburg").trim();

  if (!cron.validate(cronExpr)) {
    logger.warn(`Twilio voice pricing sync: invalid cron "${cronExpr}" — scheduler not registered`);
    return;
  }

  scheduledTask = cron.schedule(
    cronExpr,
    () => {
      void runTwilioVoicePricingSyncSafe();
    },
    { timezone: tz }
  );

  const startupDelayMs = Math.max(
    15_000,
    Number(process.env.VOICE_PRICING_SYNC_STARTUP_DELAY_MS || 60_000) || 60_000
  );
  startupTimer = setTimeout(() => {
    void runTwilioVoicePricingSyncSafe();
  }, startupDelayMs);

  logger.info("Twilio voice pricing scheduler started", { cron: cronExpr, timezone: tz, startupDelayMs });
}

export function stopTwilioVoicePricingScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  started = false;
}
