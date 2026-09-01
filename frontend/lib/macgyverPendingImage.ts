/** In-memory handoff so the header camera can open /search and submit the same File. */

let pending: File | null = null;

export function setPendingMacGyverImage(file: File) {
  pending = file;
}

export function peekPendingMacGyverImage(): File | null {
  return pending;
}

export function clearPendingMacGyverImage() {
  pending = null;
}

/** Shrink large phone photos so vision + upload stay fast (max ~1280px JPEG). */
export async function prepareMacGyverImage(file: File): Promise<File> {
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) return file;
  if (file.size < 350_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 1280;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) return file;
    const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
