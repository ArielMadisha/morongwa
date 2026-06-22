import type { ImagePickerAsset } from "expo-image-picker";
import type { RNUploadFile } from "./api";

export function fileNameFromUri(uri: string, fallback: string): string {
  const m = uri.replace(/\\/g, "/").match(/[^/]+$/);
  return m && m[0] ? m[0] : fallback;
}

export function imageAssetToUploadFile(asset: ImagePickerAsset, fallbackName: string): RNUploadFile {
  const name = asset.fileName || fileNameFromUri(asset.uri, fallbackName);
  const type = asset.mimeType || guessImageMime(name);
  return { uri: asset.uri, name, type, webFile: (asset as any).file };
}

function guessImageMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export function defaultImageUploadName(asset: ImagePickerAsset, index: number): string {
  if (asset.fileName) return asset.fileName;
  const uri = asset.uri || "";
  const fromUri = uri.replace(/\\/g, "/").match(/\.([a-z0-9]+)(?:\?|$)/i);
  if (fromUri?.[1]) {
    const ext = fromUri[1].toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
      return `image-${index + 1}.${ext === "jpg" ? "jpg" : ext}`;
    }
  }
  const mt = (asset.mimeType || "").toLowerCase();
  if (mt.includes("gif")) return `image-${index + 1}.gif`;
  if (mt.includes("png")) return `image-${index + 1}.png`;
  if (mt.includes("webp")) return `image-${index + 1}.webp`;
  return `image-${index + 1}.jpg`;
}

export function guessVideoMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov") || lower.endsWith(".qt")) return "video/quicktime";
  if (lower.endsWith(".m4v")) return "video/x-m4v";
  if (lower.endsWith(".mkv")) return "video/x-matroska";
  if (lower.endsWith(".3gp")) return "video/3gpp";
  return "video/mp4";
}
