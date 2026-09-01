import express, { Request, Response } from "express";

/**
 * Public mobile client policy — used to force Play Store / App Store updates.
 * Env overrides (optional):
 *   MOBILE_ANDROID_MIN_VERSION=1.3.22
 *   MOBILE_ANDROID_MIN_VERSION_CODE=73
 *   MOBILE_ANDROID_STORE_URL=https://play.google.com/store/apps/details?id=com.qwertymates
 *   MOBILE_IOS_MIN_VERSION=1.3.23
 *   MOBILE_IOS_MIN_BUILD_NUMBER=1
 *   MOBILE_IOS_STORE_URL=https://apps.apple.com/app/id6798004708
 *   MOBILE_IOS_FORCE_UPDATE=false  (set true when forcing outdated iOS builds to update)
 */
const router = express.Router();

const DEFAULT_ANDROID_MIN_VERSION = "1.3.23";
const DEFAULT_ANDROID_MIN_VERSION_CODE = 75;
const DEFAULT_ANDROID_STORE_URL = "https://play.google.com/store/apps/details?id=com.qwertymates";

const DEFAULT_IOS_MIN_VERSION = "1.3.23";
const DEFAULT_IOS_MIN_BUILD_NUMBER = 1;
/** ASC app id 6798004708 — override with MOBILE_IOS_STORE_URL if the listing moves. */
const DEFAULT_IOS_STORE_URL = "https://apps.apple.com/app/id6798004708";

router.get("/android-update-policy", (_req: Request, res: Response) => {
  const minVersion =
    String(process.env.MOBILE_ANDROID_MIN_VERSION || DEFAULT_ANDROID_MIN_VERSION).trim() ||
    DEFAULT_ANDROID_MIN_VERSION;
  const rawCode = Number(process.env.MOBILE_ANDROID_MIN_VERSION_CODE || DEFAULT_ANDROID_MIN_VERSION_CODE);
  const minVersionCode =
    Number.isFinite(rawCode) && rawCode > 0 ? Math.floor(rawCode) : DEFAULT_ANDROID_MIN_VERSION_CODE;
  const storeUrl =
    String(process.env.MOBILE_ANDROID_STORE_URL || DEFAULT_ANDROID_STORE_URL).trim() ||
    DEFAULT_ANDROID_STORE_URL;
  const message =
    String(process.env.MOBILE_ANDROID_FORCE_MESSAGE || "").trim() ||
    "A required update is available. Please update Qwertymates from Google Play to continue.";

  res.json({
    data: {
      platform: "android",
      minVersion,
      minVersionCode,
      storeUrl,
      forceUpdate: true,
      message
    }
  });
});

router.get("/ios-update-policy", (_req: Request, res: Response) => {
  const minVersion =
    String(process.env.MOBILE_IOS_MIN_VERSION || DEFAULT_IOS_MIN_VERSION).trim() || DEFAULT_IOS_MIN_VERSION;
  const rawBuild = Number(process.env.MOBILE_IOS_MIN_BUILD_NUMBER || DEFAULT_IOS_MIN_BUILD_NUMBER);
  const minBuildNumber =
    Number.isFinite(rawBuild) && rawBuild > 0 ? Math.floor(rawBuild) : DEFAULT_IOS_MIN_BUILD_NUMBER;
  const storeUrl =
    String(process.env.MOBILE_IOS_STORE_URL || DEFAULT_IOS_STORE_URL).trim() || DEFAULT_IOS_STORE_URL;
  const forceEnv = String(process.env.MOBILE_IOS_FORCE_UPDATE || "").trim().toLowerCase();
  // Default off; set MOBILE_IOS_FORCE_UPDATE=true when blocking outdated iOS builds.
  const forceUpdate = forceEnv === "1" || forceEnv === "true" || forceEnv === "yes";
  const message =
    String(process.env.MOBILE_IOS_FORCE_MESSAGE || "").trim() ||
    "A required update is available. Please update Qwertymates from the App Store to continue.";

  res.json({
    data: {
      platform: "ios",
      minVersion,
      minBuildNumber,
      storeUrl,
      forceUpdate,
      message
    }
  });
});

export default router;
