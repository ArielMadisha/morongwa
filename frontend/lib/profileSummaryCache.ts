import { usersAPI } from '@/lib/api';

export type ProfileSummaryData = {
  user: Record<string, unknown>;
  followerCount: number;
  followingCount: number;
  postCount: number;
  musicCount: number;
  musicUploadCount: number;
};

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { data: ProfileSummaryData; ts: number }>();
const inflight = new Map<string, Promise<ProfileSummaryData | null>>();

export async function fetchProfileSummary(userId: string): Promise<ProfileSummaryData | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;

  const pending = inflight.get(userId);
  if (pending) return pending;

  const promise = usersAPI
    .getProfileStats(userId)
    .then((res) => {
      const body = res.data ?? {};
      const data: ProfileSummaryData = {
        user: (body.user ?? {}) as Record<string, unknown>,
        followerCount: Number(body.followerCount ?? 0),
        followingCount: Number(body.followingCount ?? 0),
        postCount: Number(body.postCount ?? 0),
        musicCount: Number(body.musicCount ?? 0),
        musicUploadCount: Number(body.musicUploadCount ?? 0),
      };
      cache.set(userId, { data, ts: Date.now() });
      return data;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(userId);
    });

  inflight.set(userId, promise);
  return promise;
}

export function formatSocialCount(n: number): string {
  const v = Math.max(0, Math.floor(n));
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(v);
}
