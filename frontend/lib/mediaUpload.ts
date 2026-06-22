/** Helpers for wall/TV file uploads (browser File API). */

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv|3gp|3g2)$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;

/** File picker accept list for wall/TV image + GIF uploads. */
export const ACCEPT_TV_IMAGES = 'image/jpeg,image/png,image/gif,image/webp,.gif';

export function isVideoFile(file: File): boolean {
  if (file.type?.startsWith('video/')) return true;
  return VIDEO_EXT.test(file.name || '');
}

export function isImageFile(file: File): boolean {
  if (file.type?.startsWith('image/')) return true;
  return IMAGE_EXT.test(file.name || '');
}

export function isGifFile(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  if (t === 'image/gif') return true;
  return /\.gif$/i.test(file.name || '');
}

export function guessVideoMime(name: string): string {
  const lower = (name || '').toLowerCase();
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov') || lower.endsWith('.qt')) return 'video/quicktime';
  if (lower.endsWith('.m4v')) return 'video/x-m4v';
  if (lower.endsWith('.mkv')) return 'video/x-matroska';
  if (lower.endsWith('.3gp')) return 'video/3gpp';
  if (lower.endsWith('.3g2')) return 'video/3gpp2';
  return 'video/mp4';
}

export function guessImageMime(name: string): string {
  const lower = (name || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

/** Re-wrap File with a concrete MIME when the browser omits type (common on Windows). */
const QWERTZ_METADATA_TIMEOUT_MS = 12_000;

/** Read duration before Qwertz upload; times out so the UI cannot spin forever on bad codecs. */
export function validateQwertzVideoDuration(file: File, maxSeconds = 180): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const media = document.createElement('video');
    media.preload = 'metadata';
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      fn();
    };
    const timer = window.setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            'Could not read video duration in time. Try MP4 format, or continue with a shorter clip under 3 minutes.'
          )
        )
      );
    }, QWERTZ_METADATA_TIMEOUT_MS);
    media.onloadedmetadata = () => {
      const duration = Number(media.duration || 0);
      if (!duration || Number.isNaN(duration)) {
        finish(() => reject(new Error('Could not read video duration.')));
        return;
      }
      if (duration > maxSeconds) {
        finish(() => reject(new Error('Qwertz videos must be 3 minutes or less.')));
        return;
      }
      finish(() => resolve());
    };
    media.onerror = () => {
      finish(() => reject(new Error('Invalid video file.')));
    };
    media.src = url;
  });
}

export function normalizeUploadFile(file: File): File {
  const name = file.name || 'upload';
  if (file.type?.startsWith('video/') || file.type?.startsWith('image/')) return file;
  if (VIDEO_EXT.test(name)) {
    return new File([file], name, { type: guessVideoMime(name), lastModified: file.lastModified });
  }
  if (IMAGE_EXT.test(name)) {
    return new File([file], name, { type: guessImageMime(name), lastModified: file.lastModified });
  }
  return file;
}
