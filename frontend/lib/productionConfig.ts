/**
 * Production API / host constants — used by next.config.ts and lib/api.ts
 * so rewrites, SSR, and browser clients all agree.
 */
export const PROD_API_BASE = "https://api.qwertymates.com";
export const PROD_API_URL = `${PROD_API_BASE}/api`;

const PROD_HOSTS = new Set(["qwertymates.com", "www.qwertymates.com"]);

export function isProdQwertymatesHostname(hostname: string): boolean {
  return PROD_HOSTS.has(hostname.toLowerCase());
}
