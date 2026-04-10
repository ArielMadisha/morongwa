'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminAPI, getImageUrlFull, api } from '@/lib/api';
import Link from 'next/link';
import {
  ArrowLeft,
  Package,
  Loader2,
  Search,
  Download,
  ExternalLink,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface EproloProduct {
  id: string;
  name: string;
  sku?: string;
  supplierCost: number;
  images: string[];
  categories?: string[];
}

type Tab = 'search' | 'import' | 'imported';

const SEARCH_PAGE_SIZE = 100;

function dedupeEproloSearchById(products: EproloProduct[]): EproloProduct[] {
  const seen = new Set<string>();
  const out: EproloProduct[] = [];
  for (const p of products) {
    const id = String(p.id ?? '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(p);
  }
  return out;
}

function formatPrice(price: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(price);
}

export default function AdminDropshipEproloPage() {
  const [tab, setTab] = useState<Tab>('search');
  const [usdToZarRate, setUsdToZarRate] = useState<number>(18.5);

  useEffect(() => {
    api.get('/fx/rates').then((res) => {
      const r = res.data?.rates?.ZAR;
      if (typeof r === 'number') setUsdToZarRate(r);
    }).catch(() => {});
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<EproloProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchListPage, setSearchListPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [loadingMoreSearch, setLoadingMoreSearch] = useState(false);
  /** Query string used for the current result list (so "More" matches the last Search). */
  const [searchQActive, setSearchQActive] = useState('');
  const [importById, setImportById] = useState('');
  const [forceUpdate, setForceUpdate] = useState(false);
  const [importing, setImporting] = useState(false);
  const [reimportingId, setReimportingId] = useState<string | null>(null);
  const [syncingStock, setSyncingStock] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** Selection on "Imported products" tab (Mongo _id), for bulk re-import. */
  const [importedSelectedIds, setImportedSelectedIds] = useState<Set<string>>(new Set());
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkReimporting, setBulkReimporting] = useState(false);
  const [importedProducts, setImportedProducts] = useState<any[]>([]);
  const [loadingImported, setLoadingImported] = useState(false);
  const [eproloConfigured, setEproloConfigured] = useState<boolean | null>(null);

  const handleSearch = async () => {
    const q = searchQuery.trim();
    setSearching(true);
    try {
      const res = await adminAPI.searchEproloProducts({ q, page: 1, size: SEARCH_PAGE_SIZE });
      const products = res.data?.products ?? [];
      const list = dedupeEproloSearchById(Array.isArray(products) ? products : []);
      setSearchResults(list);
      setSearchQActive(q);
      setSearchListPage(1);
      setSearchHasMore(list.length === SEARCH_PAGE_SIZE);
      setSelectedIds(new Set());
      if (list.length === 0) toast('No products found. Try a different keyword or leave search empty to browse.');
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'EPROLO search failed';
      toast.error(msg);
      if (msg.toLowerCase().includes('auth') || msg.toLowerCase().includes('api')) {
        setEproloConfigured(false);
      }
      setSearchResults([]);
      setSearchHasMore(false);
      setSearchQActive('');
    } finally {
      setSearching(false);
    }
  };

  const handleLoadMoreSearch = async () => {
    if (!searchHasMore || loadingMoreSearch || searching) return;
    setLoadingMoreSearch(true);
    try {
      const nextPage = searchListPage + 1;
      const res = await adminAPI.searchEproloProducts({
        q: searchQActive,
        page: nextPage,
        size: SEARCH_PAGE_SIZE,
      });
      const batch = dedupeEproloSearchById(Array.isArray(res.data?.products) ? res.data.products : []);
      setSearchResults((prev) => {
        const seen = new Set(prev.map((p) => String(p.id)));
        const merged = [...prev];
        for (const p of batch) {
          const id = String(p.id);
          if (!seen.has(id)) {
            seen.add(id);
            merged.push(p);
          }
        }
        return merged;
      });
      setSearchListPage(nextPage);
      setSearchHasMore(batch.length === SEARCH_PAGE_SIZE);
      if (batch.length === 0) toast('No more products for this search.');
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Could not load more');
    } finally {
      setLoadingMoreSearch(false);
    }
  };

  const handleImportOne = async (eproloProductId: string, doForceUpdate = false) => {
    setImporting(true);
    try {
      const res = await adminAPI.importEproloProduct(eproloProductId, doForceUpdate);
      const data = res.data?.data ?? res.data;
      toast.success(res.data?.created ? 'Product imported' : 'Product updated');
      if (data?._id) {
        setImportedProducts((prev) => [data, ...prev.filter((p) => p._id !== data._id)]);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleReimport = async (p: { _id: string; externalProductId?: string }) => {
    const eproloId = p.externalProductId;
    if (!eproloId) {
      toast.error('No EPROLO product ID – cannot re-import');
      return;
    }
    setReimportingId(p._id);
    try {
      const res = await adminAPI.importEproloProduct(eproloId, true);
      const data = res.data?.data ?? res.data;
      toast.success('Product re-imported');
      if (data?._id) {
        setImportedProducts((prev) => prev.map((x) => (x._id === data._id ? data : x)));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Re-import failed');
    } finally {
      setReimportingId(null);
    }
  };

  const toggleImportedSelect = (id: string) => {
    setImportedSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllImported = () =>
    setImportedSelectedIds(new Set(importedProducts.map((p) => p._id)));

  const clearImportedSelection = () => setImportedSelectedIds(new Set());

  const handleBulkReimport = async () => {
    const selected = importedProducts.filter((p) => importedSelectedIds.has(p._id));
    const toReimport = selected.filter((p) => p.externalProductId);
    if (selected.length === 0) {
      toast.error('Select at least one product');
      return;
    }
    if (toReimport.length === 0) {
      toast.error('Selected products have no EPROLO ID – cannot re-import');
      return;
    }
    setBulkReimporting(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const p of toReimport) {
        setReimportingId(p._id);
        try {
          const res = await adminAPI.importEproloProduct(p.externalProductId, true);
          const data = res.data?.data ?? res.data;
          if (data?._id) {
            setImportedProducts((prev) => prev.map((x) => (x._id === data._id ? data : x)));
          }
          ok++;
        } catch {
          fail++;
        }
      }
      if (selected.length > toReimport.length) {
        toast(
          `Skipped ${selected.length - toReimport.length} without EPROLO ID`,
          { duration: 4000 }
        );
      }
      toast.success(`Re-import finished: ${ok} succeeded${fail ? `, ${fail} failed` : ''}`);
      setImportedSelectedIds(new Set());
    } finally {
      setReimportingId(null);
      setBulkReimporting(false);
    }
  };

  const handleImportById = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = importById.trim().replace(/^["']|["']$/g, '');
    if (!id) {
      toast.error('Enter an EPROLO product ID');
      return;
    }
    await handleImportOne(id, forceUpdate);
    setImportById('');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(searchResults.map((p) => p.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const handleImportSelected = async (e: React.FormEvent) => {
    e.preventDefault();
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      toast.error('Select products to import (use checkboxes)');
      return;
    }
    setBulkImporting(true);
    let imported = 0;
    const failed: string[] = [];
    let firstErrorMessage = '';
    try {
      for (const id of ids) {
        try {
          const res = await adminAPI.importEproloProduct(id, false);
          const data = res.data?.data ?? res.data;
          if (data?._id) {
            setImportedProducts((prev) => [data, ...prev.filter((p) => p._id !== data._id)]);
            imported++;
          }
        } catch (err: any) {
          failed.push(id);
          if (!firstErrorMessage) {
            firstErrorMessage = err?.response?.data?.message || err?.message || '';
          }
        }
      }
      if (imported > 0) {
        toast.success(`Imported ${imported} of ${ids.length} product(s)`);
      }
      if (failed.length > 0) {
        const suffix = firstErrorMessage ? ` (${firstErrorMessage})` : '';
        toast.error(`Failed to import ${failed.length} product(s)${suffix}`);
      }
      setSelectedIds(new Set());
      if (imported > 0) setTab('imported');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Import failed');
    } finally {
      setBulkImporting(false);
    }
  };

  const handleSyncStock = async () => {
    setSyncingStock(true);
    try {
      const res = await adminAPI.syncEproloStock();
      const d = res.data?.data ?? res.data;
      toast.success(`Stock synced: ${d?.updated ?? 0} updated, ${d?.failed ?? 0} failed`);
      if (d?.outOfStock?.length) {
        toast(`Out of stock: ${d.outOfStock.slice(0, 3).join(', ')}${d.outOfStock.length > 3 ? '...' : ''}`, { duration: 5000 });
      }
      fetchImported();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Stock sync failed');
    } finally {
      setSyncingStock(false);
    }
  };

  const fetchImported = useCallback(async () => {
    setLoadingImported(true);
    try {
      const res = await adminAPI.getProducts({ supplierSource: 'eprolo', limit: 50 });
      const list = res.data?.products ?? res.data ?? [];
      setImportedProducts(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Failed to load imported products');
      setImportedProducts([]);
    } finally {
      setLoadingImported(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'imported') fetchImported();
  }, [tab, fetchImported]);

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'search', label: 'Search EPROLO', icon: Search },
    { id: 'import', label: 'Import by ID', icon: Download },
    { id: 'imported', label: 'Imported products', icon: Package },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div>
            <Link href="/admin/dropship" className="inline-flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700 mb-2">
              <ArrowLeft className="h-4 w-4" /> Back to Dropshipping
            </Link>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-600">Qwertymates</p>
            <h1 className="mt-1 text-3xl font-semibold text-slate-900">EPROLO</h1>
            <p className="mt-1 text-sm text-slate-600">
              Search EPROLO platform, import products, and manage stock. Products are uploaded to Qwertymates marketplace.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-teal-100 px-4 py-2">
            <Package className="h-5 w-5 text-teal-600" />
            <span className="text-sm font-medium text-teal-700">EPROLO</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {eproloConfigured === false && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <div>
              <p className="font-medium text-amber-800">EPROLO API not configured</p>
              <p className="text-sm text-amber-700 mt-1">
                Add EPROLO_API_KEY and EPROLO_API_SECRET to backend .env and run <code className="bg-amber-100 px-1 rounded">npm run seed:external-suppliers</code>.
              </p>
            </div>
          </div>
        )}

        <div className="mb-6 flex gap-2 border-b border-slate-200">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id);
                  if (t.id === 'imported') fetchImported();
                }}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition ${
                  tab === t.id ? 'border-teal-500 text-teal-600' : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'search' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Search EPROLO catalog</h2>
              <p className="text-sm text-slate-600 mb-3">Leave search empty to browse all products, or enter keywords (e.g. solar, dress, bag).</p>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="e.g. solar, dress, bag (or empty to browse)"
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button
                  onClick={handleSearch}
                  disabled={searching}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-white font-medium hover:bg-teal-700 disabled:opacity-50"
                >
                  {searching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                  Search
                </button>
              </div>

              {searchResults.length > 0 && (
                <>
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-600">{searchResults.length} results</p>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={selectAll} className="text-sm text-teal-600 hover:text-teal-700 hover:underline">Select all</button>
                      <span className="text-slate-300">|</span>
                      <button type="button" onClick={clearSelection} className="text-sm text-slate-600 hover:text-slate-700 hover:underline">Clear selection</button>
                      <form onSubmit={handleImportSelected} className="flex items-center gap-2 ml-2">
                        <button
                          type="submit"
                          disabled={bulkImporting || selectedIds.size === 0}
                          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {bulkImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          Import selected ({selectedIds.size})
                        </button>
                      </form>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {searchResults.map((p) => (
                      <div
                        key={p.id}
                        className={`rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition ${
                          selectedIds.has(p.id) ? 'border-teal-400 ring-1 ring-teal-200' : 'border-slate-100'
                        }`}
                      >
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.id)}
                            onChange={() => toggleSelect(p.id)}
                            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                          />
                          <span className="text-xs text-slate-500">Select</span>
                        </label>
                        <div className="aspect-square rounded-lg bg-slate-100 overflow-hidden mb-3">
                          {p.images?.[0] ? (
                            <img src={getImageUrlFull(p.images[0])} alt={p.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-slate-400"><Package className="h-12 w-12" /></div>
                          )}
                        </div>
                        <h3 className="font-medium text-slate-900 line-clamp-2 text-sm">{p.name}</h3>
                        <p className="mt-1 text-sm font-semibold text-teal-600">{formatPrice(p.supplierCost)}</p>
                        <p className="text-xs text-slate-500">ID: {p.id}</p>
                        <button
                          onClick={() => handleImportOne(p.id)}
                          disabled={importing}
                          className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-teal-600 py-2 text-sm text-white hover:bg-teal-700 disabled:opacity-50"
                        >
                          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          Import
                        </button>
                      </div>
                    ))}
                  </div>
                  {searchHasMore && (
                    <div className="mt-8 flex justify-center border-t border-slate-100 pt-6">
                      <button
                        type="button"
                        onClick={handleLoadMoreSearch}
                        disabled={loadingMoreSearch || searching}
                        className="text-sm font-medium text-teal-600 hover:text-teal-800 hover:underline disabled:opacity-50 disabled:no-underline"
                      >
                        {loadingMoreSearch ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading…
                          </span>
                        ) : (
                          'More'
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'import' && (
          <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Import by EPROLO product ID</h2>
            <p className="text-sm text-slate-600 mb-4">
              If you have an EPROLO product ID (from search results or EPROLO dashboard), paste it here to import. Use &quot;Force update&quot; to refresh stock and pricing on existing products.
            </p>
            <form onSubmit={handleImportById} className="flex flex-col gap-3">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={importById}
                  onChange={(e) => setImportById(e.target.value)}
                  placeholder="e.g. 31254278"
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button type="submit" disabled={importing} className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-white font-medium hover:bg-teal-700 disabled:opacity-50">
                  {importing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                  Import
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input type="checkbox" checked={forceUpdate} onChange={(e) => setForceUpdate(e.target.checked)} className="rounded border-slate-300" />
                Force update existing (refresh stock &amp; price)
              </label>
            </form>
          </div>
        )}

        {tab === 'imported' && (
          <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Imported EPROLO products</h2>
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                {importedProducts.length > 0 && !loadingImported ? (
                  <>
                    <button
                      type="button"
                      onClick={selectAllImported}
                      disabled={bulkReimporting}
                      className="text-sm text-teal-600 hover:text-teal-700 hover:underline disabled:opacity-50"
                    >
                      Select all
                    </button>
                    <span className="text-slate-300 hidden sm:inline">|</span>
                    <button
                      type="button"
                      onClick={clearImportedSelection}
                      disabled={bulkReimporting || importedSelectedIds.size === 0}
                      className="text-sm text-slate-600 hover:text-slate-800 hover:underline disabled:opacity-50"
                    >
                      Clear selection
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkReimport}
                      disabled={bulkReimporting || importedSelectedIds.size === 0}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Force re-import from EPROLO (refreshes stock and pricing)"
                    >
                      {bulkReimporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Re-import selected ({importedSelectedIds.size})
                    </button>
                  </>
                ) : null}
                <button
                  onClick={handleSyncStock}
                  disabled={syncingStock || loadingImported || importedProducts.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                  title="Sync stock from EPROLO"
                >
                  {syncingStock ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Sync stock
                </button>
                <button onClick={fetchImported} disabled={loadingImported} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50">
                  {loadingImported ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Refresh
                </button>
              </div>
            </div>
            {loadingImported ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>
            ) : importedProducts.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Package className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                <p>No EPROLO products imported yet.</p>
                <p className="text-sm mt-1">Use Search EPROLO or Import by ID to add products to Qwertymates.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {importedProducts.map((p) => (
                  <div
                    key={p._id}
                    className={`flex gap-3 rounded-xl border bg-white p-4 shadow-sm ${
                      importedSelectedIds.has(p._id) ? 'border-teal-400 ring-1 ring-teal-200' : 'border-slate-100'
                    }`}
                  >
                    <label className="flex cursor-pointer items-start pt-0.5 flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={importedSelectedIds.has(p._id)}
                        onChange={() => toggleImportedSelect(p._id)}
                        disabled={bulkReimporting}
                        className="mt-1 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        aria-label={`Select ${p.title ?? 'product'}`}
                      />
                    </label>
                    <div className="w-20 h-20 flex-shrink-0 rounded-lg bg-slate-100 overflow-hidden">
                      {p.images?.[0] ? (
                        <img src={getImageUrlFull(p.images[0])} alt={p.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-slate-400"><Package className="h-8 w-8" /></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-slate-900 line-clamp-2 text-sm">{p.title}</h3>
                      {p.description && (
                        <p className="mt-1 text-xs text-slate-600 line-clamp-3" title={p.description.replace(/<[^>]*>/g, '')}>
                          {String(p.description).replace(/<[^>]*>/g, '').trim()}
                        </p>
                      )}
                      <p className="mt-1 text-sm font-semibold text-teal-600">
                        {p.currency === 'USD' ? `R${(Number(p.price ?? 0) * usdToZarRate).toFixed(2)}` : `R${Number(p.price ?? 0).toFixed(2)}`} (platform)
                      </p>
                      <p className={`mt-0.5 text-xs ${(p.outOfStock || (p.stock ?? 0) < 1) ? 'text-amber-600 font-medium' : 'text-slate-500'}`}>
                        Stock: {p.outOfStock ? 'Out of stock' : (p.stock ?? 0)}
                      </p>
                      <div className="mt-1 flex flex-col gap-0.5 text-xs text-slate-500 font-mono">
                        <span title={p._id} className="truncate">ID: {p._id}</span>
                        {p.externalProductId && (
                          <code className="text-teal-600 cursor-copy hover:underline truncate block" title={`EPROLO: ${p.externalProductId} – click to copy`} onClick={() => { navigator.clipboard.writeText(p.externalProductId); toast.success('EPROLO Product ID copied'); }}>
                            EPROLO: {p.externalProductId}
                          </code>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Link href={`/admin/products/${p._id}/edit`} className="inline-flex items-center gap-1 text-xs text-teal-600 hover:underline">Edit</Link>
                        <Link href={`/marketplace/product/${p.slug || p._id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-slate-600 hover:underline">View <ExternalLink className="h-3 w-3" /></Link>
                        {p.externalProductId && (
                          <button onClick={() => handleReimport(p)} disabled={reimportingId === p._id || bulkReimporting} className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 hover:underline disabled:opacity-50" title="Re-import from EPROLO">
                            {reimportingId === p._id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-4" />}
                            Re-import
                          </button>
                        )}
                      </div>
                    </div>
                    <CheckCircle className="h-5 w-5 flex-shrink-0 text-emerald-500" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
