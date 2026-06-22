import mongoose from "mongoose";
import User from "../data/models/User";
import Notification from "../data/models/Notification";
import AdminBroadcast, {
  AdminBroadcastAreaType,
  AdminBroadcastScope,
} from "../data/models/AdminBroadcast";
import { STORE_LOCATION_COUNTRIES } from "../config/storeCountries";
import { emitUserNotification } from "./notification";
import { logger } from "./monitoring";

const COUNTRY_NAME = new Map(STORE_LOCATION_COUNTRIES.map((c) => [c.code, c.name]));

export type BroadcastAudienceInput =
  | { scope: "all" }
  | { scope: "area"; areaType: AdminBroadcastAreaType; areaValue: string };

function baseUserFilter(): Record<string, unknown> {
  return {
    suspended: { $ne: true },
    active: { $ne: false },
    role: { $nin: ["admin", "superadmin"] },
  };
}

export function buildBroadcastUserFilter(audience: BroadcastAudienceInput): Record<string, unknown> {
  const match = baseUserFilter();
  if (audience.scope === "all") return match;

  const value = String(audience.areaValue || "").trim();
  if (!value) return { ...match, _id: { $exists: false } };

  if (audience.areaType === "country") {
    return { ...match, countryCode: value.toUpperCase() };
  }
  if (audience.areaType === "runner_country") {
    return { ...match, runnerServiceCountry: value.toUpperCase() };
  }
  if (audience.areaType === "runner_city") {
    return { ...match, runnerServiceCity: value.toLowerCase() };
  }
  return { ...match, _id: { $exists: false } };
}

export function areaLabelForAudience(audience: BroadcastAudienceInput): string {
  if (audience.scope === "all") return "All users";
  const value = String(audience.areaValue || "").trim();
  if (audience.areaType === "country" || audience.areaType === "runner_country") {
    const code = value.toUpperCase();
    return `${COUNTRY_NAME.get(code as any) || code} (${code})`;
  }
  if (audience.areaType === "runner_city") {
    const city = value.replace(/_/g, " ");
    return city.charAt(0).toUpperCase() + city.slice(1);
  }
  return value;
}

export async function countBroadcastRecipients(audience: BroadcastAudienceInput): Promise<number> {
  return User.countDocuments(buildBroadcastUserFilter(audience));
}

export type BroadcastAreaOption = {
  type: AdminBroadcastAreaType;
  value: string;
  label: string;
  userCount: number;
};

export async function listBroadcastAreaOptions(): Promise<{
  allUserCount: number;
  areas: BroadcastAreaOption[];
}> {
  const allUserCount = await countBroadcastRecipients({ scope: "all" });
  const base = baseUserFilter();

  const [byCountry, byRunnerCountry, byRunnerCity] = await Promise.all([
    User.aggregate([
      { $match: { ...base, countryCode: { $exists: true, $nin: [null, ""] } } },
      { $group: { _id: { $toUpper: "$countryCode" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    User.aggregate([
      { $match: { ...base, runnerServiceCountry: { $exists: true, $nin: [null, ""] } } },
      { $group: { _id: { $toUpper: "$runnerServiceCountry" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    User.aggregate([
      { $match: { ...base, runnerServiceCity: { $exists: true, $nin: [null, ""] } } },
      { $group: { _id: { $toLower: "$runnerServiceCity" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  const areas: BroadcastAreaOption[] = [];

  for (const row of byCountry) {
    const code = String(row._id || "").trim().toUpperCase();
    if (!code) continue;
    areas.push({
      type: "country",
      value: code,
      label: `Registered country: ${COUNTRY_NAME.get(code as any) || code}`,
      userCount: Number(row.count) || 0,
    });
  }

  for (const row of byRunnerCountry) {
    const code = String(row._id || "").trim().toUpperCase();
    if (!code) continue;
    areas.push({
      type: "runner_country",
      value: code,
      label: `Runner service country: ${COUNTRY_NAME.get(code as any) || code}`,
      userCount: Number(row.count) || 0,
    });
  }

  for (const row of byRunnerCity) {
    const city = String(row._id || "").trim().toLowerCase();
    if (!city) continue;
    const pretty = city.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    areas.push({
      type: "runner_city",
      value: city,
      label: `Runner service city: ${pretty}`,
      userCount: Number(row.count) || 0,
    });
  }

  areas.sort((a, b) => b.userCount - a.userCount || a.label.localeCompare(b.label));

  return { allUserCount, areas };
}

const BATCH_SIZE = 200;
const MAX_RECIPIENTS = 10_000;

export async function sendAdminUserBroadcast(params: {
  adminId: mongoose.Types.ObjectId | string;
  audience: BroadcastAudienceInput;
  message: string;
  subject?: string;
}): Promise<{
  broadcastId: string;
  recipientCount: number;
  deliveredCount: number;
  areaLabel: string;
}> {
  const message = String(params.message || "").trim();
  if (message.length < 2) throw new Error("Message is required");
  if (message.length > 4000) throw new Error("Message is too long (max 4000 characters)");

  const subject = String(params.subject || "Message from Qwertymates").trim().slice(0, 200);
  const audience = params.audience;
  const areaLabel = areaLabelForAudience(audience);
  const filter = buildBroadcastUserFilter(audience);
  const recipientCount = await User.countDocuments(filter);

  if (recipientCount === 0) throw new Error("No recipients match this audience");
  if (recipientCount > MAX_RECIPIENTS) {
    throw new Error(`Too many recipients (${recipientCount}). Max ${MAX_RECIPIENTS} per send.`);
  }

  const fullMessage = subject ? `${subject}\n\n${message}` : message;

  const broadcast = await AdminBroadcast.create({
    sentBy: params.adminId,
    scope: audience.scope as AdminBroadcastScope,
    areaType: audience.scope === "area" ? audience.areaType : undefined,
    areaValue: audience.scope === "area" ? audience.areaValue : undefined,
    areaLabel,
    subject,
    message,
    recipientCount,
    deliveredCount: 0,
  });

  let deliveredCount = 0;
  let lastId: mongoose.Types.ObjectId | null = null;

  while (true) {
    const pageFilter: Record<string, unknown> = { ...filter };
    if (lastId) {
      pageFilter._id = { $gt: lastId };
    }

    const users = await User.find(pageFilter)
      .select("_id")
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .lean();

    if (!users.length) break;

    const docs = users.map((u) => ({
      user: u._id,
      type: "admin_broadcast",
      message: fullMessage,
      channel: "realtime" as const,
      read: false,
    }));

    const inserted = await Notification.insertMany(docs, { ordered: false });
    for (const doc of inserted) {
      const uid = String((doc as any).user || "");
      if (uid) emitUserNotification(uid, doc);
    }

    deliveredCount += inserted.length;
    lastId = users[users.length - 1]!._id as mongoose.Types.ObjectId;
    if (users.length < BATCH_SIZE) break;
  }

  broadcast.deliveredCount = deliveredCount;
  await broadcast.save();

  logger.info("Admin user broadcast sent", {
    broadcastId: String(broadcast._id),
    adminId: String(params.adminId),
    scope: audience.scope,
    areaLabel,
    recipientCount,
    deliveredCount,
  });

  return {
    broadcastId: String(broadcast._id),
    recipientCount,
    deliveredCount,
    areaLabel,
  };
}
