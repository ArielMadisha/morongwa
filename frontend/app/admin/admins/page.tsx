'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { adminAPI } from '@/lib/api';
import { ArrowLeft, Shield, Plus, Loader2, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';

const SECTIONS = [
  'tv_posts',
  'tv_comments',
  'tv_reports',
  'products',
  'suppliers',
  'users',
  'orders',
  'tasks',
  'support',
  'policies',
];

export default function AdminAdminsPage() {
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '', sections: [] as string[] });

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getAdmins();
      const data = res.data?.data ?? res.data ?? [];
      setAdmins(Array.isArray(data) ? data : []);
    } catch (e: any) {
      if (e.response?.status === 403) toast.error('Only super-admin can view admins');
      else toast.error('Failed to load admins');
      setAdmins([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email?.trim() || !form.name?.trim() || !form.password?.trim()) {
      toast.error('Email, name and password required');
      return;
    }
    setCreating(true);
    try {
      await adminAPI.createAdmin({
        email: form.email.trim(),
        name: form.name.trim(),
        password: form.password,
        sections: form.sections,
      });
      toast.success('Admin created');
      setShowCreate(false);
      setForm({ email: '', name: '', password: '', sections: [] });
      loadAdmins();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to create admin');
    } finally {
      setCreating(false);
    }
  };

  const toggleSection = (s: string) => {
    setForm((f) => ({
      ...f,
      sections: f.sections.includes(s) ? f.sections.filter((x) => x !== s) : [...f.sections, s],
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-sky-600" />
              <div>
                <h1 className="text-xl font-semibold text-slate-900">Create admins</h1>
                <p className="text-sm text-slate-500">Super-admin: create admins with section permissions</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-white font-medium hover:bg-sky-600"
          >
            <UserPlus className="h-5 w-5" />
            Create admin
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-700">Admin</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-700">Sections</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a._id} className="border-b border-slate-100">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{a.userId?.name}</p>
                      <p className="text-sm text-slate-500">{a.userId?.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(a.sections || []).map((s: string) => (
                          <span key={s} className="px-2 py-0.5 rounded bg-sky-100 text-sky-700 text-xs">
                            {s}
                          </span>
                        ))}
                        {(!a.sections || a.sections.length === 0) && (
                          <span className="text-slate-400 text-sm">No sections</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {admins.length === 0 && (
              <div className="p-12 text-center text-slate-500">No admins created yet</div>
            )}
          </div>
        )}

        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Create admin</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Sections to moderate</label>
                  <div className="flex flex-wrap gap-2">
                    {SECTIONS.map((s) => (
                      <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.sections.includes(s)}
                          onChange={() => toggleSection(s)}
                        />
                        <span className="text-sm text-slate-700">{s.replace(/_/g, ' ')}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 px-4 py-2 rounded-xl bg-sky-500 text-white font-medium disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
