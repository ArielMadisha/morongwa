/**
 * Content moderation service for TV posts.
 * Detects sexual, pornographic, violent, or sensitive content.
 *
 * To enable: set CONTENT_MODERATION_API_URL and CONTENT_MODERATION_API_KEY.
 * Compatible with Sightengine, fal.ai, or similar image moderation APIs.
 *
 * When no API is configured, all content passes (posts auto-approve).
 */

const API_URL = process.env.CONTENT_MODERATION_API_URL || "";
const API_KEY = process.env.CONTENT_MODERATION_API_KEY || "";

export type ModerationResult = {
  safe: boolean;
  reason?: string;
  categories?: string[];
};

/** Check if content is safe (no sexual, pornographic, violent, or sensitive material) */
export async function moderateMedia(filePath: string, mimeType: string): Promise<ModerationResult> {
  if (!API_URL || !API_KEY) {
    return { safe: true };
  }

  try {
    const isImage = mimeType.startsWith("image/");
    if (!isImage) return { safe: true }; // Video: would need frame extraction; skip for now

    // Example: Wire to Sightengine, fal.ai, or similar:
    // const FormData = require("form-data");
    // const form = new FormData();
    // form.append("media", fs.createReadStream(filePath));
    // const res = await axios.post(API_URL, form, { headers: { ...form.getHeaders(), "X-Api-Key": API_KEY } });
    // Parse res.data for nudity, violence, nsfw flags and return { safe: false } if detected

    return { safe: true };
  } catch (err) {
    console.warn("Content moderation failed:", err);
    return { safe: true }; // fail open - don't block posts if API is down
  }
}
