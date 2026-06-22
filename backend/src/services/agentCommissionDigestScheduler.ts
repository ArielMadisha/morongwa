import cron from "node-cron";
import mongoose from "mongoose";
import AuditLog from "../data/models/AuditLog";
import TuckshopCashAgentRegistration from "../data/models/TuckshopCashAgentRegistration";
import { isDbConnected } from "../data/db";
import { sendSms } from "./otpDelivery";
import { logger } from "./monitoring";
import { getAgentCommissionSummary } from "./agentEarningsService";

const FRONTEND_URL = String(process.env.FRONTEND_URL || "https://www.qwertymates.com").replace(/\/$/, "");

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function digestAlreadySent(userId: mongoose.Types.ObjectId, action: string, periodKey: string): Promise<boolean> {
  const hit = await AuditLog.findOne({
    action,
    user: userId,
    "meta.periodKey": periodKey,
  })
    .select("_id")
    .lean();
  return Boolean(hit);
}

async function sendDigestToUser(
  uid: mongoose.Types.ObjectId,
  periodKey: string,
  action: string,
  label: string
): Promise<void> {
  if (!isDbConnected()) return;
  const summary = await getAgentCommissionSummary(uid);
  if (summary.tuckshopsRegistered <= 0) return;
  if (!summary.notifyPhoneDigits || summary.notifyPhoneDigits.length < 8) return;
  if (await digestAlreadySent(uid, action, periodKey)) return;
  const url = `${FRONTEND_URL}/wallet/agent-earnings`;
  const text = [
    `📊 ${label} — Qwertymates agent earnings`,
    "",
    `✅ Tuckshops registered: ${summary.tuckshopsRegistered}`,
    `⏳ Pending approvals: ${summary.pendingApprovals}`,
    `💰 Total commissions earned: R ${summary.totalCommissionsEarnedZar.toFixed(2)}`,
    "",
    `Web dashboard: ${url}`,
    "Reply DOWNLOAD REPORT to get CSV + PDF by email.",
  ].join("\n");
  try {
    await sendSms({ phone: summary.notifyPhoneDigits, text, channel: "whatsapp" });
    await AuditLog.create({
      action,
      user: uid,
      meta: { periodKey, channel: "whatsapp", label },
    });
  } catch (e) {
    logger.warn("Agent earnings digest WhatsApp failed", { error: String((e as any)?.message || e), userId: String(uid) });
  }
}

async function runWeeklyDigest(): Promise<void> {
  const ids = await TuckshopCashAgentRegistration.distinct("applicantUser");
  const now = new Date();
  const periodKey = `weekly-${isoWeekKey(now)}`;
  for (const id of ids) {
    if (!mongoose.isValidObjectId(id)) continue;
    await sendDigestToUser(id as mongoose.Types.ObjectId, periodKey, "AGENT_EARNINGS_DIGEST_WEEKLY", "Weekly summary");
  }
}

async function runMonthlyDigest(): Promise<void> {
  const ids = await TuckshopCashAgentRegistration.distinct("applicantUser");
  const now = new Date();
  const periodKey = `monthly-${monthKey(now)}`;
  for (const id of ids) {
    if (!mongoose.isValidObjectId(id)) continue;
    await sendDigestToUser(id as mongoose.Types.ObjectId, periodKey, "AGENT_EARNINGS_DIGEST_MONTHLY", "Monthly summary");
  }
}

export function startAgentCommissionDigestSchedulers(): void {
  if (String(process.env.AGENT_COMMISSION_DIGESTS || "").trim() === "0") {
    logger.info("Agent commission digest schedulers disabled (AGENT_COMMISSION_DIGESTS=0)");
    return;
  }
  const tz = String(process.env.AGENT_DIGEST_TZ || "Africa/Johannesburg").trim() || "Africa/Johannesburg";
  const weeklyCron = String(process.env.AGENT_DIGEST_WEEKLY_CRON || "0 9 * * 1").trim();
  const monthlyCron = String(process.env.AGENT_DIGEST_MONTHLY_CRON || "0 9 1 * *").trim();

  cron.schedule(
    weeklyCron,
    () => {
      void runWeeklyDigest().catch((e) => logger.warn("Weekly agent digest run failed", { error: String(e) }));
    },
    { timezone: tz }
  );
  cron.schedule(
    monthlyCron,
    () => {
      void runMonthlyDigest().catch((e) => logger.warn("Monthly agent digest run failed", { error: String(e) }));
    },
    { timezone: tz }
  );
  logger.info("Agent commission digest schedulers started", { tz, weeklyCron, monthlyCron });
}
