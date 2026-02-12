'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { storesAPI } from '@/lib/api';
import Link from 'next/link';
import { Store as StoreIcon, ArrowLeft, Loader2, Pencil, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import SiteHeader from '@/components/SiteHeader';

interface MyStore {
  _id: string;
  name: string;
  slug: string;
  type: string;
  supplierId?: { storeName?: string; status?: string };
}

export default function MyStorePage() {
  const { user } = useAuth();
  const [stores, setStores] = useState<MyStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const myWallHref = user?._id ? `/resellers/${user._id}` : '/marketplace';

  useEffect(() => {
    fetchStores();
  }, []);

  const fetchStores = async () => {
    try {
      const res = await storesAPI.getMyStores();
      const list = res.data?.data ?? res.data ?? [];
      setStores(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Failed to load your stores');
      setStores([]);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (store: MyStore) => {
    setEditingId(store._id);
    setEditName(store.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const saveName = async () => {
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    try {
      await storesAPI.renameStore(editingId, editName.trim());
      toast.success('Store name updated');
      setEditingId(null);
      setEditName('');
      fetchStores();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update name');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <SiteHeader />
        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <Link href="/marketplace" className="text-sm text-sky-600 hover:underline flex items-center gap-1 mb-2">
                <ArrowLeft className="h-4 w-4" /> Marketplace
              </Link>
              <h1 className="text-2xl font-bold text-slate-900">My store</h1>
              <p className="text-slate-600 mt-1">Rename your store or view your reseller wall.</p>
            </div>
          </div>

          <div className="mb-8 rounded-xl border border-sky-100 bg-sky-50/50 p-4">
            <p className="text-sm font-semibold text-slate-800 mb-3">How to get a store</p>
            <ol className="space-y-2 text-sm text-slate-700 list-none">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white text-xs font-bold">1</span>
                <span>From the <Link href="/marketplace" className="text-sky-600 hover:underline">marketplace</Link>, click <strong>Add to my wall</strong> on any product that allows reselling.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white text-xs font-bold">2</span>
                <span><strong>A store is created automatically</strong> for you (e.g. “My Store”).</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white text-xs font-bold">3</span>
                <span><strong>Rename it here</strong> — Use the pencil icon next to your store name and save. Your wall is at <strong>My wall</strong> in the header.</span>
              </li>
            </ol>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
            </div>
          ) : stores.length === 0 ? (
            <div className="rounded-2xl border border-white/60 bg-white/80 p-8 shadow-xl shadow-sky-50 text-center">
              <StoreIcon className="h-14 w-14 text-slate-300 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-slate-900">No store yet</h2>
              <p className="text-slate-600 mt-2">Follow the steps above: add a product to your wall from the marketplace and a store will be created. Then come back here to rename it.</p>
              <Link href="/marketplace" className="inline-flex items-center gap-2 mt-6 rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700">
                Go to marketplace
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {stores.map((store) => (
                <div key={store._id} className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      {editingId === store._id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-slate-900 w-full max-w-xs focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                            placeholder="Store name"
                          />
                          <button type="button" onClick={saveName} disabled={saving} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 flex items-center gap-1">
                            <Check className="h-4 w-4" /> Save
                          </button>
                          <button type="button" onClick={cancelEdit} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1">
                            <X className="h-4 w-4" /> Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <h2 className="text-xl font-semibold text-slate-900">{store.name}</h2>
                            <button type="button" onClick={() => startEdit(store)} className="text-slate-400 hover:text-sky-600 p-1" title="Rename store">
                              <Pencil className="h-4 w-4" />
                            </button>
                          </div>
                          <p className="text-sm text-slate-500 mt-1">/{store.slug}</p>
                          <p className="text-xs text-slate-400 mt-1 capitalize">{store.type} store</p>
                        </>
                      )}
                    </div>
                    {store.type === 'reseller' && (
                      <Link href={myWallHref} className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100">
                        My wall
                      </Link>
                    )}
                  </div>
                </div>
              ))}
              <p className="text-sm text-slate-500">
                <Link href="/marketplace" className="text-sky-600 hover:underline">Browse marketplace</Link>
                {' · '}
                <Link href={myWallHref} className="text-sky-600 hover:underline">View my reseller wall</Link>
              </p>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
