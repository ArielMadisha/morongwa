'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, Loader2, Search, Trash2, Upload, X } from 'lucide-react';
import { morongwaAPI, messengerAPI, type MorongwaFileRow } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { userPublicDisplayName } from '@/lib/userDisplayLabel';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type RecipientUser = { _id: string; name?: string; username?: string };

export function MorongwaFilesSection() {
  const { user } = useAuth();
  const uid = String(user?._id || user?.id || '');
  const [files, setFiles] = useState<MorongwaFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [recipient, setRecipient] = useState<RecipientUser | null>(null);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [searchHits, setSearchHits] = useState<RecipientUser[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await morongwaAPI.getFiles();
      setFiles(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const q = recipientQuery.trim();
    if (!q || recipient) {
      setSearchHits([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      messengerAPI
        .searchUsers(q, 100)
        .then((r) => {
          const list = (r.data?.data ?? []) as RecipientUser[];
          setSearchHits(Array.isArray(list) ? list.filter((u) => String(u._id) !== uid) : []);
        })
        .catch(() => setSearchHits([]))
        .finally(() => setSearching(false));
    }, 220);
    return () => clearTimeout(timer);
  }, [recipientQuery, recipient, uid]);

  const pickRecipient = (u: RecipientUser) => {
    setRecipient(u);
    setRecipientQuery('');
    setSearchHits([]);
  };

  const clearRecipient = () => {
    setRecipient(null);
    setRecipientQuery('');
    setSearchHits([]);
  };

  const onUpload = async (file: File) => {
    if (!recipient?._id) {
      toast.error('Select a recipient');
      return;
    }
    setUploading(true);
    try {
      await morongwaAPI.sendFile(recipient._id, file);
      toast.success('File sent');
      void load();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const download = async (id: string, name: string) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const base = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${base}/morongwa/files/${id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed');
    }
  };

  const showResults = !recipient && recipientQuery.trim().length > 0;

  return (
    <div className="flex w-full flex-1 flex-col overflow-y-auto bg-white p-4 sm:p-6 min-h-[min(70dvh,calc(100dvh-11rem))] lg:h-full lg:min-h-0">
      <h1 className="text-xl font-bold text-slate-900 mb-2">Files</h1>
      <p className="text-sm text-slate-600 mb-4">Transfer large files (up to 100 MB) to other Qwertymates users.</p>
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="min-w-[200px] flex-1">
          <label className="text-xs font-semibold uppercase text-slate-500">Send to</label>
          {recipient ? (
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-violet-900">
                {userPublicDisplayName(recipient)}
              </span>
              <button
                type="button"
                onClick={clearRecipient}
                className="shrink-0 rounded p-1 text-violet-600 hover:bg-violet-100"
                aria-label="Clear recipient"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={recipientQuery}
                onChange={(e) => setRecipientQuery(e.target.value)}
                placeholder="Search name, username or email…"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
              {showResults ? (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {searching ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                    </div>
                  ) : searchHits.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-slate-500">No users found — try another name or @username.</p>
                  ) : (
                    searchHits.map((u) => (
                      <button
                        key={u._id}
                        type="button"
                        onClick={() => pickRecipient(u)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="min-w-0 truncate font-medium text-slate-900">{userPublicDisplayName(u)}</span>
                        {u.username ? <span className="shrink-0 text-xs text-slate-500">@{u.username}</span> : null}
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          )}
          {!recipient ? (
            <p className="mt-1.5 text-xs text-slate-500">Search to find any Qwertymates user — not limited to recent contacts.</p>
          ) : null}
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload file
          <input type="file" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); e.target.value = ''; }} />
        </label>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-violet-600" /></div>
      ) : files.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-12">No shared files yet</p>
      ) : (
        <ul className="space-y-2">
          {files.map((f) => {
            const senderId = typeof f.senderId === 'object' ? f.senderId?._id : f.senderId;
            const isMine = String(senderId) === uid;
            const other = isMine
              ? (typeof f.recipientId === 'object' ? f.recipientId?.name : 'Recipient')
              : (typeof f.senderId === 'object' ? f.senderId?.name : 'Sender');
            return (
              <li key={f._id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{f.originalName}</p>
                  <p className="text-xs text-slate-500">{formatBytes(f.size)} · {isMine ? `To ${other}` : `From ${other}`}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => void download(f._id, f.originalName)} className="rounded-lg p-2 text-violet-600 hover:bg-violet-50" aria-label="Download">
                    <Download className="h-4 w-4" />
                  </button>
                  {isMine ? (
                    <button type="button" onClick={async () => { await morongwaAPI.deleteFile(f._id); void load(); }} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
