/**
 * Trusted Qwertymates web origins for links opened from the **native** app.
 * All opens use the **system browser** (`Linking.openURL`) — no in-app WebView / Custom Tabs.
 */

export const SITE_ORIGIN = "https://www.qwertymates.com";

/** Hostnames we allow when a caller passes an absolute URL (phishing guard). */
export const TRUSTED_WEB_HOSTS = new Set([
  "www.qwertymates.com",
  "qwertymates.com",
  "m.qwertymates.com",
]);

/**
 * Build an absolute https URL for the main site. Accepts `/path` or full URL (trusted hosts only).
 */
export function normalizeSiteUrl(input: string): string {
  const s = input.trim();
  if (!s) throw new Error("normalizeSiteUrl: empty input");
  if (/^https?:\/\//i.test(s)) {
    let u: URL;
    try {
      u = new URL(s);
    } catch {
      throw new Error("normalizeSiteUrl: invalid URL");
    }
    if (!TRUSTED_WEB_HOSTS.has(u.hostname.toLowerCase())) {
      throw new Error(`normalizeSiteUrl: untrusted host ${u.hostname}`);
    }
    return u.toString();
  }
  const path = s.startsWith("/") ? s : `/${s}`;
  return `${SITE_ORIGIN}${path}`;
}
