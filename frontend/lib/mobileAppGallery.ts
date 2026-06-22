/** Server-hosted Android + Huawei app gallery URLs (no external store required). */

export const APPS_GALLERY_PAGE_URL = "https://www.qwertymates.com/apps";

export const MOBILE_RELEASES_MANIFEST_URL =
  "https://api.qwertymates.com/uploads/mobile-releases/manifest.json";

export const ERRANDS_ANDROID_PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.qwertymates";

export type MobileReleaseManifest = {
  updatedAt?: string | null;
  pendingVersion?: string;
  pendingNote?: string;
  android?: {
    version?: string;
    versionCode?: number;
    label?: string;
    file?: string;
    url?: string;
    playStoreUrl?: string;
  };
  huawei?: {
    version?: string;
    versionCode?: number;
    label?: string;
    file?: string;
    url?: string;
    note?: string;
  };
  gallery?: {
    android?: string[];
    huawei?: string[];
  };
};

export function mobileReleaseFileUrl(filePath: string): string {
  const rel = filePath.replace(/^\/+/, "");
  return `https://api.qwertymates.com/uploads/mobile-releases/${rel}`;
}

export function galleryImageUrl(filePath: string): string {
  if (filePath.startsWith("http")) return filePath;
  return mobileReleaseFileUrl(filePath);
}
