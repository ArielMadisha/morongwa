import LandingBackground from "../data/models/LandingBackground";
import { logger } from "./monitoring";

const DEFAULT_BG_URLS = ["/images/login-bg.png", "/images/login-bg-2.png"];

function parseSeedUrls(): string[] {
  const raw = String(process.env.DEFAULT_LANDING_BACKGROUNDS || "").trim();
  if (!raw) return DEFAULT_BG_URLS;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Idempotent startup seed: only inserts defaults when the collection is empty. */
export async function ensureDefaultLandingBackgrounds(): Promise<void> {
  const activeCount = await LandingBackground.countDocuments({ active: true });
  if (activeCount > 0) return;

  const urls = parseSeedUrls();
  if (urls.length === 0) return;

  await LandingBackground.insertMany(
    urls.map((imageUrl, index) => ({
      imageUrl,
      order: index,
      active: true,
    }))
  );

  logger.info("Seeded default landing backgrounds", { count: urls.length });
}
