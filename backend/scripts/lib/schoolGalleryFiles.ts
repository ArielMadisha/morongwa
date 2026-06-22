import fs from "fs";
import path from "path";
import {
  isSchoolGalleryRootEntryName,
  isWindowsDuplicateCopyFolderName,
} from "./schoolNameMatching";

export const SCHOOL_GALLERY_IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

/** Case-insensitive resolve of one school folder under root (avoids scanning 10k+ dirs). */
export function resolveSchoolGalleryFolderPath(root: string, folderName: string): string | null {
  const name = String(folderName || "").trim();
  if (!name || !fs.existsSync(root)) return null;
  const exact = path.join(root, name);
  if (fs.existsSync(exact) && fs.statSync(exact).isDirectory()) return exact;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  const want = name.toLowerCase();
  for (const ent of entries) {
    if (ent.isDirectory() && ent.name.toLowerCase() === want) {
      return path.join(root, ent.name);
    }
  }
  return null;
}

/** Sorted absolute paths to school photo folders under the import root (shared by batch + daily). */
export function listSchoolGallerySourceFolders(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = entries
    .filter((ent) => ent.isDirectory() && isSchoolGalleryRootEntryName(ent.name))
    .map((ent) => ent.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const nameSet = new Set(names);
  return names
    .filter((n) => !isWindowsDuplicateCopyFolderName(n, nameSet))
    .map((n) => path.join(root, n));
}

/** Collect image files from a school folder (recursive; skips junk dirs). */
export function listSchoolGalleryImageFiles(
  dir: string,
  options?: { maxFiles?: number; maxDepth?: number }
): string[] {
  if (!fs.existsSync(dir)) return [];
  const maxFiles = Math.max(1, options?.maxFiles ?? 80);
  const maxDepth = Math.max(0, options?.maxDepth ?? 6);
  const skipDir = new Set(["node_modules", ".git", "__macosx", "thumbs.db"]);

  const out: string[] = [];

  function walk(current: string, depth: number) {
    if (out.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of entries) {
      if (out.length >= maxFiles) return;
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        if (depth >= maxDepth) continue;
        if (skipDir.has(ent.name.toLowerCase())) continue;
        walk(full, depth + 1);
        continue;
      }
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (SCHOOL_GALLERY_IMAGE_EXT.has(ext)) out.push(full);
    }
  }

  walk(dir, 0);
  out.sort();
  return out;
}
