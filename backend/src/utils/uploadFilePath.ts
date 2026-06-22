import fs from "fs";
import path from "path";

/** Resolve a public `/uploads/...` or absolute URL to a file under `backend/uploads`. */
export function resolveLocalUploadFilePath(urlOrPath: string | undefined): string | null {
  if (!urlOrPath || typeof urlOrPath !== "string") return null;
  let rel = urlOrPath.trim();
  if (rel.startsWith("http://") || rel.startsWith("https://")) {
    try {
      rel = new URL(rel).pathname;
    } catch {
      return null;
    }
  }
  const marker = "/uploads/";
  const idx = rel.indexOf(marker);
  if (idx < 0) return null;
  const sub = rel.slice(idx + marker.length).replace(/^\/+/, "");
  if (!sub || sub.includes("..")) return null;
  const full = path.join(process.cwd(), "uploads", sub);
  try {
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  } catch {
    /* ignore */
  }
  return null;
}

/** Safe browser URL for a stored file under `/uploads/` (encodes spaces and special chars). */
export function encodeUploadsPublicPath(publicPath: string): string {
  const raw = String(publicPath || "").trim();
  if (!raw) return raw;
  let pathOnly = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      pathOnly = new URL(raw).pathname;
    } catch {
      return raw;
    }
  }
  const marker = "/uploads/";
  const idx = pathOnly.indexOf(marker);
  if (idx < 0) return raw;
  const prefix = pathOnly.slice(0, idx + marker.length);
  const rest = pathOnly.slice(idx + marker.length);
  const encoded = rest
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(decodeURIComponent(seg)))
    .join("/");
  return `${prefix}${encoded}`;
}

/** Relative public path for a file saved by multer in `uploads/`. */
export function uploadsPathFromFilename(filename: string): string {
  return `/uploads/${String(filename || "").replace(/^\/+/, "")}`;
}

export function normalizeProductImageUrls(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    .map((u) => encodeUploadsPublicPath(u.trim()));
}

export function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return map[ext] || "image/jpeg";
}
