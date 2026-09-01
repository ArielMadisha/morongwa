/**
 * Expo Push Notification helpers (Expo Push API).
 * Tokens are registered by the mobile app via POST /api/notifications/push-token.
 * Failures never throw to callers that opt into soft mode — food settlement must not block on push.
 */
import User from "../data/models/User";
import { logger } from "./monitoring";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_TOKENS_PER_USER = 12;

export type ExpoPushTokenEntry = {
  token: string;
  platform?: string;
  deviceId?: string;
  updatedAt?: Date;
};

export type ExpoPushMessage = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  channelId?: string;
  priority?: "default" | "normal" | "high";
};

export type ExpoPushSendResult = {
  sent: number;
  ticketIds: string[];
  errors: string[];
  noTokens: boolean;
};

const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[.+\]$/;

export function isExpoPushToken(token: string): boolean {
  return EXPO_TOKEN_RE.test(String(token || "").trim());
}

export async function upsertUserExpoPushToken(options: {
  userId: string;
  token: string;
  platform?: string;
  deviceId?: string;
}): Promise<{ ok: true; count: number }> {
  const token = String(options.token || "").trim();
  if (!isExpoPushToken(token)) {
    throw new Error("Invalid Expo push token");
  }
  const platform = String(options.platform || "").trim().toLowerCase().slice(0, 32) || undefined;
  const deviceId = String(options.deviceId || "").trim().slice(0, 128) || undefined;
  const now = new Date();

  const user = await User.findById(options.userId).select("expoPushTokens");
  if (!user) throw new Error("User not found");

  const existing = Array.isArray(user.expoPushTokens) ? [...user.expoPushTokens] : [];
  const idx = existing.findIndex((t) => String(t?.token || "") === token);
  const entry: ExpoPushTokenEntry = { token, platform, deviceId, updatedAt: now };
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...entry };
  } else {
    existing.push(entry);
  }
  // Drop stale entries — keep most recently updated.
  existing.sort(
    (a, b) =>
      new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
  );
  user.expoPushTokens = existing.slice(0, MAX_TOKENS_PER_USER) as typeof user.expoPushTokens;
  user.markModified("expoPushTokens");
  await user.save();
  return { ok: true, count: user.expoPushTokens?.length || 0 };
}

export async function removeUserExpoPushToken(options: {
  userId: string;
  token: string;
}): Promise<{ ok: true; count: number }> {
  const token = String(options.token || "").trim();
  const user = await User.findById(options.userId).select("expoPushTokens");
  if (!user) throw new Error("User not found");
  const next = (user.expoPushTokens || []).filter((t) => String(t?.token || "") !== token);
  user.expoPushTokens = next as typeof user.expoPushTokens;
  user.markModified("expoPushTokens");
  await user.save();
  return { ok: true, count: next.length };
}

type ExpoTicket = {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
};

async function postExpoPush(messages: Array<Record<string, unknown>>): Promise<ExpoTicket[]> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: ExpoTicket | ExpoTicket[];
    errors?: Array<{ message?: string }>;
  };
  if (!res.ok) {
    const errMsg =
      json.errors?.map((e) => e.message).filter(Boolean).join("; ") ||
      `Expo push HTTP ${res.status}`;
    throw new Error(errMsg);
  }
  const data = json.data;
  if (Array.isArray(data)) return data;
  if (data) return [data];
  return [];
}

/**
 * Send an Expo push to all registered tokens for a user.
 * Removes DeviceNotRegistered tokens. Never throws — returns structured result.
 */
export async function sendExpoPushToUser(
  userId: string,
  message: ExpoPushMessage
): Promise<ExpoPushSendResult> {
  const result: ExpoPushSendResult = { sent: 0, ticketIds: [], errors: [], noTokens: false };
  try {
    const user = await User.findById(userId).select("expoPushTokens").lean();
    const tokens = (user?.expoPushTokens || [])
      .map((t) => String(t?.token || "").trim())
      .filter(isExpoPushToken);
    const unique = [...new Set(tokens)];
    if (!unique.length) {
      result.noTokens = true;
      return result;
    }

    const payloads = unique.map((to) => ({
      to,
      title: message.title.slice(0, 100),
      body: message.body.slice(0, 240),
      data: message.data || {},
      sound: message.sound === null ? undefined : message.sound || "default",
      channelId: message.channelId || "shop-orders",
      priority: message.priority || "high",
    }));

    const tickets = await postExpoPush(payloads);
    const deadTokens: string[] = [];

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i] || {};
      const token = unique[i];
      if (ticket.status === "ok" && ticket.id) {
        result.sent += 1;
        result.ticketIds.push(String(ticket.id));
        continue;
      }
      const errCode = String(ticket.details?.error || ticket.message || "unknown").trim();
      result.errors.push(errCode.slice(0, 200));
      if (errCode === "DeviceNotRegistered" && token) {
        deadTokens.push(token);
      }
    }

    if (deadTokens.length) {
      await User.updateOne(
        { _id: userId },
        { $pull: { expoPushTokens: { token: { $in: deadTokens } } } }
      );
      logger.info("Removed stale Expo push tokens", { userId, count: deadTokens.length });
    }
  } catch (err) {
    const msg = String((err as Error)?.message || err).slice(0, 300);
    result.errors.push(msg);
    logger.error("Expo push send failed", { userId, error: msg });
  }
  return result;
}
