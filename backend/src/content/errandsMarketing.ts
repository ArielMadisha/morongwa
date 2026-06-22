/** Qwertymates Errands marketing copy — keep in sync with frontend/lib/errandsMarketing.ts and mobile/src/content/errandsMarketing.ts */

export const ERRANDS_DASHBOARD_URL = "https://www.qwertymates.com/dashboard/runner";
export const APPS_GALLERY_PAGE_URL = "https://www.qwertymates.com/apps";
export const MOBILE_RELEASES_MANIFEST_URL =
  "https://api.qwertymates.com/uploads/mobile-releases/manifest.json";
export const ERRANDS_ANDROID_PLAY_URL = "https://play.google.com/store/apps/details?id=com.qwertymates";

/** WhatsApp / Studio body — labels only; send URLs via `sendWhatsAppErrandsIntro` follow-ups. */
export function buildErrandsIntroMenuBody(): string {
  return [
    "📦 Qwertymates Errands",
    "",
    "Your trusted errands partner in Southern Africa",
    "",
    "✅ In South Africa",
    "",
    "We assist with:",
    "",
    "• Deliveries and collections",
    "• Transporting large items (fridges, drums, furniture)",
    "• Connecting you with reliable local runners",
    "",
    "✅ Across Borders",
    "",
    "Buy in South Africa and let us handle the rest:",
    "",
    "• We collect your goods",
    "• We send them safely to Botswana, Lesotho, Zimbabwe, Mozambique & more",
    "• Transport options: taxi, bus, courier, or border drop-off",
    "",
    "🚛 Safe Transport for Large Items",
    "",
    "Move bulky goods with confidence — handled by trusted runners.",
    "",
    "🌍 Popular Routes",
    "",
    "• 🇿🇦 → 🇧🇼 Botswana",
    "• 🇿🇦 → 🇱🇸 Lesotho",
    "• 🇿🇦 → 🇿🇼 Zimbabwe",
    "• 🇿🇦 → 🇲🇿 Mozambique",
    "",
    "---",
    "",
    "💡 Simple process:",
    "You order → We collect → We deliver safely",
    "",
    "👇 Continue with Qwertymates Errands:",
    "Qwertymates Dashboard",
    "",
    "👇 Or download our mobile apps:",
    "",
    "• Android App",
  ].join("\n");
}
