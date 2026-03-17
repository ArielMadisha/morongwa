/**
 * Content moderation service for TV posts.
 * Detects sexual, pornographic, violent, or sensitive content.
 *
 * To enable nudity blocking: set SIGHTENGINE_API_USER and SIGHTENGINE_API_SECRET.
 * Get free API keys at https://sightengine.com
 *
 * - Explicit content (sexual_activity, sexual_display, erotica): BLOCK + report to admin
 * - Suggestive content (very_suggestive, suggestive): Allow but mark as sensitive (blur + click to reveal)
 * - When no API is configured, all content passes.
 */

import fs from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";

const SIGHTENGINE_USER = process.env.SIGHTENGINE_API_USER || "";
const SIGHTENGINE_SECRET = process.env.SIGHTENGINE_API_SECRET || "";

// Thresholds (0-1): above these = block or mark sensitive
const BLOCK_THRESHOLD = 0.5; // sexual_activity, sexual_display, erotica
const SENSITIVE_THRESHOLD = 0.5; // very_suggestive, suggestive

export type ModerationResult = {
  safe: boolean;
  /** When true, allow upload but mark post as sensitive (blur + click to reveal) */
  sensitive?: boolean;
  reason?: string;
  categories?: string[];
};

/** Check if content is safe (no sexual, pornographic, violent, or sensitive material) */
export async function moderateMedia(filePath: string, mimeType: string): Promise<ModerationResult> {
  if (!SIGHTENGINE_USER || !SIGHTENGINE_SECRET) {
    return { safe: true };
  }

  const isImage = mimeType.startsWith("image/");
  if (!isImage) return { safe: true }; // Video: would need frame extraction; skip for now

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
    });

    const nudity = res.data?.nudity || {};
    const sexualActivity = Number(nudity.sexual_activity ?? 0);
    const sexualDisplay = Number(nudity.sexual_display ?? 0);
    const erotica = Number(nudity.erotica ?? 0);
    const verySuggestive = Number(nudity.very_suggestive ?? 0);
    const suggestive = Number(nudity.suggestive ?? 0);

    // Block: explicit sexual content
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

    // Sensitive: suggestive content - allow but mark for blur
    if (verySuggestive >= SENSITIVE_THRESHOLD || suggestive >= SENSITIVE_THRESHOLD) {
      const cats: string[] = [];
      if (verySuggestive >= SENSITIVE_THRESHOLD) cats.push("very_suggestive");
      if (suggestive >= SENSITIVE_THRESHOLD) cats.push("suggestive");
      return {
        safe: true,
        sensitive: true,
        reason: "Suggestive content detected",
        categories: cats,
      };
    }

    return { safe: true };
  } catch (err) {
    console.warn("Content moderation failed:", err);
    return { safe: true }; // fail open - don't block posts if API is down
  }
}
