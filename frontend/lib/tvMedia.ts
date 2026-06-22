/**
 * Shared TV / QwertyTV helpers for detecting video files and normalizing URLs.
 */

/** True if URL path looks like a video file by extension. Avoid guessing from `/uploads/tv/` alone — extensionless
 * uploads there may be images; feed rendering uses post `type` (see TVGridTile) so ambiguous paths stay correct. */
export function looksLikeVideoUrl(url: string | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const pathOnly = url.split(/[?#]/)[0].toLowerCase();
  return /\.(mp4|webm|mov|mkv|m4v|avi|ogv|3gp|m3u8)$/.test(pathOnly);
}

/** True if URL path looks like an audio file — do not use as <img src>. */
export function looksLikeAudioUrl(url: string | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const pathOnly = url.split(/[?#]/)[0].toLowerCase();
  return /\.(mp3|m4a|aac|wav|ogg|flac|opus|oga)$/.test(pathOnly);
}

/** True if URL path looks like a raster/SVG image — never feed these to `<video>`. */
export function looksLikeImageUrl(url: string | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const pathOnly = url.split(/[?#]/)[0].toLowerCase();
  return /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/.test(pathOnly);
}
