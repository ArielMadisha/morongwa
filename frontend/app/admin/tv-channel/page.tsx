'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  Play,
  Pause,
  SkipForward,
  Upload,
  Trash2,
  ChevronUp,
  ChevronDown,
  Tv,
  Clock,
  CalendarRange,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI, getImageUrlFull } from '@/lib/api';

function SeekControl({
  durationMs,
  positionMs,
  busy,
  onSeek,
}: {
  durationMs: number;
  positionMs: number;
  busy: boolean;
  onSeek: (ms: number) => void;
}) {
  const [sec, setSec] = useState('0');
  useEffect(() => {
    setSec(Math.floor(positionMs / 1000).toString());
  }, [positionMs]);
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Seek in current item (seconds from start)</label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          value={sec}
          onChange={(e) => setSec(e.target.value)}
          className="w-32 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const n = Number(sec);
            if (!Number.isFinite(n) || n < 0) return;
            onSeek(n * 1000);
          }}
          className="rounded-lg bg-slate-600 px-3 py-2 text-sm font-medium hover:bg-slate-500 disabled:opacity-50"
        >
          Apply seek
        </button>
        <span className="text-xs text-slate-500">
          Progress ~{Math.floor(positionMs / 1000)}s / {Math.floor(durationMs / 1000)}s
        </span>
      </div>
    </div>
  );
}

type Program = {
  _id: string;
  title: string;
  description?: string;
  videoUrl: string;
  posterUrl?: string;
  durationSeconds: number;
  genre?: string;
  sortOrder: number;
  scheduleMode?: 'queue' | 'fixed';
  scheduledStart?: string;
  scheduledEnd?: string;
  enabled?: boolean;
};

type NowPayload = {
  current: { _id: string; title?: string; videoUrl?: string; durationSeconds?: number } | null;
  isPaused: boolean;
  positionMs: number;
  durationMs: number;
  next: { _id: string; title?: string } | null;
  queue: { _id: string; title?: string }[];
  playoutSource?: 'queue' | 'fixed';
};

