/**
 * Wall / QwertyTV status strip (Instagram-style rings).
 * Same 24h window for: recent posts, new products, and newly registered users.
 */
export const STATUS_STRIP_TTL_MS = 24 * 60 * 60 * 1000;

let cacheGeneration = 0;

/** Call after user registration so the next /api/tv/statuses fetch includes the new joiner. */
export function bumpStatusStripCache(): void {
  cacheGeneration += 1;
}

export function statusStripCacheKey(suffix = "v8"): string {
  return `statuses:${suffix}:g${cacheGeneration}`;
}

type StatusStripSortRow = {
  latestPost?: { createdAt?: string | Date; _id?: unknown } | null;
  statusKey?: string;
  userId?: string | { _id?: string };
};

function statusStripLatestMs(row: StatusStripSortRow): number {
  const raw = row?.latestPost?.createdAt;
  if (raw == null) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function statusStripRowKey(row: StatusStripSortRow): string {
  const uid = row.userId;
  const id =
    typeof uid === "object" && uid && "_id" in uid
      ? String((uid as { _id?: string })._id ?? "")
      : String(uid ?? "");
  return String(row.statusKey || id || row.latestPost?._id || "");
}

/** Newest status left → older statuses shift right (Instagram-style). */
export function sortStatusStripRowsNewestFirst<T extends StatusStripSortRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const tb = statusStripLatestMs(b);
    const ta = statusStripLatestMs(a);
    if (tb !== ta) return tb - ta;
    return statusStripRowKey(b).localeCompare(statusStripRowKey(a));
  });
}
