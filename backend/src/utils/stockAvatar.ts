/**
 * Gendered stock avatars for users who register without a profile photo.
 * Assets live in backend/assets/bulk-signup-avatars and are served from
 * /uploads/avatars/stock/*.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { inferUserGender, type InferredGender } from "./inferUserGender";

const ASSETS_DIR = path.resolve(__dirname, "../../assets/bulk-signup-avatars");
const UPLOAD_STOCK_DIR = path.resolve(__dirname, "../../uploads/avatars/stock");

export const MALE_STOCK_AVATARS = ["male-1.png", "male-2.png", "male-3.png", "male-4.png"] as const;
export const FEMALE_STOCK_AVATARS = ["female-1.png", "female-2.png", "female-3.png"] as const;

export function ensureStockAvatarsOnDisk(): void {
  fs.mkdirSync(UPLOAD_STOCK_DIR, { recursive: true });
  for (const file of [...MALE_STOCK_AVATARS, ...FEMALE_STOCK_AVATARS]) {
    const src = path.join(ASSETS_DIR, file);
    const dest = path.join(UPLOAD_STOCK_DIR, file);
    if (!fs.existsSync(src)) {
      throw new Error(`Missing stock avatar asset: ${src}`);
    }
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
    }
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
