'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { adminAPI, getImageUrl } from '@/lib/api';
import { ArrowLeft, Tv, Image, Flag, Check, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminTVPage() {
  const [activeTab, setActiveTab] = useState<'posts' | 'reports'>('posts');
  const [posts, setPosts] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getTVPosts({ page, limit: 20 });
      const data = res.data?.data ?? res.data ?? [];
      setPosts(Array.isArray(data) ? data : []);
    } catch (e: any) {
      if (e.response?.status === 403) toast.error('You do not have permission for TV posts');
      else toast.error('Failed to load posts');
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  const loadReports = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getTVReports({ page: 1, limit: 50 });
      const data = res.data?.data ?? res.data ?? [];
      setReports(Array.isArray(data) ? data : []);
    } catch (e: any) {
      if (e.response?.status === 403) toast.error('You do not have permission for TV reports');
      else toast.error('Failed to load reports');
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'posts') loadPosts();
    else loadReports();
  }, [activeTab, page]);

  const handleApprove = async (id: string) => {
    try {
      await adminAPI.approveTVPost(id);
      toast.success('Post approved');
      loadPosts();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed');
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Rejection reason (optional):');
    try {
      await adminAPI.rejectTVPost(id, reason || undefined);
      toast.success('Post rejected');
      loadPosts();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed');
    }
  };

  const handleResolveReport = async (id: string) => {
    try {
      await adminAPI.resolveTVReport(id);
      toast.success('Report resolved');
      loadReports();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed');
    }
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
              <Tv className="h-8 w-8 text-sky-600" />
              <div>
                <h1 className="text-xl font-semibold text-slate-900">Morongwa-TV</h1>
                <p className="text-sm text-slate-500">Moderate posts and reports</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('posts')}
            className={`px-4 py-2 rounded-xl font-medium ${
              activeTab === 'posts' ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            Posts
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 rounded-xl font-medium ${
              activeTab === 'reports' ? 'bg-sky-500 text-white' : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            Reports
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
          </div>
        ) : activeTab === 'posts' ? (
          <div className="space-y-4">
            {posts.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
                No posts to moderate
              </div>
            ) : (
              posts.map((p) => (
                <div
                  key={p._id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 flex gap-4"
                >
                  <div className="w-24 h-24 rounded-xl bg-slate-100 shrink-0 overflow-hidden flex items-center justify-center">
                    {p.type === 'video' && p.mediaUrls?.[0] ? (
                      <video src={p.mediaUrls[0]} className="w-full h-full object-cover" muted />
                    ) : p.mediaUrls?.[0] ? (
                      <img src={getImageUrl(p.mediaUrls[0])} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Image className="h-8 w-8 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{p.caption || 'No caption'}</p>
                    <p className="text-sm text-slate-500">
                      {p.creatorId?.name} · {p.status}
                    </p>
                  </div>
                  {p.status === 'pending' && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleApprove(p._id)}
                        className="p-2 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                      >
                        <Check className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleReject(p._id)}
                        className="p-2 rounded-lg bg-rose-100 text-rose-700 hover:bg-rose-200"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {reports.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
                No reports
              </div>
            ) : (
              reports.map((r) => (
                <div
                  key={r._id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 flex justify-between items-start"
                >
                  <div>
                    <p className="font-medium text-slate-900">{r.reason}</p>
                    <p className="text-sm text-slate-500">
                      by {r.reporterId?.name} · {r.status}
                    </p>
                  </div>
                  {r.status === 'pending' && (
                    <button
                      onClick={() => handleResolveReport(r._id)}
                      className="px-3 py-1.5 rounded-lg bg-sky-500 text-white text-sm font-medium"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
