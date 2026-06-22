/**
 * Content moderation (Sightengine nudity-2.1).
 *
 * Env:
 *   SIGHTENGINE_API_USER / SIGHTENGINE_API_SECRET — required for scanning
 *   CONTENT_MODERATION_REQUIRED=1 — block uploads when API not configured (recommended production)
 *   CONTENT_MODERATION_BLOCK_SUGGESTIVE=1 — treat suggestive scores as unsafe (no lingerie/bikini uploads)
 *   CONTENT_MODERATION_FAIL_OPEN=1 — allow uploads if Sightengine is down (default: fail closed when configured)
 */

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import axios from "axios";
import FormData from "form-data";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function sightengineCreds() {
  return {
    user: (process.env.SIGHTENGINE_API_USER || "").trim(),
    secret: (process.env.SIGHTENGINE_API_SECRET || "").trim(),
  };
}

function flag(name: string): boolean {
  return process.env[name] === "1" || process.env[name]?.toLowerCase() === "true";
}

function blockThreshold() {
  return Number(process.env.CONTENT_MODERATION_BLOCK_THRESHOLD || "0.5");
}

function sensitiveThreshold() {
  return Number(process.env.CONTENT_MODERATION_SENSITIVE_THRESHOLD || "0.5");
}

export type ModerationResult = {
  safe: boolean;
  sensitive?: boolean;
  reason?: string;
  categories?: string[];
};

export function isContentModerationConfigured(): boolean {
  const { user, secret } = sightengineCreds();
  return !!(user && secret);
}

/** When set, callers should reject the upload (e.g. AppError 503). */
export function moderationUploadBlockedReason(): string | null {
  if (flag("CONTENT_MODERATION_REQUIRED") && !isContentModerationConfigured()) {
    return "Image safety verification is required but not configured on the server.";
  }
  return null;
}

/** True when this result should be deleted from the site (explicit or, if configured, suggestive). */
export function moderationResultShouldRemove(result: ModerationResult): boolean {
  if (!result.safe) return true;
  if (flag("CONTENT_MODERATION_BLOCK_SUGGESTIVE") && result.sensitive) return true;
  return false;
}

export async function moderateMedia(filePath: string, mimeType: string): Promise<ModerationResult> {
  const { user: SIGHTENGINE_USER, secret: SIGHTENGINE_SECRET } = sightengineCreds();
  const BLOCK_THRESHOLD = blockThreshold();
  const SENSITIVE_THRESHOLD = sensitiveThreshold();
  const FAIL_OPEN = flag("CONTENT_MODERATION_FAIL_OPEN");
  const BLOCK_SUGGESTIVE = flag("CONTENT_MODERATION_BLOCK_SUGGESTIVE");

  if (!isContentModerationConfigured()) {
    if (flag("CONTENT_MODERATION_REQUIRED")) {
      return {
        safe: false,
        reason: "Image safety verification is required but not configured on the server.",
      };
    }
    return { safe: true };
  }

  const isImage = mimeType.startsWith("image/");
  if (!isImage) return { safe: true };

  try {
    const form = new FormData();
    form.append("media", fs.createReadStream(filePath), {
      filename: path.basename(filePath),
      contentType: mimeType,
    });
    form.append("models", "nudity-2.1");
    form.append("api_user", SIGHTENGINE_USER);
    form.append("api_secret", SIGHTENGINE_SECRET);

    const res = await axios.post("https://api.sightengine.com/1.0/check.json", form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 60000,
    });

    const nudity = res.data?.nudity || {};
    const sexualActivity = Number(nudity.sexual_activity ?? 0);
    const sexualDisplay = Number(nudity.sexual_display ?? 0);
    const erotica = Number(nudity.erotica ?? 0);
    const verySuggestive = Number(nudity.very_suggestive ?? 0);
    const suggestive = Number(nudity.suggestive ?? 0);

    if (sexualActivity >= BLOCK_THRESHOLD || sexualDisplay >= BLOCK_THRESHOLD || erotica >= BLOCK_THRESHOLD) {
      const cats: string[] = [];
      if (sexualActivity >= BLOCK_THRESHOLD) cats.push("sexual_activity");
      if (sexualDisplay >= BLOCK_THRESHOLD) cats.push("sexual_display");
      if (erotica >= BLOCK_THRESHOLD) cats.push("erotica");
      return {
        safe: false,
        reason: "This image violates community guidelines. Explicit or sexual content is not allowed.",
        categories: cats,
      };
    }

    if (verySuggestive >= SENSITIVE_THRESHOLD || suggestive >= SENSITIVE_THRESHOLD) {
      const cats: string[] = [];
      if (verySuggestive >= SENSITIVE_THRESHOLD) cats.push("very_suggestive");
      if (suggestive >= SENSITIVE_THRESHOLD) cats.push("suggestive");
      if (BLOCK_SUGGESTIVE) {
        return {
          safe: false,
          reason: "This image violates community guidelines. Suggestive or adult content is not allowed.",
          categories: cats,
        };
      }
      return {
        safe: true,
        sensitive: true,
        reason: "Suggestive content detected",
        categories: cats,
      };
    }

    return { safe: true };
  } catch (err: unknown) {
    const ax = err as {
      response?: { status?: number; data?: { error?: { code?: number; type?: string; message?: string } } };
    };
    const apiErr = ax?.response?.data?.error;
    if (apiErr?.code === 32 || apiErr?.type === "usage_limit") {
      console.warn("Sightengine daily usage limit — skipping check until quota resets or plan is upgraded.");
      return { safe: true };
    }
    if (ax?.response?.data) {
      console.warn("Content moderation failed:", ax.response.status, JSON.stringify(ax.response.data));
    } else {
      console.warn("Content moderation failed:", err);
    }
    if (FAIL_OPEN) return { safe: true };
    return {
      safe: false,
      reason: "Unable to verify image safety. Please try again later.",
    };
  }
}

