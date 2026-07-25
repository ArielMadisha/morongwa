'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Phone, Search, Trash2, Upload, UserPlus } from 'lucide-react';
import { morongwaAPI, type MorongwaContactRow } from '@/lib/api';

type Props = {
  onCallPhone?: (e164: string) => void;
  onMessageUser?: (userId: string) => void;
};

function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('27') || d.startsWith('267')) return `+${d}`;
  if (d.length >= 9) return `+27${d.replace(/^0/, '')}`;
  return `+${d}`;
}

export function MorongwaPeopleSection({ onCallPhone, onMessageUser }: Props) {
  const [contacts, setContacts] = useState<MorongwaContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const csvRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await morongwaAPI.getContacts();
      setContacts(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch {
      setContacts([]);
      toast.error('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addManual = async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    try {
      await morongwaAPI.addContact({ name: name.trim(), phone: phone.trim() || undefined });
      setName('');
      setPhone('');
      toast.success('Contact added');
      void load();
    } catch {
      toast.error('Failed to add contact');
    }
  };

  const importFromPhone = async () => {
    const nav = navigator as Navigator & {
      contacts?: { select: (props: string[], opts?: { multiple?: boolean }) => Promise<Array<{ name?: string[]; tel?: string[] }>> };
    };
    if (!nav.contacts?.select) {
      toast.error('Contact picker not supported in this browser — use CSV import');
      return;
    }
    try {
      const picked = await nav.contacts.select(['name', 'tel'], { multiple: true });
      const rows = picked
        .map((c) => ({
          name: (c.name?.[0] || 'Contact').trim(),
          phone: (c.tel?.[0] || '').trim(),
          source: 'phone',
        }))
        .filter((r) => r.name);
      if (!rows.length) return;
      await morongwaAPI.importContacts(rows);
      toast.success(`Imported ${rows.length} contact(s)`);
      void load();
    } catch {
      toast.error('Contact import cancelled or failed');
    }
  };

  const importCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const rows: Array<{ name: string; phone?: string; email?: string; source: string }> = [];
    for (const line of lines.slice(0, 500)) {
      const parts = line.split(/[,;]/).map((p) => p.trim().replace(/^"|"$/g, ''));
      if (!parts[0]) continue;
      rows.push({
        name: parts[0],
        phone: parts[1] || undefined,
        email: parts[2] || undefined,
        source: 'csv',
      });
    }
    if (!rows.length) {
      toast.error('No valid rows in CSV');
      return;
    }
    try {
      const res = await morongwaAPI.importContacts(rows);
      toast.success(`Imported ${res.data.imported ?? rows.length} contact(s)`);
      void load();
    } catch {
      toast.error('CSV import failed');
    }
  };

  const filtered = contacts.filter((c) => {
    const q = query.toLowerCase();
    return `${c.name} ${c.phone || ''} ${c.email || ''}`.toLowerCase().includes(q);
  });

  return (
    <div className="flex w-full flex-1 flex-col overflow-hidden bg-white min-h-[min(70dvh,calc(100dvh-11rem))] lg:h-full lg:min-h-0">
      <div className="border-b border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-900">People</h1>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void importFromPhone()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
              <UserPlus className="h-4 w-4" /> From phone
            </button>
            <button type="button" onClick={() => csvRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
              <Upload className="h-4 w-4" /> Import CSV
            </button>
            <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ''; }} />
          </div>
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a contact" className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="flex-1 min-w-[120px] rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="flex-1 min-w-[120px] rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <button type="button" onClick={() => void addManual()} className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700">Add</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-violet-600" /></div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">No contacts yet — import from phone or CSV</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const platformId = typeof c.platformUserId === 'object' ? c.platformUserId?._id : undefined;
                const dial = normalizePhone(c.phone || '');
                return (
                  <tr key={c._id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                    <td className="px-4 py-3 text-slate-600">{c.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {platformId && onMessageUser ? (
                          <button type="button" onClick={() => onMessageUser(platformId)} className="rounded-lg px-2 py-1 text-xs font-semibold text-sky-600 hover:bg-sky-50">Chat</button>
                        ) : null}
                        {dial && onCallPhone ? (
                          <button type="button" onClick={() => onCallPhone(dial)} className="rounded-lg p-1.5 text-violet-600 hover:bg-violet-50" aria-label="Call">
                            <Phone className="h-4 w-4" />
                          </button>
                        ) : null}
                        <button type="button" onClick={async () => { await morongwaAPI.deleteContact(c._id); void load(); }} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50" aria-label="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
