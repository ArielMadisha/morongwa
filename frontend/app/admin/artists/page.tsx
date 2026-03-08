'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import {
  ArrowLeft,
  Music2,
  Loader2,
  CheckCircle,
  XCircle,
  UserPlus,
  User,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ArtistVerification {
  _id: string;
  userId: { _id: string; name?: string; email?: string; avatar?: string };
  type: string;
  stageName?: string;
  labelName?: string;
  status: 'pending' | 'approved' | 'rejected';
  reason?: string;
  createdAt?: string;
}

function ArtistsManagement() {
  const [verifications, setVerifications] = useState<ArtistVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [createOpen, setCreateOpen] = useState(false);
  const [createUserId, setCreateUserId] = useState('');
  const [createType, setCreateType] = useState<'artist' | 'company' | 'producer'>('artist');
  const [createStageName, setCreateStageName] = useState('');
  const [createLabelName, setCreateLabelName] = useState('');
  const [creating, setCreating] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  useEffect(() => {
    fetchVerifications();
  }, [statusFilter]);

  const fetchVerifications = async () => {
    try {
      const res = await adminAPI.getArtistVerifications({ status: statusFilter || undefined });
      const data = res.data?.data ?? res.data ?? [];
      setVerifications(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load artist verifications');
      setVerifications([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await adminAPI.approveArtistVerification(id);
      toast.success('Artist approved');
      fetchVerifications();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to approve');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await adminAPI.rejectArtistVerification(id, rejectReason);
      toast.success('Artist rejected');
      setRejectingId(null);
      setRejectReason('');
      fetchVerifications();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to reject');
    }
  };

  const handleCreateArtist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createUserId.trim()) {
      toast.error('User ID is required');
      return;
    }
    setCreating(true);
    try {
      await adminAPI.createArtist({
        userId: createUserId.trim(),
        type: createType,
        stageName: createStageName.trim() || undefined,
        labelName: createLabelName.trim() || undefined,
      });
      toast.success('Artist account created');
      setCreateOpen(false);
      setCreateUserId('');
      setCreateStageName('');
      setCreateLabelName('');
      fetchVerifications();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create artist');
    } finally {
      setCreating(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-sky-600">Qwertymates</p>
              <h1 className="mt-1 text-3xl font-semibold text-slate-900">Artist / Publisher accounts</h1>
              <p className="mt-1 text-sm text-slate-600">Approve applications or create artist accounts directly.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-sky-700"
              >
                <UserPlus className="h-4 w-4" />
                Create artist
              </button>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to admin
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 backdrop-blur">
            <div className="mb-6 flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Search className="h-4 w-4" />
                Status:
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm"
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            {loading ? (
              <div className="flex justify-center py-24">
                <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
              </div>
            ) : verifications.length === 0 ? (
              <div className="py-16 text-center">
                <Music2 className="mx-auto h-16 w-16 text-slate-300" />
                <p className="mt-4 text-slate-600">
                  {statusFilter || statusFilter === 'all' ? 'No artist verifications found.' : 'No pending applications.'}
                </p>
                <button
                  onClick={() => setCreateOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-white font-medium hover:bg-sky-600"
                >
                  <UserPlus className="h-4 w-4" />
                  Create artist account
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {verifications.map((av) => (
                  <div
                    key={av._id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-12 w-12 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
                        {(av.userId as any)?.avatar ? (
                          <img src={(av.userId as any).avatar} alt="" className="h-full w-full rounded-full object-cover" />
                        ) : (
                          <User className="h-6 w-6 text-sky-600" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{(av.userId as any)?.name || 'Unknown'}</p>
                        <p className="text-sm text-slate-500 truncate">{(av.userId as any)?.email}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Type: {av.type} {av.stageName && `· ${av.stageName}`} {av.labelName && `· ${av.labelName}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2 py-1 rounded-lg text-xs font-medium ${
                          av.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                          av.status === 'rejected' ? 'bg-red-100 text-red-800' :
                          'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {av.status}
                      </span>
                      {av.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleApprove(av._id)}
                            className="p-2 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                            title="Approve"
                          >
                            <CheckCircle className="h-5 w-5" />
                          </button>
                          {rejectingId === av._id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Reason (optional)"
                                className="px-2 py-1 rounded border border-slate-200 text-sm w-32"
                              />
                              <button
                                onClick={() => handleReject(av._id)}
                                className="p-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200"
                              >
                                Reject
                              </button>
                              <button onClick={() => setRejectingId(null)} className="text-slate-500">Cancel</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setRejectingId(av._id)}
                              className="p-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200"
                              title="Reject"
                            >
                              <XCircle className="h-5 w-5" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {createOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Create artist account</h3>
              <p className="text-sm text-slate-600 mb-4">Assign artist verification to a user. They can then upload music on QwertyMusic.</p>
              <form onSubmit={handleCreateArtist} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">User ID *</label>
                  <input
                    type="text"
                    value={createUserId}
                    onChange={(e) => setCreateUserId(e.target.value)}
                    placeholder="MongoDB user _id"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                  <select
                    value={createType}
                    onChange={(e) => setCreateType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  >
                    <option value="artist">Artist</option>
                    <option value="company">Music company</option>
                    <option value="producer">Producer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stage / artist name (optional)</label>
                  <input
                    type="text"
                    value={createStageName}
                    onChange={(e) => setCreateStageName(e.target.value)}
                    placeholder="Stage name"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Label name (optional)</label>
                  <input
                    type="text"
                    value={createLabelName}
                    onChange={(e) => setCreateLabelName(e.target.value)}
                    placeholder="Label"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <button type="button" onClick={() => setCreateOpen(false)} className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !createUserId.trim()}
                    className="flex-1 px-4 py-2 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600 disabled:opacity-50"
                  >
                    {creating ? <Loader2 className="h-4 w-4 animate-spin inline" /> : 'Create artist'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}

export default function AdminArtistsPage() {
  return <ArtistsManagement />;
}
