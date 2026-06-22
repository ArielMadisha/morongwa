import crypto from "crypto";

/**
 * Parse `RTMP_INGEST_URL` like `rtmp://host/app` or `rtmp://host:1935/app`.
 * Used when `LIVESTREAM_RTMP_PUBLIC_HOST` / `LIVESTREAM_RTMP_APP` are not set.
 */
export function parseRtmpIngestUrl(raw: string | undefined): { host: string; app: string } | null {
  const u = (raw || "").trim();
  if (!u.toLowerCase().startsWith("rtmp://")) return null;
  try {
    const asHttp = "http://" + u.slice("rtmp://".length);
    const parsed = new URL(asHttp);
    const host =
      parsed.port && parsed.port !== "1935"
        ? `${parsed.hostname}:${parsed.port}`
        : parsed.hostname;
    const seg = (parsed.pathname || "/").replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    const app = seg[0] || "live";
    if (!host) return null;
    return { host, app };
  } catch {
    return null;
  }
}

/** Public HTTPS (or dev HTTP) base where HLS playlists are served, without trailing slash. */
export function getHlsPublicBase(): string {
  const a = (process.env.LIVESTREAM_HLS_PUBLIC_BASE || "").trim();
  const b = (process.env.HLS_PLAYBACK_BASE_URL || "").trim();
  return (a || b).replace(/\/$/, "");
}

/** Hostname (and optional non-default port) for RTMP publishers — no scheme. */
export function getRtmpPublicHost(): string {
  const explicit = (process.env.LIVESTREAM_RTMP_PUBLIC_HOST || "").trim();
  if (explicit) return explicit;
  const parsed = parseRtmpIngestUrl(process.env.RTMP_INGEST_URL);
  return parsed?.host || "";
}

export function getRtmpAppName(): string {
  const a = (process.env.LIVESTREAM_RTMP_APP || "").trim();
  if (a) return a;
  const parsed = parseRtmpIngestUrl(process.env.RTMP_INGEST_URL);
  return parsed?.app || "live";
}

export function isLivestreamPlaybackConfigured(): boolean {
  return Boolean(getHlsPublicBase());
}

export function isLivestreamPublishConfigured(): boolean {
  return Boolean(getHlsPublicBase() && getRtmpPublicHost());
}

export function generateLiveStreamName(): string {
  return `s_${crypto.randomBytes(18).toString("base64url")}`;
}

export type LivestreamUrls = {
  hlsUrl: string;
  rtmpUrl: string;
  /** OBS "Server": rtmp://host/app */
  obsServerUrl: string;
  /** OBS "Stream key" */
  streamKey: string;
};

export function buildLivestreamUrls(streamName: string): LivestreamUrls | null {
  const hlsBase = getHlsPublicBase();
  const rtmpHost = getRtmpPublicHost();
  const app = getRtmpAppName();
  if (!hlsBase || !rtmpHost) return null;
  const hlsUrl = `${hlsBase}/${streamName}.m3u8`;
  const obsServerUrl = `rtmp://${rtmpHost}/${app}`;
  const rtmpUrl = `${obsServerUrl}/${streamName}`;
  return { hlsUrl, rtmpUrl, obsServerUrl, streamKey: streamName };
}
