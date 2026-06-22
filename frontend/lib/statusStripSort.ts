import type { StatusItem } from '@/components/tv/StatusesStrip';

function statusStripLatestMs(row: StatusItem): number {
  const raw = row?.latestPost?.createdAt;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function statusStripRowKey(row: StatusItem): string {
  const uid = row.userId as { _id?: string } | string | undefined;
  const id =
    typeof uid === 'object' && uid && '_id' in uid
      ? String(uid._id ?? '')
      : String(uid ?? '');
  return String(row.statusKey || id || row.latestPost?._id || '');
}

/** Newest status left → older statuses shift right. */
export function sortStatusStripNewestFirst(rows: StatusItem[]): StatusItem[] {
  return [...rows].sort((a, b) => {
    const tb = statusStripLatestMs(b);
    const ta = statusStripLatestMs(a);
    if (tb !== ta) return tb - ta;
    return statusStripRowKey(b).localeCompare(statusStripRowKey(a));
  });
}
