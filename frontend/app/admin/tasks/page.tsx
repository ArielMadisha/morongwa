'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI, getImageUrlFull } from '@/lib/api';
import { Task } from '@/lib/types';
import Link from 'next/link';
import {
  Package,
  ArrowLeft,
  DollarSign,
  Calendar,
  Loader2,
  Eye,
  Megaphone,
  Send,
  Bell,
  Camera,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  AdminLocationFollowupLinks,
  AdminMessageFollowupLinks,
  AdminTaskMapLinks,
} from '@/components/admin/AdminDocumentFollowup';

const ERRAND_FILTER_LABELS: Record<'collect_send' | 'shop_send' | 'transport' | 'general', string> = {
  collect_send: 'Collect & Send',
  shop_send: 'Shop & Send',
  transport: 'Transport large items',
  general: 'General errand',
};

function isWaLocalErrandTask(task: Task): boolean {
  const meta = (task.workflowMeta || {}) as Record<string, unknown>;
  if (meta.errandFlow === 'local') return true;
  if (task.taskType === 'general' && meta.createdVia === 'whatsapp') return true;
  if (/^local errand/i.test(String(task.title || '').trim())) return true;
  return false;
}

function errandTypeLabel(task: Task): string {
  if (isWaLocalErrandTask(task)) return 'Local errand (WhatsApp)';
  const taskType = task.taskType;
  const m: Record<string, string> = {
    collect_send: 'Collect & Send',
    cross_border_collection: 'Collect & Send',
    shop_send: 'Shop & Send',
    shop_and_send: 'Shop & Send',
    transport: 'Transport large items',
    large_transport: 'Transport large items',
    general: 'General errand',
  };
  return m[String(taskType || '')] || (taskType ? String(taskType) : 'Errand');
}

function workflowSummaryLine(meta: Record<string, unknown> | undefined): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const parts: string[] = [];
  const originCountry = meta.originCountry as string | undefined;
  const collectionCity = meta.collectionCity as string | undefined;
  const dm = (meta.deliveryMethod || meta.deliveryType) as string | undefined;
  const shopName = meta.shopName as string | undefined;
  const destination = meta.destination as string | undefined;
  const itemType = meta.itemType as string | undefined;
  const vehicleType = meta.vehicleType as string | undefined;
  if (originCountry) parts.push(`Origin: ${originCountry}`);
  if (collectionCity) parts.push(`City: ${collectionCity}`);
  if (shopName) parts.push(`Shop: ${shopName}`);
  if (destination) parts.push(`Send to: ${destination}`);
  if (dm) parts.push(`Delivery: ${dm}`);
  if (itemType) parts.push(`Item: ${itemType}`);
  if (vehicleType) parts.push(`Vehicle: ${vehicleType}`);
  return parts.length ? parts.join(' · ') : null;
}

/** WhatsApp Local Errand pickup/delivery lines + cross-flow workflow hints for support. */
function errandsAdminSummary(task: Task): string | null {
  const meta = (task.workflowMeta || {}) as Record<string, unknown>;
  const wf = workflowSummaryLine(meta);
  const bits: string[] = [];
  if (meta.createdVia === 'whatsapp') bits.push('Channel: WhatsApp');
  if (meta.quoteStatus === 'pending_admin') bits.push('Quote: pending admin review');
  if (meta.errandFlow === 'local') bits.push('Menu: Local errand (option 4)');
  if (isWaLocalErrandTask(task)) {
    const pu =
      task.pickupLocation && typeof task.pickupLocation === 'object'
        ? String((task.pickupLocation as { address?: string }).address || '').trim()
        : '';
    const de =
      task.deliveryLocation && typeof task.deliveryLocation === 'object'
        ? String((task.deliveryLocation as { address?: string }).address || '').trim()
        : '';
    if (pu && pu.toLowerCase() !== 'not provided') bits.push(`Pickup: ${pu}`);
    if (de && de.toLowerCase() !== 'not provided') bits.push(`Delivery: ${de}`);
  }
  const head = bits.filter(Boolean).join(' · ');
  if (head && wf) return `${head}\n${wf}`;
  if (head) return head;
  return wf;
}

function AdminTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [commissionRate, setCommissionRate] = useState<number>(0.15);
  const [broadcastingId, setBroadcastingId] = useState<string | null>(null);
  const [runnerPickTaskId, setRunnerPickTaskId] = useState<string | null>(null);
  const [runnerOptions, setRunnerOptions] = useState<Array<{ _id: string; name?: string; email?: string }>>([]);
  const [contactRunnerId, setContactRunnerId] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSending, setContactSending] = useState(false);
  const [quoteDrafts, setQuoteDrafts] = useState<Record<string, { amount: string; notes: string }>>({});
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [errandFilter, setErrandFilter] = useState<
    'all' | 'pending_quote' | 'wa_local' | 'collect_send' | 'shop_send' | 'transport' | 'general'
  >('all');

  useEffect(() => {
    fetchTasks();
  }, [errandFilter]);

  useEffect(() => {
    let cancelled = false;
    adminAPI
      .getUsers({ role: 'runner', limit: 80, active: 'true' })
      .then((res) => {
        if (cancelled) return;
        const list = res.data?.users ?? [];
        setRunnerOptions(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setRunnerOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { limit: 100 };
      if (errandFilter === 'pending_quote') params.pendingQuote = 1;
      else if (errandFilter === 'wa_local') params.waLocal = 1;
      else if (errandFilter !== 'all') params.taskType = errandFilter;
      const response = await adminAPI.getTasks(params);
      const list = response.data?.tasks ?? response.data;
      setTasks(Array.isArray(list) ? list : []);
      if (response.data?.commissionRate !== undefined) {
        setCommissionRate(response.data.commissionRate);
      }
    } catch (error) {
      toast.error('Failed to load tasks');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  const broadcastRunners = async (taskId: string) => {
    setBroadcastingId(taskId);
    try {
      await adminAPI.broadcastTaskRunners(taskId);
      toast.success('Task broadcast to runners');
      await fetchTasks();
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.response?.data?.error || 'Broadcast failed');
    } finally {
      setBroadcastingId(null);
    }
  };

  const sendContactRunner = async (taskId: string) => {
    const rid = contactRunnerId.trim();
    if (!rid) {
      toast.error('Choose a runner');
      return;
    }
    setContactSending(true);
    try {
      await adminAPI.contactTaskRunner(taskId, {
        runnerUserId: rid,
        message: contactMessage.trim() || undefined,
      });
      toast.success('Runner notified');
      setRunnerPickTaskId(null);
      setContactRunnerId('');
      setContactMessage('');
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.response?.data?.error || 'Failed to notify runner');
    } finally {
      setContactSending(false);
    }
  };

  const publishQuote = async (taskId: string) => {
    const draft = quoteDrafts[taskId] || { amount: '', notes: '' };
    const n = parseFloat(String(draft.amount || '').replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Enter a valid quote amount (ZAR)');
      return;
    }
    setPublishingId(taskId);
    try {
      await adminAPI.publishTaskQuote(taskId, {
        clientTotalZar: n,
        notes: draft.notes?.trim() || undefined,
      });
      toast.success('Quote published — client notified');
      setQuoteDrafts((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      await fetchTasks();
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.response?.data?.error || 'Failed to publish quote');
    } finally {
      setPublishingId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending_quote':
        return 'bg-amber-100 text-amber-900';
      case 'posted':
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'accepted':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-purple-100 text-purple-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const taskList = Array.isArray(tasks) ? tasks : [];
  const filteredTasks = filter === 'all' ? taskList : taskList.filter((t) => t.status === filter);

  const clientOf = (task: Task) => task.client as Task['client'] | undefined;
  const runnerOf = (task: Task) => task.runner;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="rounded-full border border-slate-200 bg-white/80 p-2 shadow-sm transition hover:shadow-md"
            >
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </Link>
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-sky-600">Admin</p>
              <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                <Package className="h-4 w-4 text-sky-500" />
                <span>Task Management</span>
              </div>
              <h1 className="mt-1 text-3xl font-semibold text-slate-900">All Platform Tasks</h1>
              <p className="mt-1 text-sm text-slate-600 max-w-2xl">
                Matches client dashboard errand types and the WhatsApp Errands menu (including{' '}
                <strong>Local errand</strong>, option 3). Use <em>WA Local errands</em> to see only WhatsApp-sourced local
                jobs. Message and Location links support dispute resolution without leaving this page.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-wrap gap-2">
          <span className="w-full text-xs font-semibold uppercase tracking-wide text-slate-500 sm:w-auto sm:mr-2 sm:self-center">
            Errand type
          </span>
          {(['all', 'pending_quote', 'wa_local', 'collect_send', 'shop_send', 'transport', 'general'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setErrandFilter(key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                errandFilter === key ? 'bg-sky-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {key === 'all'
                ? 'All types'
                : key === 'wa_local'
                  ? 'WA Local errands'
                  : key === 'pending_quote'
                    ? 'Awaiting quote'
                    : ERRAND_FILTER_LABELS[key]}
            </button>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-5 mb-8">
          {[
            { label: 'Total', value: tasks.length, status: 'all', color: 'slate' },
            {
              label: 'Posted',
              value: tasks.filter((t) => t.status === 'posted' || t.status === 'pending').length,
              status: 'posted',
              color: 'yellow',
            },
            { label: 'Accepted', value: tasks.filter((t) => t.status === 'accepted').length, status: 'accepted', color: 'blue' },
            {
              label: 'In Progress',
              value: tasks.filter((t) => t.status === 'in_progress').length,
              status: 'in_progress',
              color: 'purple',
            },
            { label: 'Completed', value: tasks.filter((t) => t.status === 'completed').length, status: 'completed', color: 'green' },
          ].map((stat) => (
            <button
              key={stat.status}
              type="button"
              onClick={() => setFilter(stat.status)}
              className={`rounded-2xl border p-5 shadow-lg backdrop-blur transition hover:-translate-y-0.5 ${
                filter === stat.status ? 'border-sky-300 bg-white/90' : 'border-white/60 bg-white/70'
              }`}
            >
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{stat.label}</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{stat.value}</p>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="rounded-2xl border border-white/60 bg-white/80 p-12 text-center shadow-xl shadow-sky-50 backdrop-blur">
            <Package className="mx-auto mb-4 h-16 w-16 text-slate-300" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">No tasks found</h3>
            <p className="text-slate-600">
              {filter === 'all' ? 'No tasks in this errand filter.' : `No ${filter} tasks in this errand filter.`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTasks.map((task) => {
              const c = clientOf(task);
              const r = runnerOf(task);
              const clientName = String(c?.name || 'there').trim() || 'there';
              const runnerName = String(r?.name || 'there').trim() || 'there';
              const summary = errandsAdminSummary(task);
              const wm = (task.workflowMeta || {}) as Record<string, unknown>;
              const webHandoverV2 = wm.errandHandoverV2 === true;
              const arrivalBells = Array.isArray(wm.arrivalBells)
                ? (wm.arrivalBells as Array<{ lat?: number; lng?: number; at?: string }>)
                : [];
              const pickupProof = wm.pickupProof as { path?: string } | undefined;
              return (
                <div
                  key={task._id}
                  className="rounded-2xl border border-white/60 bg-white/90 p-6 shadow-lg backdrop-blur transition hover:-translate-y-0.5 hover:shadow-xl"
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800">
                              {errandTypeLabel(task)}
                            </span>
                            <span
                              className={`px-2.5 py-0.5 text-xs rounded-full font-semibold ${getStatusColor(task.status)}`}
                            >
                              {task.status.replace('_', ' ')}
                            </span>
                          </div>
                          <h3 className="text-lg font-semibold text-slate-900 mt-1">{task.title}</h3>
                          <p className="text-sm text-slate-600 mt-1 line-clamp-3">{task.description}</p>
                          {summary ? (
                            <p className="text-xs text-slate-500 mt-2 whitespace-pre-line">{summary}</p>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div>
                          <p className="text-xs text-slate-500">Client</p>
                          <p className="font-medium text-slate-900">{c?.name || 'Unknown'}</p>
                          {c?.phone ? <p className="text-xs text-slate-500">{c.phone}</p> : null}
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Runner</p>
                          <p className="font-medium text-slate-900">{r?.name || 'Unassigned'}</p>
                          {r?.phone ? <p className="text-xs text-slate-500">{r.phone}</p> : null}
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Budget</p>
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3 text-emerald-600" />
                            <span className="font-semibold text-slate-900">
                              {task.status === 'pending_quote' ? '— (quote)' : `R${task.budget}`}
                            </span>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Created</p>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-sky-600" />
                            <span className="font-medium text-slate-900">{new Date(task.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      {task.status === 'pending_quote' && (
                        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/95 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 mb-2">
                            Invoice quote (Collect &amp; Send)
                          </p>
                          <p className="text-sm text-amber-950/90 mb-3">
                            Review the uploaded invoice for supplier location, goods, and dimensions — then set the client total.
                          </p>
                          {task.supplierInvoice?.path ? (
                            <a
                              href={getImageUrlFull(task.supplierInvoice.path)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex text-sm font-semibold text-sky-700 underline hover:text-sky-900"
                            >
                              Open invoice / proof
                            </a>
                          ) : (
                            <p className="text-xs text-amber-800">No invoice file on record.</p>
                          )}
                          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                            <label className="flex flex-col gap-1 text-xs text-slate-700 min-w-[140px]">
                              Client total (ZAR)
                              <input
                                type="number"
                                min={1}
                                step={1}
                                placeholder="e.g. 450"
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                                value={quoteDrafts[task._id]?.amount ?? ''}
                                onChange={(e) =>
                                  setQuoteDrafts((prev) => ({
                                    ...prev,
                                    [task._id]: {
                                      amount: e.target.value,
                                      notes: prev[task._id]?.notes ?? '',
                                    },
                                  }))
                                }
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-slate-700 flex-1 min-w-[200px]">
                              Notes (optional)
                              <input
                                type="text"
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                                placeholder="Internal note"
                                value={quoteDrafts[task._id]?.notes ?? ''}
                                onChange={(e) =>
                                  setQuoteDrafts((prev) => ({
                                    ...prev,
                                    [task._id]: {
                                      amount: prev[task._id]?.amount ?? '',
                                      notes: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </label>
                            <button
                              type="button"
                              disabled={publishingId === task._id}
                              onClick={() => publishQuote(task._id)}
                              className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-800 disabled:opacity-60"
                            >
                              {publishingId === task._id ? 'Publishing…' : 'Publish quote & notify'}
                            </button>
                          </div>
                        </div>
                      )}

                      {task.escrowed && (
                        <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-gradient-to-r from-emerald-50 to-sky-50 p-3">
                          <div>
                            <p className="text-xs text-slate-600">Held</p>
                            <p className="font-semibold text-slate-900">R{task.budget}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-600">Runner Net</p>
                            <p className="font-semibold text-emerald-700">R{(task.budget * (1 - commissionRate)).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-600">Commission</p>
                            <p className="font-semibold text-red-700">R{(task.budget * commissionRate).toFixed(2)}</p>
                          </div>
                        </div>
                      )}

                      <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-3">Client — follow up</p>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Message</p>
                            <AdminMessageFollowupLinks
                              displayName={clientName}
                              phone={c?.phone}
                              email={c?.email}
                              context="task_client"
                            />
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Location</p>
                            <AdminTaskMapLinks
                              pickup={task.pickupLocation}
                              delivery={task.deliveryLocation}
                              fallbackCountryCode={c?.countryCode}
                            />
                          </div>
                        </div>
                      </div>

                      {r ? (
                        <div className="mt-3 rounded-xl border border-slate-100 bg-white p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-3">Runner — follow up</p>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Message</p>
                              <AdminMessageFollowupLinks
                                displayName={runnerName}
                                phone={r.phone}
                                email={r.email}
                                context="task_runner"
                              />
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Location</p>
                              <AdminLocationFollowupLinks countryCode={r.countryCode} coordinates={r.location?.coordinates} />
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-wrap gap-2">
                        {task.status === 'posted' ? (
                          <button
                            type="button"
                            disabled={broadcastingId === task._id}
                            onClick={() => broadcastRunners(task._id)}
                            className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-sky-800 disabled:opacity-60"
                          >
                            <Megaphone className="h-3.5 w-3.5" />
                            {broadcastingId === task._id ? 'Broadcasting…' : 'Broadcast to runners'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setRunnerPickTaskId(runnerPickTaskId === task._id ? null : task._id);
                            setContactRunnerId(r?._id ? String(r._id) : '');
                          }}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                        >
                          <Send className="h-3.5 w-3.5" />
                          Contact runner
                        </button>
                      </div>

                      {runnerPickTaskId === task._id ? (
                        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/80 p-4">
                          <p className="text-xs font-semibold text-sky-900 mb-2">Notify a runner about this task</p>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <select
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 min-w-[200px]"
                              value={contactRunnerId}
                              onChange={(e) => setContactRunnerId(e.target.value)}
                            >
                              <option value="">Select runner…</option>
                              {runnerOptions.map((u) => (
                                <option key={u._id} value={u._id}>
                                  {(u.name || u.email || u._id).slice(0, 48)}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="Optional message"
                              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                              value={contactMessage}
                              onChange={(e) => setContactMessage(e.target.value)}
                            />
                            <button
                              type="button"
                              disabled={contactSending}
                              onClick={() => sendContactRunner(task._id)}
                              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                            >
                              {contactSending ? 'Sending…' : 'Send'}
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {webHandoverV2 ? (
                        <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/90 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-violet-900 mb-2 flex items-center gap-2">
                            <Camera className="h-4 w-4" />
                            Web handover tracking
                          </p>
                          {pickupProof?.path ? (
                            <a
                              href={getImageUrlFull(pickupProof.path)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-violet-800 underline"
                            >
                              View pickup photo
                            </a>
                          ) : (
                            <p className="text-xs text-violet-800">No pickup photo yet.</p>
                          )}
                          <div className="mt-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 mb-1 flex items-center gap-1">
                              <Bell className="h-3 w-3" />
                              Arrival bells (GPS)
                            </p>
                            {arrivalBells.length === 0 ? (
                              <p className="text-xs text-violet-800">None yet.</p>
                            ) : (
                              <ul className="space-y-1 text-xs text-violet-900">
                                {arrivalBells.map((b, i) => {
                                  const lat = Number(b.lat);
                                  const lng = Number(b.lng);
                                  const ok = Number.isFinite(lat) && Number.isFinite(lng);
                                  return (
                                    <li key={`${b.at || i}-${i}`}>
                                      {b.at ? new Date(b.at).toLocaleString() : '—'}{' '}
                                      {ok ? (
                                        <a
                                          className="font-semibold underline ml-1"
                                          href={`https://www.google.com/maps?q=${lat},${lng}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          Map
                                        </a>
                                      ) : null}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                          {wm.clientCollectedAt ? (
                            <p className="mt-2 text-xs text-emerald-800">
                              Client collected: {new Date(String(wm.clientCollectedAt)).toLocaleString()}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <Link
                      href={`/tasks/${task._id}`}
                      className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-sky-200 bg-white/80 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
                    >
                      <Eye className="h-4 w-4" />
                      View Details
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ProtectedAdminTasksPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <AdminTasksPage />
    </ProtectedRoute>
  );
}
