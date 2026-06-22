/** True if URL path looks like a video file by extension. */
export function looksLikeVideoUrl(url: string | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const pathOnly = url.split(/[?#]/)[0].toLowerCase();
  return /\.(mp4|webm|mov|mkv|m4v|avi|ogv|3gp|m3u8)$/.test(pathOnly);
}

/** True if URL path looks like an audio file — do not use as Image source. */
export function looksLikeAudioUrl(url: string | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const pathOnly = url.split(/[?#]/)[0].toLowerCase();
  return /\.(mp3|m4a|aac|wav|ogg|flac|opus|oga)$/.test(pathOnly);
}
