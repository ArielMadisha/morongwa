/**
 * Single chip/action-button pattern for QwertyMedia, QwertyTV, QwertyMusic and QwertyPodcasts.
 * QwertyTV's genre chips are the reference design; every other media surface imports this.
 */
export function mediaChipClass(active: boolean, extra = ''): string {
  return `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
    active
      ? 'border-sky-500 bg-sky-50 text-sky-700'
      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
  } ${extra}`.trim();
}

/** Row wrapper shared by every media chip strip (left-aligned, horizontally scrollable). */
export const MEDIA_CHIP_ROW_CLASS = 'flex items-center gap-2 overflow-x-auto no-scrollbar py-2';