export default function AdminTvChannelPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [now, setNow] = useState<NowPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    title: '',
    genre: '',
    durationSeconds: '',
    scheduleFixed: false,
    scheduledStart: '',
    scheduledEnd: '',
  });

  const loadPrograms = useCallback(async () => {
    try {
      const res = await adminAPI.getTvChannelPrograms();
      const list = (res.data as { data?: Program[] })?.data ?? [];
      setPrograms(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Failed to load programmes');
      setPrograms([]);
    }
  }, []);

  const loadNow = useCallback(async () => {
    try {
      const res = await adminAPI.getTvChannelNowAdmin();
      setNow((res.data as { data?: NowPayload })?.data ?? null);
    } catch {
      setNow(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadPrograms(), loadNow()]);
    setLoading(false);
  }, [loadPrograms, loadNow]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => void loadNow(), 4000);
    return () => clearInterval(t);
  }, [loadNow]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error('Choose a video file');
      return;
    }
    if (form.scheduleFixed && !form.scheduledStart.trim()) {
      toast.error('Fixed wall-clock items need a scheduled start time');
      return;
    }
    setUploading(true);
    try {
      await adminAPI.uploadTvChannelVideo(file, {
        title: form.title.trim() || undefined,
        genre: form.genre.trim() || undefined,
        durationSeconds: form.durationSeconds.trim() ? Number(form.durationSeconds) : undefined,
        scheduleMode: form.scheduleFixed ? 'fixed' : 'queue',
        scheduledStart: form.scheduledStart || undefined,
        scheduledEnd: form.scheduledEnd || undefined,
      });
      toast.success(form.scheduleFixed ? 'Uploaded as fixed wall-clock slot' : 'Uploaded and added to queue');
      setFile(null);
      setForm({
        title: '',
        genre: '',
        durationSeconds: '',
        scheduleFixed: false,
        scheduledStart: '',
        scheduledEnd: '',
      });
      await refresh();
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const ctl = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    try {
      await fn();
      await loadNow();
      toast.success('Updated');
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  const moveProgram = async (id: string, dir: -1 | 1) => {
    const idx = programs.findIndex((p) => p._id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= programs.length) return;
    const next = [...programs];
    const tmp = next[idx];
    next[idx] = next[j];
    next[j] = tmp;
    const orderedIds = next.map((p) => p._id);
    setBusy('reorder');
    try {
      await adminAPI.reorderTvChannelPrograms(orderedIds);
      await loadPrograms();
      toast.success('Order updated');
    } catch {
      toast.error('Reorder failed');
    } finally {
      setBusy(null);
    }
  };

  const saveRow = async (p: Program, patch: Record<string, unknown>) => {
    setBusy(p._id);
    try {
      await adminAPI.patchTvChannelProgram(p._id, patch);
      await loadPrograms();
      toast.success('Saved');
    } catch {
      toast.error('Save failed');
    } finally {
      setBusy(null);
    }
  };

  const deleteRow = async (p: Program) => {
    if (!confirm(`Remove “${p.title}” from the channel?`)) return;
    setBusy(p._id);
    try {
      await adminAPI.deleteTvChannelProgram(p._id);
      await refresh();
      toast.success('Removed');
    } catch {
      toast.error('Delete failed');
    } finally {
      setBusy(null);
    }
  };

  const progressPct =
    now?.current && now.durationMs > 0 ? Math.min(100, (now.positionMs / now.durationMs) * 100) : 0;

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
        <header className="border-b border-white/10 bg-black/20 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-400">QwertyTV · Admin</p>
              <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold text-white">
                <Tv className="h-8 w-8 text-sky-400" aria-hidden />
                Linear channel (24/7)
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Upload long-form video, build the queue, mark fixed wall-clock slots (they preempt the queue during their
                window), and control playout. Public{' '}
                <Link href="/morongwa-tv" className="text-sky-300 hover:underline">
                  QwertyTV
                </Link>{' '}
                shows the strip +{' '}
                <Link href="/morongwa-tv/channel" className="text-sky-300 hover:underline">
                  full-screen channel
                </Link>
                . This is VOD synced to a server clock (not RTMP ingest).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refresh()}
                className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15"
              >
                Refresh
              </button>
              <Link
                href="/admin/live"
                className="inline-flex items-center gap-2 rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/20"
              >
                Live streaming hub
              </Link>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15"
              >
                <ArrowLeft className="h-4 w-4" /> Admin home
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white">Transport</h2>
            <p className="mt-1 text-sm text-slate-400">
              Play / pause / skip affect the shared channel clock. Viewers on{' '}
              <span className="font-mono text-sky-300">/morongwa-tv</span> poll roughly every 8 seconds.
            </p>
            {loading && !now ? (
              <div className="mt-6 flex justify-center py-8">
                <Loader2 className="h-10 w-10 animate-spin text-sky-400" />
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div>
                  <p className="text-sm font-medium text-slate-300">Now</p>
                  {now?.playoutSource === 'fixed' ? (
                    <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-amber-400">Wall-clock slot</p>
                  ) : null}
                  <p className="text-xl font-semibold text-white">{now?.current?.title || 'Standby (no current item)'}</p>
                  {now?.current?.videoUrl ? (
                    <p className="mt-1 truncate font-mono text-xs text-slate-500">{getImageUrlFull(now.current.videoUrl)}</p>
                  ) : null}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-black/40">
                  <div className="h-full bg-sky-500 transition-all" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void ctl('play', () => adminAPI.tvChannelPlay())}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {busy === 'play' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Play
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void ctl('pause', () => adminAPI.tvChannelPause())}
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                  >
                    {busy === 'pause' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                    Pause
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void ctl('skip', () => adminAPI.tvChannelSkip())}
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                  >
                    {busy === 'skip' ? <Loader2 className="h-4 w-4 animate-spin" /> : <SkipForward className="h-4 w-4" />}
                    Skip next
                  </button>
                </div>
                <SeekControl
                  durationMs={now?.durationMs ?? 0}
                  positionMs={now?.positionMs ?? 0}
                  busy={!!busy}
                  onSeek={(ms) => void ctl('seek', () => adminAPI.tvChannelSeek(ms))}
                />
                {now?.playoutSource === 'fixed' && !now.isPaused ? (
                  <p className="text-xs text-slate-500">
                    This item tracks real time while playing; seek only applies clearly when the channel is paused.
                  </p>
                ) : null}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Upload className="h-5 w-5 text-sky-400" />
              Upload programme
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              MP4 / WebM / MOV / MKV — duration is detected with ffprobe when available. Fixed slots need a start time and
              optionally an end (otherwise start + duration).
            </p>
            <form onSubmit={handleUpload} className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-400">Video file *</label>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="mt-1 w-full text-sm text-slate-200 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-600 file:px-3 file:py-2 file:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                  placeholder="Movie or episode name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400">Genre / category</label>
                <input
                  value={form.genre}
                  onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                  placeholder="e.g. Drama"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400">Duration override (seconds)</label>
                <input
                  value={form.durationSeconds}
                  onChange={(e) => setForm((f) => ({ ...f, durationSeconds: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                  placeholder="Leave blank for auto"
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.scheduleFixed}
                    onChange={(e) => setForm((f) => ({ ...f, scheduleFixed: e.target.checked }))}
                    className="rounded border-white/20"
                  />
                  Fixed wall-clock (preempts queue)
                </label>
              </div>
              <div>
                <label className="flex items-center gap-1 text-xs font-medium text-slate-400">
                  <CalendarRange className="h-3 w-3" /> Grid: scheduled start
                </label>
                <input
                  type="datetime-local"
                  value={form.scheduledStart}
                  onChange={(e) => setForm((f) => ({ ...f, scheduledStart: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="flex items-center gap-1 text-xs font-medium text-slate-400">
                  <CalendarRange className="h-3 w-3" /> Grid: scheduled end
                </label>
                <input
                  type="datetime-local"
                  value={form.scheduledEnd}
                  onChange={(e) => setForm((f) => ({ ...f, scheduledEnd: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={uploading || !file}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Add to queue
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl overflow-x-auto">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Clock className="h-5 w-5 text-sky-400" />
              Programming grid & queue
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Lower <code className="rounded bg-black/40 px-1">sortOrder</code> controls queue order only — fixed items
              do not rotate with the queue. “Go live” forces a row as current; a due fixed slot still preempts on the next
              poll unless paused.
            </p>
            {loading ? (
              <div className="mt-8 flex justify-center py-12">
                <Loader2 className="h-10 w-10 animate-spin text-sky-400" />
              </div>
            ) : programs.length === 0 ? (
              <p className="mt-6 text-sm text-slate-500">No programmes yet. Upload a video above.</p>
            ) : (
              <table className="mt-6 min-w-[720px] w-full text-left text-sm">
                <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">Title</th>
                    <th className="py-2 pr-2">Duration</th>
                    <th className="py-2 pr-2">Mode</th>
                    <th className="py-2 pr-2">Grid start</th>
                    <th className="py-2 pr-2">Grid end</th>
                    <th className="py-2 pr-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {programs.map((p, i) => (
                    <tr key={p._id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 pr-2 align-top">
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            aria-label="Move up"
                            disabled={i === 0 || !!busy}
                            onClick={() => void moveProgram(p._id, -1)}
                            className="rounded border border-white/10 p-0.5 hover:bg-white/10 disabled:opacity-30"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Move down"
                            disabled={i === programs.length - 1 || !!busy}
                            onClick={() => void moveProgram(p._id, 1)}
                            className="rounded border border-white/10 p-0.5 hover:bg-white/10 disabled:opacity-30"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 pr-2 align-top">
                        <input
                          defaultValue={p.title}
                          key={p._id + p.title}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== p.title) void saveRow(p, { title: v });
                          }}
                          className="w-full max-w-[200px] rounded border border-white/10 bg-black/30 px-2 py-1 text-white"
                        />
                        <p className="mt-1 truncate font-mono text-[10px] text-slate-500">{p.videoUrl}</p>
                      </td>
                      <td className="py-3 pr-2 align-top">
                        <input
                          type="number"
                          min={1}
                          defaultValue={p.durationSeconds}
                          className="w-24 rounded border border-white/10 bg-black/30 px-2 py-1 text-white"
                          onBlur={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isFinite(n) && n >= 1 && n !== p.durationSeconds) void saveRow(p, { durationSeconds: n });
                          }}
                        />
                      </td>
                      <td className="py-3 pr-2 align-top">
                        <select
                          key={`${p._id}-${p.scheduleMode ?? 'queue'}`}
                          defaultValue={p.scheduleMode === 'fixed' ? 'fixed' : 'queue'}
                          className="w-[120px] rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white"
                          onChange={(e) => {
                            const scheduleMode = e.target.value === 'fixed' ? 'fixed' : 'queue';
                            if (scheduleMode === 'fixed' && !p.scheduledStart) {
                              toast.error('Set grid start before switching to Fixed');
                              void loadPrograms();
                              return;
                            }
                            void saveRow(p, { scheduleMode });
                          }}
                        >
                          <option value="queue">Queue</option>
                          <option value="fixed">Fixed</option>
                        </select>
                      </td>
                      <td className="py-3 pr-2 align-top">
                        <input
                          type="datetime-local"
                          defaultValue={
                            p.scheduledStart ? new Date(p.scheduledStart).toISOString().slice(0, 16) : ''
                          }
                          className="w-[180px] rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white"
                          onBlur={(e) => {
                            const v = e.target.value;
                            const iso = v ? new Date(v).toISOString() : '';
                            const prev = p.scheduledStart ? new Date(p.scheduledStart).toISOString() : '';
                            if (iso !== prev) void saveRow(p, { scheduledStart: v || null });
                          }}
                        />
                      </td>
                      <td className="py-3 pr-2 align-top">
                        <input
                          type="datetime-local"
                          defaultValue={p.scheduledEnd ? new Date(p.scheduledEnd).toISOString().slice(0, 16) : ''}
                          className="w-[180px] rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white"
                          onBlur={(e) => {
                            const v = e.target.value;
                            const iso = v ? new Date(v).toISOString() : '';
                            const prev = p.scheduledEnd ? new Date(p.scheduledEnd).toISOString() : '';
                            if (iso !== prev) void saveRow(p, { scheduledEnd: v || null });
                          }}
                        />
                      </td>
                      <td className="py-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={!!busy}
                            onClick={() =>
                              void ctl('start', () => adminAPI.tvChannelStartProgram(p._id))
                            }
                            className="rounded-lg bg-violet-600 px-2 py-1 text-xs font-semibold hover:bg-violet-500 disabled:opacity-50"
                          >
                            Go live
                          </button>
                          <button
                            type="button"
                            disabled={!!busy}
                            onClick={() =>
                              void saveRow(p, { enabled: p.enabled === false })
                            }
                            className="rounded-lg border border-white/20 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-50"
                          >
                            {p.enabled === false ? 'Enable' : 'Disable'}
                          </button>
                          <button
                            type="button"
                            disabled={!!busy}
                            onClick={() => void deleteRow(p)}
                            className="rounded-lg border border-rose-500/50 p-1 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </main>
      </div>
    </ProtectedRoute>
  );
}
