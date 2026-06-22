'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import { ArrowLeft, Loader2, Megaphone, Send, Users } from 'lucide-react';
import toast from 'react-hot-toast';

type AreaOption = { type: string; value: string; label: string; userCount: number };

type BroadcastRow = {
  _id: string;
  message: string;
  subject?: string;
  scope: string;
  areaLabel?: string;
  recipientCount: number;
  deliveredCount: number;
  createdAt: string;
  sentBy?: { name?: string; username?: string; email?: string };
};

export default function AdminBroadcastPage() {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [allUserCount, setAllUserCount] = useState(0);
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [history, setHistory] = useState<BroadcastRow[]>([]);

  const [audienceMode, setAudienceMode] = useState<'all' | 'area'>('all');
  const [areaKey, setAreaKey] = useState('');
  const [subject, setSubject] = useState('Message from Qwertymates');
  const [message, setMessage] = useState('');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const selectedArea = useMemo(() => {
    if (!areaKey) return null;
    const [type, value] = areaKey.split('::');
    return areas.find((a) => a.type === type && a.value === value) || null;
  }, [areaKey, areas]);

  const recipientCount = audienceMode === 'all' ? allUserCount : selectedArea?.userCount ?? 0;

  useEffect(() => {
    void loadInitial();
  }, []);

  useEffect(() => {
    void refreshPreview();
  }, [audienceMode, areaKey, allUserCount, areas]);

  const loadInitial = async () => {
    setLoading(true);
    try {
      const [areasRes, historyRes] = await Promise.all([
        adminAPI.getBroadcastAreas(),
        adminAPI.getBroadcastHistory({ page: 1, limit: 10 }),
      ]);
      const areaData = areasRes.data?.data;
      setAllUserCount(areaData?.allUserCount ?? 0);
      const list = Array.isArray(areaData?.areas) ? areaData.areas : [];
      setAreas(list);
      if (list.length > 0) {
        setAreaKey(`${list[0]!.type}::${list[0]!.value}`);
      }
      setHistory(Array.isArray(historyRes.data?.data) ? (historyRes.data.data as BroadcastRow[]) : []);
    } catch {
      toast.error('Failed to load broadcast options');
    } finally {
      setLoading(false);
    }
  };

  const buildAudienceBody = () => {
    if (audienceMode === 'all') return { scope: 'all' as const };
    if (!selectedArea) return null;
    return {
      scope: 'area' as const,
      areaType: selectedArea.type,
      areaValue: selectedArea.value,
    };
  };

  const refreshPreview = async () => {
    const body = buildAudienceBody();
    if (!body) {
      setPreviewCount(0);
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await adminAPI.previewBroadcast(body);
      setPreviewCount(res.data?.data?.recipientCount ?? recipientCount);
    } catch {
      setPreviewCount(recipientCount);
    } finally {
      setPreviewLoading(false);
    }
  };

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = buildAudienceBody();
    const trimmed = message.trim();
    if (!body) {
      toast.error('Choose an area');
      return;
    }
    if (trimmed.length < 2) {
      toast.error('Enter a message');
      return;
    }
    const count = previewCount ?? recipientCount;
    if (count === 0) {
      toast.error('No users match this audience');
      return;
    }
    const needsConfirm = count > 100;
    if (needsConfirm) {
      const ok = window.confirm(`Send this message to ${count} users? This cannot be undone.`);
      if (!ok) return;
    }

    setSending(true);
    try {
      const res = await adminAPI.sendBroadcast({
        ...body,
        subject: subject.trim() || undefined,
        message: trimmed,
        confirm: needsConfirm,
      });
      toast.success(res.data?.message || 'Message sent');
      setMessage('');
      const historyRes = await adminAPI.getBroadcastHistory({ page: 1, limit: 10 });
      setHistory(Array.isArray(historyRes.data?.data) ? (historyRes.data.data as BroadcastRow[]) : []);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to send message';
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Qwertymates</p>
              <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold text-slate-900">
                <Megaphone className="h-8 w-8 text-sky-600" aria-hidden />
                Message users
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Send in-app notifications to all users or filter by country / runner service area.
              </p>
            </div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md"
            >
              <ArrowLeft className="h-4 w-4" /> Back to admin
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-500">
              <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-5">
              <form onSubmit={onSend} className="lg:col-span-3 space-y-6">
                <section className="rounded-2xl border border-sky-100 bg-white/90 p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900">Audience</h2>
                  <p className="mt-1 text-sm text-slate-600">Choose who should receive this message.</p>

                  <div className="mt-4 space-y-3">
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 has-[:checked]:border-sky-400 has-[:checked]:bg-sky-50/50">
                      <input
                        type="radio"
                        name="audience"
                        className="mt-1"
                        checked={audienceMode === 'all'}
                        onChange={() => setAudienceMode('all')}
                      />
                      <span>
                        <span className="font-medium text-slate-900">All users</span>
                        <span className="mt-0.5 block text-sm text-slate-600">
                          Active members (excludes admin accounts) — {allUserCount.toLocaleString()} users
                        </span>
                      </span>
                    </label>

                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 has-[:checked]:border-sky-400 has-[:checked]:bg-sky-50/50">
                      <input
                        type="radio"
                        name="audience"
                        className="mt-1"
                        checked={audienceMode === 'area'}
                        onChange={() => setAudienceMode('area')}
                      />
                      <span className="w-full">
                        <span className="font-medium text-slate-900">Users by area</span>
                        <span className="mt-0.5 block text-sm text-slate-600">
                          Country, runner service country, or runner city
                        </span>
                        {audienceMode === 'area' && (
                          <select
                            className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                            value={areaKey}
                            onChange={(e) => setAreaKey(e.target.value)}
                          >
                            {areas.length === 0 ? (
                              <option value="">No area data yet</option>
                            ) : (
                              areas.map((a) => (
                                <option key={`${a.type}::${a.value}`} value={`${a.type}::${a.value}`}>
                                  {a.label} ({a.userCount.toLocaleString()})
                                </option>
                              ))
                            )}
                          </select>
                        )}
                      </span>
                    </label>
                  </div>

                  <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <Users className="h-4 w-4 shrink-0 text-sky-600" />
                    {previewLoading ? (
                      <span>Counting recipients…</span>
                    ) : (
                      <span>
                        <strong>{(previewCount ?? recipientCount).toLocaleString()}</strong> user(s) will receive
                        this message
                      </span>
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-sky-100 bg-white/90 p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900">Message</h2>
                  <div className="mt-4 space-y-4">
                    <div>
                      <label htmlFor="broadcast-subject" className="block text-xs font-medium text-slate-600">
                        Subject (optional)
                      </label>
                      <input
                        id="broadcast-subject"
                        type="text"
                        maxLength={200}
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="broadcast-message" className="block text-xs font-medium text-slate-600">
                        Message
                      </label>
                      <textarea
                        id="broadcast-message"
                        rows={8}
                        maxLength={4000}
                        required
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Write your announcement…"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                      <p className="mt-1 text-right text-xs text-slate-500">{message.length}/4000</p>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={sending || (previewCount ?? recipientCount) === 0}
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send message
                  </button>
                </section>
              </form>

              <aside className="lg:col-span-2">
                <section className="rounded-2xl border border-sky-100 bg-white/90 p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900">Recent broadcasts</h2>
                  {history.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">No messages sent yet.</p>
                  ) : (
                    <ul className="mt-4 space-y-4">
                      {history.map((row) => (
                        <li key={row._id} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                          <p className="text-xs text-slate-500">
                            {new Date(row.createdAt).toLocaleString()} · {row.deliveredCount}/{row.recipientCount}{' '}
                            delivered
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-800">
                            {row.areaLabel || (row.scope === 'all' ? 'All users' : 'Area')}
                          </p>
                          <p className="mt-1 line-clamp-3 text-sm text-slate-600 whitespace-pre-wrap">{row.message}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </aside>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
