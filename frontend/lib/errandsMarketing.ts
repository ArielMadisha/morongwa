/** Errands marketing + server-hosted app gallery links. */

export const ERRANDS_DASHBOARD_URL = "https://www.qwertymates.com/dashboard/runner";
export const APPS_GALLERY_PAGE_URL = "https://www.qwertymates.com/apps";
export const MOBILE_RELEASES_MANIFEST_URL =
  "https://api.qwertymates.com/uploads/mobile-releases/manifest.json";

export const ERRANDS_ANDROID_PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.qwertymates";

export const ERRANDS_POPULAR_ROUTES = [
  { flagFrom: "🇿🇦", flagTo: "🇧🇼", label: "Botswana" },
  { flagFrom: "🇿🇦", flagTo: "🇱🇸", label: "Lesotho" },
  { flagFrom: "🇿🇦", flagTo: "🇿🇼", label: "Zimbabwe" },
  { flagFrom: "🇿🇦", flagTo: "🇲🇿", label: "Mozambique" },
] as const;

export const ERRANDS_SA_BULLETS = [
  "Deliveries and collections",
  "Transporting large items (fridges, drums, furniture)",
  "Connecting you with reliable local runners",
] as const;

export const ERRANDS_BORDER_BULLETS = [
  "We collect your goods",
  "We send them safely to Botswana, Lesotho, Zimbabwe, Mozambique & more",
  "Transport options: taxi, bus, courier, or border drop-off",
] as const;
