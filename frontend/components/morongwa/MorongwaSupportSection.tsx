'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Send } from 'lucide-react';
import { supportAPI } from '@/lib/api';
import { SUPPORT_CATEGORIES } from '@/lib/supportCategories';

export function MorongwaSupportSection() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [form, setForm] = useState({ subject: '', category: 'general:messages', description: '' });

  useEffect(() => {
    supportAPI
      .getMyTickets()
      .then((res) => setTickets(Array.isArray(res.data?.tickets) ? res.data.tickets : []))
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, []);

  const categories = Object.values(SUPPORT_CATEGORIES).flatMap((c) => c.subcategories);

  const submit = async () => {
    if (!form.subject.trim() || !form.description.trim()) {
      toast.error('Subject and description are required');
      return;
    }
    setSubmitting(true);
    try {
      await supportAPI.create({
        title: form.subject.trim(),
        description: form.description.trim(),
        category: form.category,
      });
      toast.success('Support ticket submitted');
      setForm({ subject: '', category: 'general:messages', description: '' });
      const res = await supportAPI.getMyTickets();
      setTickets(Array.isArray(res.data?.tickets) ? res.data.tickets : []);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Failed to submit ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = tickets.filter((t) =>
    `${t.subject || ''} ${t.status || ''}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex w-full flex-1 flex-col overflow-y-auto bg-gradient-to-br from-sky-50 via-blue-50 to-white p-4 sm:p-6 min-h-[min(70dvh,calc(100dvh-11rem))] lg:h-full lg:min-h-0">
      <div className="mx-auto w-full max-w-lg">
        <h1 className="text-2xl font-bold text-slate-900">Support</h1>
        <p className="text-sm text-slate-600 mb-4">Get help and manage your support tickets</p>
        <input
          type="search"
          placeholder="Search tickets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mb-4 w-full rounded-xl border border-sky-200 bg-white/80 px-4 py-2.5 text-sm"
        />
        <div className="rounded-2xl border border-white/60 bg-white/80 p-4 shadow-xl shadow-sky-50 backdrop-blur mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-600 mb-2">New ticket</p>
          <label className="text-xs font-semibold uppercase text-sky-600">Subject</label>
          <textarea
            rows={2}
            placeholder="Brief subject..."
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            className="mt-1 mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <label className="text-xs font-semibold uppercase text-sky-600">Category</label>
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="mt-1 mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <label className="text-xs font-semibold uppercase text-sky-600">Description</label>
          <textarea
            rows={4}
            placeholder="Describe your issue..."
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="mt-1 mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 py-3 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-sky-600" /></div>
        ) : filtered.length > 0 ? (
          <ul className="space-y-2">
            {filtered.map((t) => (
              <li key={t._id} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <p className="font-semibold text-slate-900">{t.title || t.subject}</p>
                <p className="text-xs text-slate-500 capitalize">{t.status || 'open'}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
