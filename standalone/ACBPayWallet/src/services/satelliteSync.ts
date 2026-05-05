import crypto from "crypto";

/**
 * Push signed JSON envelopes to standalone satellites (ACBPayWallet, Ask MacGyver).
 *
 * Env (Morongwa backend):
 * - SATELLITE_SYNC_SECRET — shared HMAC secret (same value as QWERTYMATES_SYNC_SECRET on each satellite)
 * - ACBPAYWALLET_SYNC_URL — e.g. https://pay.example.com/api/sync/qwertymates
 * - ASKMACGYVER_SYNC_URL — e.g. https://help.example.com/api/sync/qwertymates
 *
 * If secret or all URLs are unset, dispatch is a no-op.
 */
export type SatelliteEvent = {
  id: string;
  type: string;
  createdAt: string;
  source: "qwertymates";
  data: unknown;
};

type SatelliteTarget = "acbpaywallet" | "askmacgyver";

function sign(secret: string, ts: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(`${ts}.${body}`, "utf8").digest("hex");
}

function newEventId(): string {
  return `evt_${crypto.randomBytes(12).toString("hex")}`;
}

export async function dispatchSatelliteEvent(partial: { type: string; data: unknown; id?: string }): Promise<void> {
  const secret = process.env.SATELLITE_SYNC_SECRET?.trim();
  const urls = resolveTargetUrlsForEvent(partial.type);
  if (!secret || urls.length === 0) return;

  const envelope: SatelliteEvent = {
    id: partial.id || newEventId(),
    type: partial.type,
    createdAt: new Date().toISOString(),
    source: "qwertymates",
    data: partial.data,
  };

  const rawBody = JSON.stringify(envelope);
  const ts = String(Date.now());
  const signature = sign(secret, ts, rawBody);

  await Promise.allSettled(
    urls.map(async (url) => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Qwertymates-Timestamp": ts,
          "X-Qwertymates-Signature": signature,
        },
        body: rawBody,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`satellite ${res.status} ${url} ${t.slice(0, 200)}`);
      }
    })
  );
}

function resolveTargetUrlsForEvent(eventType: string): string[] {
  const targets = resolveTargetsForEvent(eventType);
  const urls = targets
    .map((target) =>
      target === "acbpaywallet"
        ? process.env.ACBPAYWALLET_SYNC_URL?.trim()
        : process.env.ASKMACGYVER_SYNC_URL?.trim()
    )
    .filter(Boolean) as string[];
  return Array.from(new Set(urls));
}

function resolveTargetsForEvent(eventType: string): SatelliteTarget[] {
  const t = String(eventType || "").trim().toLowerCase();
  if (t === "library.push") return ["askmacgyver"];
  if (t.startsWith("payment.") || t.startsWith("wallet.") || t.startsWith("merchant_agent.")) {
    return ["acbpaywallet"];
  }
  // default: fan out to both for generic events (e.g. ping/testing)
  return ["acbpaywallet", "askmacgyver"];
}
