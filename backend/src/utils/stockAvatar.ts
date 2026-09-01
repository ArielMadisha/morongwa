/**
 * Gendered stock avatars for users who register without a profile photo.
 * Assets live in backend/assets/bulk-signup-avatars and are served from
 * /uploads/avatars/stock/*.
 *
 * Path note: tsc emits to dist/src/utils/, so ../../assets points at dist/assets
 * (wrong). Resolve against several candidates including cwd and uploads fallback.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { inferUserGender, type InferredGender } from "./inferUserGender";

export const MALE_STOCK_AVATARS = ["male-1.png", "male-2.png", "male-3.png", "male-4.png"] as const;
export const FEMALE_STOCK_AVATARS = ["female-1.png", "female-2.png", "female-3.png"] as const;

const ALL_STOCK = [...MALE_STOCK_AVATARS, ...FEMALE_STOCK_AVATARS] as const;

function candidateAssetDirs(): string[] {
  const cwd = process.cwd();
  return [
    // Prefer explicit env override (Docker / ops)
    process.env.STOCK_AVATAR_ASSETS_DIR,
    // From src/utils (ts-node / tests)
    path.resolve(__dirname, "../../assets/bulk-signup-avatars"),
    // From dist/src/utils (production build)
    path.resolve(__dirname, "../../../assets/bulk-signup-avatars"),
    path.resolve(cwd, "assets/bulk-signup-avatars"),
    path.resolve(cwd, "backend/assets/bulk-signup-avatars"),
    // Already-served copies (safe fallback)
    path.resolve(__dirname, "../../uploads/avatars/stock"),
    path.resolve(__dirname, "../../../uploads/avatars/stock"),
    path.resolve(cwd, "uploads/avatars/stock"),
    path.resolve(cwd, "backend/uploads/avatars/stock"),
  ].filter((d): d is string => Boolean(d && String(d).trim()));
}

function candidateUploadDirs(): string[] {
  const cwd = process.cwd();
  return [
    process.env.STOCK_AVATAR_UPLOAD_DIR,
    path.resolve(__dirname, "../../uploads/avatars/stock"),
    path.resolve(__dirname, "../../../uploads/avatars/stock"),
    path.resolve(cwd, "uploads/avatars/stock"),
    path.resolve(cwd, "backend/uploads/avatars/stock"),
  ].filter((d): d is string => Boolean(d && String(d).trim()));
}

function resolveAssetsDir(): string {
  for (const dir of candidateAssetDirs()) {
    if (ALL_STOCK.every((f) => fs.existsSync(path.join(dir, f)))) return dir;
  }
  for (const dir of candidateAssetDirs()) {
    if (fs.existsSync(path.join(dir, "male-1.png"))) return dir;
  }
  return candidateAssetDirs()[0] || path.resolve(process.cwd(), "assets/bulk-signup-avatars");
}

function resolveUploadStockDir(): string {
  for (const dir of candidateUploadDirs()) {
    if (fs.existsSync(dir) || dir.includes("uploads")) {
      return dir;
    }
  }
  return path.resolve(process.cwd(), "uploads/avatars/stock");
}

export function ensureStockAvatarsOnDisk(): void {
  const assetsDir = resolveAssetsDir();
  const uploadDir = resolveUploadStockDir();
  fs.mkdirSync(uploadDir, { recursive: true });

  const missing: string[] = [];
  for (const file of ALL_STOCK) {
    const dest = path.join(uploadDir, file);
    if (fs.existsSync(dest)) continue;

    const src = path.join(assetsDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      continue;
    }

    // Last resort: copy from any sibling candidate that has this file
    let copied = false;
    for (const dir of candidateAssetDirs()) {
      const alt = path.join(dir, file);
      if (fs.existsSync(alt)) {
        fs.copyFileSync(alt, dest);
        copied = true;
        break;
      }
    }
    if (!copied) missing.push(file);
  }

  if (missing.length) {
    throw new Error(
      `Missing stock avatar asset(s): ${missing.join(", ")} (looked in ${assetsDir}; upload dir ${uploadDir})`
    );
  }
}

export function pickStockAvatarPath(gender: InferredGender): string {
  ensureStockAvatarsOnDisk();
  const pool = gender === "female" ? FEMALE_STOCK_AVATARS : MALE_STOCK_AVATARS;
  const file = pool[crypto.randomInt(0, pool.length)];
  return `/uploads/avatars/stock/${file}`;
}

/** Assign a gendered stock avatar from name + optional username. */
export function assignStockAvatarForNewUser(params: {
  name?: string | null;
  username?: string | null;
}): { gender: InferredGender; avatar: string } {
  const name = String(params.name || "").trim();
  const username = String(params.username || "").trim();
  const gender = inferUserGender(name || username, username);
  return { gender, avatar: pickStockAvatarPath(gender) };
}

export function isStockAvatarPath(avatar?: string | null): boolean {
  return /^\/uploads\/avatars\/stock\/(male|female)-\d+\.png$/i.test(String(avatar || "").trim());
}