function tempModerationPath(ext: string): string {
  const base = path.join(os.tmpdir(), `qm-mod-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`);
  return `${base}${ext.startsWith(".") ? ext : `.${ext}`}`;
}

/** Download remote image and run Sightengine — fail closed for automated ingest (Facebook TV bots). */
export async function moderateRemoteImageUrl(
  url: string,
  opts?: { failClosed?: boolean }
): Promise<ModerationResult> {
  const failClosed = opts?.failClosed !== false;
  if (!isContentModerationConfigured()) {
    return failClosed
      ? { safe: false, reason: "Image safety verification is required but not configured on the server." }
      : { safe: true };
  }
  const tmp = tempModerationPath(".jpg");
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 120000,
      maxContentLength: 25 * 1024 * 1024,
      headers: { "User-Agent": "Qwertymates-FacebookIngest/1.0" },
    });
    fs.writeFileSync(tmp, Buffer.from(res.data));
    const mime = String(res.headers["content-type"] || "image/jpeg").split(";")[0].trim();
    const result = await moderateMedia(tmp, mime.startsWith("image/") ? mime : "image/jpeg");
    if (failClosed && !result.safe) return result;
    if (failClosed && result.sensitive && flag("CONTENT_MODERATION_BLOCK_SUGGESTIVE")) {
      return { safe: false, reason: result.reason || "Suggestive content blocked", categories: result.categories };
    }
    return result;
  } catch (err) {
    if (failClosed) {
      return { safe: false, reason: `Unable to verify remote image: ${String((err as Error)?.message || err)}` };
    }
    return { safe: true };
  } finally {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

/** Sample one video frame via ffprobe/ffmpeg when available, then moderate — fail closed for ingest. */
export async function moderateRemoteVideoUrl(
  url: string,
  opts?: { failClosed?: boolean }
): Promise<ModerationResult> {
  const failClosed = opts?.failClosed !== false;
  if (!isContentModerationConfigured()) {
    return failClosed
      ? { safe: false, reason: "Video safety verification is required but not configured on the server." }
      : { safe: true };
  }
  const videoTmp = tempModerationPath(".mp4");
  const frameTmp = tempModerationPath(".jpg");
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 300000,
      maxContentLength: 120 * 1024 * 1024,
      headers: { "User-Agent": "Qwertymates-FacebookIngest/1.0" },
    });
    fs.writeFileSync(videoTmp, Buffer.from(res.data));
    try {
      await execFileAsync("ffmpeg", [
        "-y",
        "-i",
        videoTmp,
        "-ss",
        "00:00:01",
        "-vframes",
        "1",
        "-q:v",
        "2",
        frameTmp,
      ], { timeout: 120000 });
    } catch {
      if (failClosed) {
        return { safe: false, reason: "Unable to extract video frame for safety check (ffmpeg required)." };
      }
      return { safe: true };
    }
    if (!fs.existsSync(frameTmp)) {
      return failClosed
        ? { safe: false, reason: "Video frame extraction failed for safety check." }
        : { safe: true };
    }
    const result = await moderateMedia(frameTmp, "image/jpeg");
    if (failClosed && !result.safe) return result;
    if (failClosed && result.sensitive && flag("CONTENT_MODERATION_BLOCK_SUGGESTIVE")) {
      return { safe: false, reason: result.reason || "Suggestive content blocked", categories: result.categories };
    }
    return result;
  } catch (err) {
    if (failClosed) {
      return { safe: false, reason: `Unable to verify remote video: ${String((err as Error)?.message || err)}` };
    }
    return { safe: true };
  } finally {
    for (const f of [videoTmp, frameTmp]) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
  }
}
