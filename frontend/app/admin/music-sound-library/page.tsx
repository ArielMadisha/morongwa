'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI, getImageUrl, type SongRecord } from '@/lib/api';
import { ArrowLeft, Loader2, Music2, RefreshCw, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';

type StatusFilter = 'all' | 'none' | 'pending' | 'approved' | 'rejected';

export default function AdminMusicSoundLibraryPage() {
  const [status, setStatus] = useState<StatusFilter>('pending');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<SongRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [stats, setStats] = useState<{
    counts: { pending: number; approved: number; rejected: number; none: number };
    topByClips: Array<{ songId?: string; clips: number; views: number; song: SongRecord | null }>;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [patchingId, setPatchingId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await adminAPI.getMusicSoundLibraryStats();
      setStats(res.data?.data ?? null);
    } catch {
      toast.error('Failed to load stats');
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getMusicSoundLibraryCatalog({
        status: status === 'all' ? undefined : status,
        q: debouncedQ || undefined,
        page,
        limit: 40,
      });
      setRows(Array.isArray(res.data?.data) ? res.data.data : []);
      setHasMore(Boolean(res.data?.hasMore));
    } catch {
      toast.error('Failed to load catalog');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status, debouncedQ, page]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const patchSong = async (
    songId: string,
    body: {
      soundLibraryStatus?: 'none' | 'pending' | 'approved' | 'rejected';
      soundLibraryRejectedReason?: string;
    }
  ) => {
    setPatchingId(songId);
    try {
      await adminAPI.patchMusicSoundLibrarySong(songId, body);
      toast.success('Updated');
      await loadCatalog();
      await loadStats();
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Update failed');
    } finally {
      setPatchingId(null);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 text-slate-800">
        <header className="border-b border-white/60 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-violet-600">Qwertymates</p>
              <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold text-slate-900">
                <Music2 className="h-8 w-8 text-violet-600" aria-hidden />
                Music Sounds & monetization
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                TikTok-style <strong className="font-medium text-slate-800">Sounds</strong> catalog: approve singles for QwertyTV video posts,
                track clip usage, and point artists to the public payout policy.
              </p>
              <p className="mt-2 text-sm">
                <Link
                  href="/policies/qwerty-music-sound-library-artist-payouts"
                  className="font-semibold text-violet-700 underline-offset-2 hover:underline"
                >
                  Artist policy: Sounds & payouts
                </Link>{' '}
                ·{' '}
                <Link href="/admin/music" className="font-semibold text-violet-700 underline-offset-2 hover:underline">
                  QwertyMusic uploads
                </Link>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void loadCatalog();
                  void loadStats();
                }}
                className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-900 shadow-sm hover:shadow-md"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md"
              >
                <ArrowLeft className="h-4 w-4" /> Admin home
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
          <section className="rounded-2xl border border-slate-100 bg-white/95 p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-violet-600" />
              <h2 className="text-lg font-semibold text-slate-900">Overview</h2>
              {statsLoading && <Loader2 className="h-4 w-4 animate-spin text-violet-500" />}
            </div>
            {stats && (
              <div className="grid gap-3 sm:grid-cols-4">
                {(['pending', 'approved', 'rejected', 'none'] as const).map((k) => (
                  <div key={k} className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{k}</p>
                    <p className="text-2xl font-semibold text-slate-900">{stats.counts[k]}</p>
                  </div>
                ))}
              </div>
            )}
            {stats?.topByClips?.length ? (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-800">Top tracks by video clips (usage rows)</h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-4 font-medium">Track</th>
                        <th className="py-2 pr-4 font-medium">Clips</th>
                        <th className="py-2 font-medium">Views (sum)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.topByClips.map((row, idx) => (
                        <tr key={row.songId ? `${row.songId}-${idx}` : `row-${idx}`} className="border-b border-slate-100">
                          <td className="py-2 pr-4">
                            {row.song ? `${row.song.title} — ${row.song.artist}` : row.songId || '—'}
                          </td>
                          <td className="py-2 pr-4 tabular-nums">{row.clips}</td>
                          <td className="py-2 tabular-nums">{row.views}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white/95 p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Catalog review</h2>
                <p className="mt-1 text-sm text-slate-600">Filter by sound-library status and search title or artist.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={status}
                  onChange={(e) => {
                    setPage(1);
                    setStatus(e.target.value as StatusFilter);
                  }}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="none">None</option>
                </select>
                <input
                  type="search"
                  placeholder="Search…"
                  value={q}
                  onChange={(e) => {
                    setPage(1);
                    setQ(e.target.value);
                  }}
                  className="min-w-[200px] rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
              </div>
            ) : rows.length === 0 ? (
              <p className="py-12 text-center text-slate-500">No songs match this filter.</p>
            ) : (
              <div className="mt-6 space-y-4">
                {rows.map((s) => (
                  <div
                    key={s._id}
                    className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:items-center"
                  >
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-200">
                      {s.artworkUrl ? (
                        <img src={getImageUrl(s.artworkUrl)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Music2 className="h-8 w-8 text-slate-400" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 truncate">
                        {s.title} <span className="font-normal text-slate-600">— {s.artist}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {(s.userId as { name?: string })?.name ? `Uploader: ${(s.userId as { name?: string }).name}` : ''}{' '}
                        · Type: {s.type}
                        {s.soundLibraryStatus ? ` · Status: ${s.soundLibraryStatus}` : ''}
                      </p>
                      {s.soundLibraryRejectedReason && (
                        <p className="mt-1 text-xs text-rose-700">Reason: {s.soundLibraryRejectedReason}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={patchingId === s._id || s.soundLibraryStatus === 'approved'}
                        onClick={() => patchSong(s._id, { soundLibraryStatus: 'approved' })}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={patchingId === s._id}
                        onClick={() => {
                          const reason = window.prompt('Rejection reason (shown to artist summary):', 'Does not meet Sounds guidelines');
                          if (reason === null) return;
                          patchSong(s._id, { soundLibraryStatus: 'rejected', soundLibraryRejectedReason: reason || 'Not approved' });
                        }}
                        className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={patchingId === s._id}
                        onClick={() => patchSong(s._id, { soundLibraryStatus: 'none' })}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex justify-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Previous
              </button>
              <span className="flex items-center px-2 text-sm text-slate-600">Page {page}</span>
              <button
                type="button"
                disabled={!hasMore || loading}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </section>
        </main>
      </div>
    </ProtectedRoute>
  );
}
