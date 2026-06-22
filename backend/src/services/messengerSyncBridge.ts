import { createHmac, randomUUID } from "crypto";
import http from "http";
import https from "https";
import { logger } from "./monitoring";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

interface BridgeEvent {
  eventId: string;
  eventType: string;
  occurredAt: string;
  actorUserId: string;
  tenantId: string;
  version: number;
  payload: Record<string, JsonValue>;
}

const BRIDGE_ENABLED = String(process.env.MCHAT_SYNC_BRIDGE_ENABLED || "").toLowerCase() === "true";
const BRIDGE_URL = String(process.env.MCHAT_SYNC_BRIDGE_URL || "").trim();
const BRIDGE_TENANT_ID = String(process.env.MCHAT_SYNC_TENANT_ID || "qwertymates");
const BRIDGE_TIMEOUT_MS = Math.max(500, Number(process.env.MCHAT_SYNC_TIMEOUT_MS || 2500));
const BRIDGE_SECRET = String(process.env.MCHAT_SYNC_SHARED_SECRET || "");

const postJson = (urlValue: string, body: string, signature?: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const url = new URL(urlValue);
    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;

    const req = client.request(
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        timeout: BRIDGE_TIMEOUT_MS,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          ...(signature ? { "x-morongwa-signature": signature } : {}),
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        // Consume stream to free sockets.
        res.resume();
        if (status >= 200 && status < 300) resolve();
        else reject(new Error(`Bridge HTTP ${status}`));
      }
    );

    req.on("timeout", () => req.destroy(new Error("Bridge timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });

const canBridge = (): boolean => {
  if (!BRIDGE_ENABLED) return false;
  if (!BRIDGE_URL) {
    logger.warn("MCHAT bridge enabled but URL is missing");
    return false;
  }
  return true;
};

export const pushMessengerSyncEvent = (
  eventType: string,
  actorUserId: string,
  payload: Record<string, JsonValue>
): void => {
  if (!canBridge()) return;

  const event: BridgeEvent = {
    eventId: randomUUID(),
    eventType,
    occurredAt: new Date().toISOString(),
    actorUserId,
    tenantId: BRIDGE_TENANT_ID,
    version: 1,
    payload,
  };

  const body = JSON.stringify({ events: [event] });
  const signature = BRIDGE_SECRET
    ? createHmac("sha256", BRIDGE_SECRET).update(body).digest("hex")
    : undefined;

  void postJson(BRIDGE_URL, body, signature).catch((error: unknown) => {
    logger.warn("Failed to push messenger sync event", {
      eventType,
      actorUserId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
};
