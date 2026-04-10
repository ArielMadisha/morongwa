import crypto from "crypto";

const DEFAULT_TTL_SEC = 90 * 24 * 3600;

export type WaRedirectKind = "pay" | "addr" | "menu" | "cart_add" | "cart_rm" | "resell" | "share";

export type WaRedirectPayload = {
  v: 1;
  exp: number;
  kind: WaRedirectKind;
  /** menu: single character or digit string, e.g. "0", "2" */
  menu?: string;
  /** cart add/remove / resell product id prefix */
  code?: string;
  qty?: number;
  markup?: number;
  /** share: full URL embedded in wa.me/?text= */
  shareUrl?: string;
};

function getSecret(): string {
  return String(process.env.WA_LINK_SIGNING_SECRET || process.env.JWT_SECRET || "").trim();
}

/** Signed links require a strong secret (set WA_LINK_SIGNING_SECRET in production). */
export function canSignWaLinks(): boolean {
  return getSecret().length >= 16;
}

function assertAllowedShareUrl(url: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("invalid share URL");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("invalid share URL protocol");
  const extra = String(process.env.WA_PUBLIC_SHARE_HOSTS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const fromFrontend = String(process.env.FRONTEND_URL || "").trim();
  const allowed = new Set<string>(extra);
  if (fromFrontend) {
    try {
      allowed.add(new URL(fromFrontend).hostname.toLowerCase());
    } catch {
      /* ignore */
    }
  }
  if (!allowed.size) {
    allowed.add("www.qwertymates.com");
    allowed.add("qwertymates.com");
    allowed.add("localhost");
  }
  const host = u.hostname.toLowerCase();
  if (!allowed.has(host)) {
    throw new Error("share URL host not allowed");
  }
}

export function createWaRedirectToken(
  payload: Omit<WaRedirectPayload, "v" | "exp"> & { expSecFromNow?: number }
): string {
  const secret = getSecret();
  if (!secret || secret.length < 16) {
    throw new Error("WA_LINK_SIGNING_SECRET (or JWT_SECRET) must be at least 16 characters");
  }
  const { expSecFromNow, ...rest } = payload;
  const ttl = Number.isFinite(expSecFromNow) ? Number(expSecFromNow) : DEFAULT_TTL_SEC;
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, Math.floor(ttl));
  const full: WaRedirectPayload = {
    v: 1,
    exp,
    ...rest,
  };
  if (full.kind === "share" && full.shareUrl) {
    assertAllowedShareUrl(full.shareUrl);
  }
  const b64 = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(b64).digest("hex");
  return `${b64}.${sig}`;
}

export function verifyWaRedirectToken(token: string): WaRedirectPayload | null {
  const secret = getSecret();
  if (!secret || secret.length < 16 || token.length < 12) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(b64).digest("hex");
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expected, "utf8"))) return null;
  } catch {
    return null;
  }
  let data: WaRedirectPayload;
  try {
    data = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as WaRedirectPayload;
  } catch {
    return null;
  }
  if (data.v !== 1 || typeof data.exp !== "number") return null;
  if (data.exp < Math.floor(Date.now() / 1000)) return null;
  if (data.kind === "share" && data.shareUrl) {
    try {
      assertAllowedShareUrl(data.shareUrl);
    } catch {
      return null;
    }
  }
  return data;
}

export function resolveWaRedirectToWhatsAppUrl(data: WaRedirectPayload, waDigits: string): string {
  const d = String(waDigits || "").replace(/\D/g, "");
  if (data.kind === "share") {
    const u = String(data.shareUrl || "").trim();
    if (!u) return "";
    return `https://wa.me/?text=${encodeURIComponent(u)}`;
  }
  if (!d) return "";
  switch (data.kind) {
    case "pay":
      return `https://wa.me/${d}?text=${encodeURIComponent("CART PAY")}`;
    case "addr":
      return `https://wa.me/${d}?text=${encodeURIComponent("Address to :\nStreet Address : ")}`;
    case "menu":
      return `https://wa.me/${d}?text=${encodeURIComponent(String(data.menu ?? "0"))}`;
    case "cart_add": {
      const code = String(data.code || "").trim();
      const q = Math.max(1, Math.min(99, Number(data.qty) || 1));
      // Must match handleWhatsappCartAddCommand legacy branch: `CART ADD <hex> <qty>`.
      return `https://wa.me/${d}?text=${encodeURIComponent(`CART ADD ${code} ${q}`)}`;
    }
    case "cart_rm": {
      const code = String(data.code || "").trim();
      return `https://wa.me/${d}?text=${encodeURIComponent(`CART REMOVE ${code}`)}`;
    }
    case "resell": {
      const code = String(data.code || "").trim();
      const m = Number(data.markup);
      const markup = Number.isFinite(m) ? Math.round(Math.min(7, Math.max(3, m))) : 3;
      return `https://wa.me/${d}?text=${encodeURIComponent(`RESELL ${code} ${markup}`)}`;
    }
    default:
      return "";
  }
}

/** Public base for signed links (no trailing slash). Override with WA_LINK_PUBLIC_BASE. */
export function getWaLinkPublicBase(): string {
  const explicit = String(process.env.WA_LINK_PUBLIC_BASE || "").trim().replace(/\/$/, "");

  function isPublicHttps(url: string): boolean {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") return false;
      const h = u.hostname.toLowerCase();
      if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0") return false;
      if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)) return false;
      return true;
    } catch {
      return false;
    }
  }

  // Legacy: WA_LINK_PUBLIC_BASE was set to api host + /api/wa — prefer FRONTEND_URL/wa (Next proxy).
  function isLegacyApiWaBase(url: string): boolean {
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      if (!/^api\./i.test(u.hostname)) return false;
      const p = u.pathname.replace(/\/$/, "") || "/";
      return p === "/api/wa" || p.startsWith("/api/wa/");
    } catch {
      return false;
    }
  }

  // Prefer main site (Next.js /wa/g proxy) so WhatsApp shows www, not api.* — see frontend app/wa/g/[token]/route.ts
  const frontendRaw = String(process.env.FRONTEND_URL || "https://www.qwertymates.com").trim().replace(/\/$/, "");
  function frontendWaBase(): string {
    try {
      const u = new URL(frontendRaw.startsWith("http") ? frontendRaw : `https://${frontendRaw}`);
      if (u.protocol === "http:" || u.protocol === "https:") {
        return `${u.origin}/wa`;
      }
    } catch {
      /* ignore */
    }
    return "https://www.qwertymates.com/wa";
  }

  const feWa = frontendWaBase();

  if (explicit && isPublicHttps(explicit)) {
    if (isLegacyApiWaBase(explicit)) return feWa;
    return explicit;
  }

  return feWa;
}

export function buildSignedWaUrl(token: string): string {
  return `${getWaLinkPublicBase()}/g/${token}`;
}

/**
 * Rewrite api-host /api/wa/g/:token URLs to the public frontend /wa/g/:token (same token).
 * Call before sending links to WhatsApp so users never see raw API hosts.
 */
export function normalizeWaPublicLinkUrl(url: string): string {
  const raw = String(url || "").trim();
  if (!raw) return raw;
  const base = getWaLinkPublicBase().replace(/\/$/, "");
  try {
    const u = new URL(raw);
    if (!/^api\./i.test(u.hostname)) return raw;
    const m = u.pathname.match(/^\/api\/wa\/g\/(.+)$/i);
    if (!m) return raw;
    return `${base}/g/${m[1]}`;
  } catch {
    return raw.replace(/^https:\/\/api\.[^/]+\/api\/wa\/g\//i, `${base}/g/`);
  }
}
