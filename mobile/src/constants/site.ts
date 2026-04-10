/** Public marketing site origin (serves the same nav PNGs as the web app’s `/public` folder). */
export const SITE_ORIGIN = "https://www.qwertymates.com";

export const SITE_NAV_ICONS = {
  errands: "/errands-icon.png",
  acbPayWallet: "/wallet-icon.png",
  qwertyHub: "/qwertyhub-icon.png",
  qwertyTv: "/qwertytv-icon.png",
  qwertyWorld: "/qwertyworld-icon.png",
  qwertyMusic: "/music-icon.png",
  myStore: "/mystore-icon.png",
  morongwa: "/messages-icon.png"
} as const;

export function siteAssetUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_ORIGIN}${p}`;
}
