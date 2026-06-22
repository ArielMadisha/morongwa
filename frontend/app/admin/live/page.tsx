'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Loader2, Radio, Settings2, Power, Activity, Cloud, Film } from 'lucide-react';
import toast from 'react-hot-toast';

type Broadcaster = {
  _id: string;
  name?: string;
  email?: string;
  username?: string;
  phone?: string;
  isLive?: boolean;
  liveStreamName?: string;
  liveStartedAt?: string;
  lastLiveEndedAt?: string;
  updatedAt?: string;
};

type LivePlatform = {
  playbackConfigured: boolean;
  publishConfigured: boolean;
  hlsPublicHostHint: string | null;
  rtmpPublishHint: string | null;
  envKeys: string[];
  notes: { wallGoLive: string; rtmpSession: string };
};

type MetricsSummary = {
  hours: number;
  since: string;
  byType: Array<{ _id: string; count: number }>;
  recentErrors: Array<{
    streamKey: string;
    eventType: string;
    message?: string;
    sessionId?: string;
    createdAt: string;
    broadcasterUserId: string;
  }>;
  viewersApproxByStream: Array<{ _id: string; viewersApprox: number }>;
};

type ProbePayload = {
  hlsBaseConfigured: boolean;
  checkedAt: string;
  streams: Array<{
    userId: string;
    name?: string;
    username?: string;
    streamKey: string;
    hlsUrl: string;
    probe: { ok: boolean; status: number; ms: number; method: string };
  }>;
};

