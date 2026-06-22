/**
 * Minimal SHEIN Open Platform HTTP client (OPEN_KEY_ID signing).
 * Docs: https://open.sheincorp.com/ — credentials from app review, not portal login password.
 */

import crypto from "crypto";

const DEFAULT_BASE = "https://openapi.sheincorp.com";

export type SheinOpenApiConfig = {
  openKeyId: string;
  secretKey: string;
  baseUrl?: string;
};

function hmacSha256Hex(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

/** SHEIN OPEN_KEY_ID request signature (x-lt-* headers). */
export function buildSheinOpenHeaders(cfg: SheinOpenApiConfig, path: string, body = ""): Record<string, string> {
  const timestamp = String(Date.now());
  const openKeyId = cfg.openKeyId.trim();
  const secret = cfg.secretKey.trim();
  const signBase = `${openKeyId}${timestamp}${path}${body}`;
  const signature = hmacSha256Hex(secret, signBase);
  return {
    "Content-Type": "application/json;charset=UTF-8",
    "x-lt-openKeyId": openKeyId,
    "x-lt-timestamp": timestamp,
    "x-lt-signature": signature,
  };
}

export async function sheinOpenApiRequest<T = unknown>(
  cfg: SheinOpenApiConfig,
  method: "GET" | "POST",
  path: string,
  options?: { query?: Record<string, string>; body?: unknown; timeoutMs?: number }
): Promise<T> {
  const base = (cfg.baseUrl || process.env.SHEIN_OPEN_API_BASE || DEFAULT_BASE).replace(/\/$/, "");
  const qs = options?.query
    ? `?${new URLSearchParams(
        Object.entries(options.query).filter(([, v]) => v != null && v !== "")
      ).toString()}`
    : "";
  const urlPath = path.startsWith("/") ? path : `/${path}`;
  const fullPath = `${urlPath}${qs}`;
  const bodyStr = options?.body != null ? JSON.stringify(options.body) : "";
  const headers = buildSheinOpenHeaders(cfg, urlPath, method === "POST" ? bodyStr : "");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 20000);

  try {
    const res = await fetch(`${base}${fullPath}`, {
      method,
      headers,
      body: method === "POST" && bodyStr ? bodyStr : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`SHEIN API non-JSON (${res.status}): ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      throw new Error(`SHEIN API HTTP ${res.status}: ${json?.msg || json?.message || text.slice(0, 200)}`);
    }
    if (json?.code != null && String(json.code) !== "0" && String(json.code) !== "200") {
      throw new Error(`SHEIN API error ${json.code}: ${json?.msg || json?.message || "unknown"}`);
    }
    return json as T;
  } finally {
    clearTimeout(timeout);
  }
}
