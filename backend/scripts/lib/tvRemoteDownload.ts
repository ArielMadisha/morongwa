import fs from "fs";
import path from "path";
import crypto from "crypto";
import axios from "axios";

const UPLOADS_TV = path.join(process.cwd(), "uploads", "tv");

/** Download remote image/video into /uploads/tv/ for reliable QwertyTV playback. */
export async function downloadRemoteToTvUploads(
  remoteUrl: string,
  ext: string,
  prefix = "tv-api"
): Promise<{ publicPath: string; mime: string } | null> {
  const url = String(remoteUrl || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    fs.mkdirSync(UPLOADS_TV, { recursive: true });
    const safeExt = ext.startsWith(".") ? ext : `.${ext}`;
    const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(5).toString("hex")}${safeExt}`;
    const dest = path.join(UPLOADS_TV, filename);
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 120000,
      maxContentLength: 25 * 1024 * 1024,
      headers: { "User-Agent": "Qwertymates-TV-Ingest/1.0" },
    });
    fs.writeFileSync(dest, Buffer.from(res.data));
    const mime = String(res.headers["content-type"] || "").split(";")[0].trim() || "application/octet-stream";
    return { publicPath: `/uploads/tv/${filename}`, mime };
  } catch {
    return null;
  }
}

export function looksLikeDirectVideoUrl(url: string): boolean {
  const pathOnly = String(url || "").split(/[?#]/)[0].toLowerCase();
  return /\.(mp4|webm|mov|mkv|m4v|avi|ogv|3gp|m3u8)$/.test(pathOnly);
}