export default function AdminLiveSettingsPage() {
  const [rows, setRows] = useState<Broadcaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<LivePlatform | null>(null);
  const [platformLoading, setPlatformLoading] = useState(true);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [metricHours, setMetricHours] = useState(24);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [probe, setProbe] = useState<ProbePayload | null>(null);
  const [probeLoading, setProbeLoading] = useState(false);

  const loadBroadcasters = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getLiveBroadcasters();
      const data = res.data;
      setRows(Array.isArray(data?.data) ? (data.data as Broadcaster[]) : []);
    } catch {
      toast.error('Failed to load live broadcasters');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const loadPlatform = async () => {
    setPlatformLoading(true);
    try {
      const res = await adminAPI.getLivePlatformSettings();
      setPlatform((res.data?.data as LivePlatform) ?? null);
    } catch {
      toast.error('Failed to load live platform settings');
      setPlatform(null);
    } finally {
      setPlatformLoading(false);
    }
  };

  useEffect(() => {
    void loadBroadcasters();
    void loadPlatform();
  }, []);

  const loadMetrics = async () => {
    setMetricsLoading(true);
    try {
      const res = await adminAPI.getLiveMetricsSummary({ hours: metricHours });
      setMetrics((res.data?.data as MetricsSummary) ?? null);
    } catch {
      toast.error('Failed to load live metrics');
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  };

  const runHlsProbe = async () => {
    setProbeLoading(true);
    try {
      const res = await adminAPI.postLiveHlsProbe();
      setProbe((res.data?.data as ProbePayload) ?? null);
      toast.success('HLS probe complete');
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'HLS probe failed');
      setProbe(null);
    } finally {
      setProbeLoading(false);
    }
  };

  const forceEnd = async (userId: string, label: string) => {
    if (!confirm(`Force end live for ${label}? This clears isLive and any stream key on the account.`)) return;
    setEndingId(userId);
    try {
      await adminAPI.forceEndLiveBroadcast(userId);
      toast.success('Live cleared');
      await loadBroadcasters();
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Could not force end live');
    } finally {
      setEndingId(null);
    }
  };

  const badge = (ok: boolean, label: string) => (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
      }`}
    >
      {ok ? `${label}: ready` : `${label}: not configured`}
    </span>
  );

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Qwertymates</p>
              <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold text-slate-900">
                <Radio className="h-8 w-8 text-rose-600" aria-hidden />
                Live streaming
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                Manage <strong className="font-medium text-slate-800">Go live</strong> visibility and RTMP/HLS readiness.
                Matches the Wall <strong>Create post</strong> flow (badge toggle) and{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">POST /api/live/start</code> for full OBS ingest.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/tv-channel"
                className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 shadow-sm hover:shadow-md"
              >
                <Film className="h-4 w-4" />
                QwertyTV linear channel
              </Link>
              <Link
                href="#live-scalability"
                className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 shadow-sm hover:shadow-md"
              >
                <Activity className="h-4 w-4" />
                Scalability & monitoring
              </Link>
              <button
                type="button"
                onClick={() => {
                  void loadBroadcasters();
                  void loadPlatform();
                }}
                className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md"
              >
                Refresh all
              </button>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md"
              >
                <ArrowLeft className="h-4 w-4" /> Back to admin
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
          <section className="rounded-2xl border border-slate-100 bg-white/95 p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <Settings2 className="mt-0.5 h-6 w-6 shrink-0 text-sky-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-slate-900">Platform live settings</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Values come from API server environment variables. Configure them on the host that runs{' '}
                  <code className="rounded bg-slate-50 px-1 text-xs">morongwa-api</code>, then redeploy/restart if needed.
                </p>

                {platformLoading ? (
                  <div className="mt-6 flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                  </div>
                ) : platform ? (
                  <div className="mt-6 space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {badge(platform.playbackConfigured, 'HLS playback')}
                      {badge(platform.publishConfigured, 'RTMP publish')}
                    </div>
                    <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">HLS host (hint)</dt>
                        <dd className="font-mono text-slate-900">{platform.hlsPublicHostHint || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">RTMP OBS server (hint)</dt>
                        <dd className="font-mono text-slate-900">{platform.rtmpPublishHint || '—'}</dd>
                      </div>
                    </dl>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Related env keys</p>
                      <ul className="mt-2 list-inside list-disc text-sm text-slate-700">
                        {platform.envKeys.map((k) => (
                          <li key={k}>
                            <code className="rounded bg-white px-1 py-0.5 text-xs">{k}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
                      <p>
                        <strong className="font-semibold">Wall “Go live”:</strong> {platform.notes.wallGoLive}
                      </p>
                      <p className="mt-2">
                        <strong className="font-semibold">OBS / RTMP:</strong> {platform.notes.rtmpSession}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">Could not load platform status.</p>
                )}
              </div>
            </div>
          </section>

          <section id="live-scalability" className="scroll-mt-24 rounded-2xl border border-emerald-100 bg-white/95 p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3">
                <Cloud className="mt-0.5 h-7 w-7 shrink-0 text-emerald-600" aria-hidden />
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Scalability & monitoring</h2>
                  <p className="mt-1 max-w-3xl text-sm text-slate-600">
                    Viewer devices report buffering and fatal HLS errors to the API (only while the stream is marked live).
                    Use a <strong>CDN</strong> in front of your HLS origin for global scale and cache hit ratio — same public base as{' '}
                    <code className="rounded bg-slate-100 px-1 text-xs">LIVESTREAM_HLS_PUBLIC_BASE</code>. Repo reference:{' '}
                    <code className="rounded bg-slate-100 px-1 text-xs">DOCS/LIVESTREAM_MEDIA_SERVER.md</code>.
                  </p>
                  <ul className="mt-3 list-inside list-disc text-sm text-slate-700 space-y-1">
                    <li>Put HLS behind Cloudflare / CloudFront / Fastly — enable HTTP/2 or HTTP/3 to edge.</li>
                    <li>Short playlist targets + reasonable segment length reduce live latency (trade-off vs rebuffer risk).</li>
                    <li>Separate <strong>RTMP ingest</strong> from <strong>HLS read</strong> so encoder load does not starve viewers.</li>
                    <li>
                      Admin <strong>VOD linear channel</strong> (no RTMP) lives under{' '}
                      <Link href="/admin/tv-channel" className="font-medium text-sky-700 hover:underline">
                        QwertyTV linear channel
                      </Link>
                      .
                    </li>
                  </ul>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <select
                  value={metricHours}
                  onChange={(e) => setMetricHours(Number(e.target.value))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value={6}>Last 6h</option>
                  <option value={24}>Last 24h</option>
                  <option value={72}>Last 72h</option>
                  <option value={168}>Last 7d</option>
                </select>
                <button
                  type="button"
                  onClick={() => void loadMetrics()}
                  disabled={metricsLoading}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {metricsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                  Load metrics
                </button>
                <button
                  type="button"
                  onClick={() => void runHlsProbe()}
                  disabled={probeLoading}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                >
                  {probeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Probe HLS (live rows)
                </button>
              </div>
            </div>

            {metrics && (
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Events by type ({metrics.hours}h)</h3>
                  <p className="text-xs text-slate-500">Since {new Date(metrics.since).toLocaleString()}</p>
                  <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/50">
                    {metrics.byType.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-slate-500">No telemetry yet — open a watch page while live.</li>
                    ) : (
                      metrics.byType.map((r) => (
                        <li key={r._id} className="flex justify-between px-3 py-2 text-sm">
                          <span className="font-mono text-slate-700">{r._id}</span>
                          <span className="font-semibold text-slate-900">{r.count}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Approx. viewers (15m)</h3>
                  <p className="text-xs text-slate-500">Distinct heartbeat sessions per stream key.</p>
                  <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/50">
                    {metrics.viewersApproxByStream.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-slate-500">No heartbeats in window.</li>
                    ) : (
                      metrics.viewersApproxByStream.map((r) => (
                        <li key={r._id} className="flex justify-between px-3 py-2 text-sm">
                          <span className="font-mono text-xs text-slate-600 truncate max-w-[200px]" title={r._id}>
                            {r._id}
                          </span>
                          <span className="font-semibold text-slate-900">{r.viewersApprox}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            )}

            {metrics && metrics.recentErrors.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-800">Recent buffering / errors</h3>
                <div className="mt-2 overflow-x-auto rounded-xl border border-rose-100 bg-rose-50/40">
                  <table className="min-w-full text-left text-xs">
                    <thead className="border-b border-rose-100 bg-rose-50/80">
                      <tr>
                        <th className="px-3 py-2 font-semibold text-rose-900">Time</th>
                        <th className="px-3 py-2 font-semibold text-rose-900">Type</th>
                        <th className="px-3 py-2 font-semibold text-rose-900">Stream</th>
                        <th className="px-3 py-2 font-semibold text-rose-900">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.recentErrors.map((e, i) => (
                        <tr key={`${e.createdAt}-${i}`} className="border-b border-rose-50/80">
                          <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                            {new Date(e.createdAt).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-800">{e.eventType}</td>
                          <td className="px-3 py-2 font-mono text-slate-600 truncate max-w-[120px]">{e.streamKey}</td>
                          <td className="px-3 py-2 text-slate-700">{e.message || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {probe && (
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <h3 className="text-sm font-semibold text-slate-800">HLS edge probe</h3>
                <p className="text-xs text-slate-500">Checked {new Date(probe.checkedAt).toLocaleString()}</p>
                {probe.streams.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600">No live rows with stream keys to probe.</p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {probe.streams.map((s) => (
                      <li key={s.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 border border-slate-100">
                        <span className="font-medium text-slate-800">{s.name || s.username || s.userId}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            s.probe.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {s.probe.ok ? 'OK' : 'FAIL'} {s.probe.status ? `HTTP ${s.probe.status}` : ''} · {s.probe.ms}ms ·{' '}
                          {s.probe.method}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Currently marked live</h2>
            <p className="mb-4 text-sm text-slate-600">
              Rows where <code className="rounded bg-slate-100 px-1 text-xs">isLive</code> is true. Use{' '}
              <strong className="font-medium text-slate-800">Force end</strong> if someone is stuck live or broadcasting inappropriately.
            </p>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-12 text-center text-slate-600">
                No accounts are currently marked live.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/90 shadow-sm">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">User</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Stream</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Contact</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((u) => (
                      <tr key={u._id} className="border-b border-slate-50 hover:bg-sky-50/40">
                        <td className="px-4 py-3 align-top">
                          <p className="font-medium text-slate-900">{u.name || u.username || u.email}</p>
                          {u.username ? (
                            <p className="text-xs text-slate-500">
                              @{u.username} · <span className="font-mono">{u._id}</span>
                            </p>
                          ) : (
                            <p className="text-xs font-mono text-slate-500">{u._id}</p>
                          )}
                          {u.liveStartedAt && (
                            <p className="mt-1 text-xs text-slate-500">
                              Session started: {new Date(u.liveStartedAt).toLocaleString()}
                            </p>
                          )}
                          {!u.liveStartedAt && u.updatedAt && (
                            <p className="mt-1 text-xs text-slate-500">
                              Updated: {new Date(u.updatedAt).toLocaleString()}
                            </p>
                          )}
                          {u.lastLiveEndedAt && (
                            <p className="text-xs text-slate-400">
                              Last ended: {new Date(u.lastLiveEndedAt).toLocaleString()}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top font-mono text-xs text-slate-700 break-all max-w-[200px]">
                          {u.liveStreamName || '—'}
                        </td>
                        <td className="px-4 py-3 align-top text-slate-600">
                          <span className="block">{u.email || '—'}</span>
                          <span className="text-xs">{u.phone || ''}</span>
                        </td>
                        <td className="px-4 py-3 align-top space-y-2">
                          <Link
                            href={`/morongwa-tv/live/watch/${u._id}`}
                            className="block text-sky-700 underline-offset-2 hover:underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Watch page
                          </Link>
                          <button
                            type="button"
                            disabled={endingId === u._id}
                            onClick={() =>
                              void forceEnd(u._id, u.name || u.username || u.email || u._id)
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                          >
                            {endingId === u._id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Power className="h-3 w-3" />
                            )}
                            Force end live
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
    </ProtectedRoute>
  );
}
