/**
 * Resolve client IP and approximate registration geography (best-effort).
 */
import type { Request } from "express";
import logger from "./logger";

export type RegistrationGeo = {
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  isp?: string;
  org?: string;
  lat?: number;
  lon?: number;
  source?: string;
};

/** Prefer real client IP when behind nginx / Cloudflare. */
export function getClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) return cf.trim();
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim();
  return req.ip || "unknown";
}

function isPrivateOrLocalIp(ip: string): boolean {
  const s = String(ip || "").trim();
  if (!s || s === "unknown" || s === "::1" || s === "127.0.0.1") return true;
  if (s.startsWith("10.") || s.startsWith("192.168.") || s.startsWith("172.")) return true;
  if (s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe80")) return true;
  return false;
}

/** Best-effort GeoIP via ip-api.com (no key). Never throws. */
export async function lookupRegistrationGeo(ip: string): Promise<RegistrationGeo | null> {
  const clean = String(ip || "").trim();
  if (!clean || isPrivateOrLocalIp(clean)) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(clean)}?fields=status,message,country,countryCode,regionName,city,isp,org,lat,lon`, {
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    if (String(data.status || "") !== "success") return null;
    return {
      country: data.country ? String(data.country) : undefined,
      countryCode: data.countryCode ? String(data.countryCode).toUpperCase() : undefined,
      region: data.regionName ? String(data.regionName) : undefined,
      city: data.city ? String(data.city) : undefined,
      isp: data.isp ? String(data.isp) : undefined,
      org: data.org ? String(data.org) : undefined,
      lat: typeof data.lat === "number" ? data.lat : undefined,
      lon: typeof data.lon === "number" ? data.lon : undefined,
      source: "ip-api",
    };
  } catch (err) {
    logger.warn("lookupRegistrationGeo failed", { ip: clean, error: String((err as Error)?.message || err) });
    return null;
  }
}
