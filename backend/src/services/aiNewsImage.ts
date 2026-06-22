import fs from "fs";
import path from "path";
import crypto from "crypto";
import axios from "axios";
import {
  fetchFootballFixtures,
  isGenericSportsNewsImage,
  isLowValueSportsHeadline,
  resolveSportsClubMediaFallback,
  resolveSportsClubMediaFromHeadline,
} from "./sportsClubMedia";

const UPLOADS_TV = path.join(process.cwd(), "uploads", "tv");

export type AiNewsLiveItemForImage = {
  url: string;
  imageUrl?: string;
};

function isHttpUrl(input: string): boolean {
  return /^https?:\/\//i.test(String(input || "").trim());
}

function normalizeImageUrl(raw: string): string | null {
  const url = String(raw || "").trim();
  if (!isHttpUrl(url)) return null;
  if (/api-sports\.io|media\.api-sports/i.test(url)) return null;
  return url;
}

async function fetchOgImageFromArticle(articleUrl: string): Promise<string | null> {
  if (!isHttpUrl(articleUrl)) return null;
  try {
    const res = await axios.get(articleUrl, {
      timeout: 20000,
      maxContentLength: 2 * 1024 * 1024,
      headers: { "User-Agent": "Qwertymates-AiNews/1.0" },
      validateStatus: (s) => s >= 200 && s < 400,
    });
    const html = String(res.data || "");
    const patterns = [
      /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["']/i,
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      const candidate = normalizeImageUrl(m?.[1] || "");
      if (candidate) return candidate;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function downloadToTvUploads(remoteUrl: string): Promise<string | null> {
  const url = normalizeImageUrl(remoteUrl);
  if (!url) return null;
  try {
    fs.mkdirSync(UPLOADS_TV, { recursive: true });
    const ext = url.toLowerCase().includes(".png") ? ".png" : ".jpg";
    const filename = `tv-ainews-${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`;
    const dest = path.join(UPLOADS_TV, filename);
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 60000,
      maxContentLength: 12 * 1024 * 1024,
      headers: { "User-Agent": "Qwertymates-AiNews/1.0", Accept: "image/*,*/*" },
    });
    const mime = String(res.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (mime && !mime.startsWith("image/")) return null;
    fs.writeFileSync(dest, Buffer.from(res.data));
    return `/uploads/tv/${filename}`;
  } catch {
    return null;
  }
}

/** Resolve + download a lead image for an AI news post (RSS thumb or article og:image). */
export async function resolveAiNewsPostMedia(
  item: AiNewsLiveItemForImage
): Promise<{ type: "text" | "image" | "carousel"; mediaUrls: string[] }> {
  const enabled = String(process.env.AI_NEWS_INCLUDE_IMAGE || "true").trim() !== "false";
  if (!enabled) return { type: "text", mediaUrls: [] };

  let remote =
    normalizeImageUrl(item.imageUrl || "") ||
    (await fetchOgImageFromArticle(item.url));

  if (!remote) return { type: "text", mediaUrls: [] };

  const localPath = await downloadToTvUploads(remote);
  if (!localPath) return { type: "text", mediaUrls: [] };

  return { type: "image", mediaUrls: [localPath] };
}

/** Sports posts: downloaded club badges from API-Football; never generic Google News branding. */
export async function resolveSportsAiNewsPostMedia(opts: {
  title: string;
  url?: string;
  imageUrl?: string;
}): Promise<{ type: "text" | "image" | "carousel"; mediaUrls: string[] }> {
  const enabled = String(process.env.AI_NEWS_INCLUDE_IMAGE || "true").trim() !== "false";
  if (!enabled) return { type: "text", mediaUrls: [] };

  const title = String(opts.title || "").trim();
  if (isLowValueSportsHeadline(title)) {
    return { type: "text", mediaUrls: [] };
  }

  const fixtures = await fetchFootballFixtures();
  const clubFromHeadline = await resolveSportsClubMediaFromHeadline(title, fixtures);
  if (clubFromHeadline.mediaUrls.length > 0) return clubFromHeadline;

  let remote = normalizeImageUrl(opts.imageUrl || "");
  if (!remote || isGenericSportsNewsImage(remote)) {
    remote = normalizeImageUrl((await fetchOgImageFromArticle(opts.url || "")) || "");
  }
  if (remote && !isGenericSportsNewsImage(remote)) {
    const localPath = await downloadToTvUploads(remote);
    if (localPath) return { type: "image", mediaUrls: [localPath] };
  }

  const fallback = await resolveSportsClubMediaFallback(fixtures);
  if (fallback.mediaUrls.length > 0) return fallback;

  return { type: "text", mediaUrls: [] };
}
