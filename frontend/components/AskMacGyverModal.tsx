'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Wrench, X } from 'lucide-react';
import { macgyverAPI, getImageUrl } from '@/lib/api';
import { MacGyverImagePicker } from '@/components/MacGyverImagePicker';

export type AskMacGyverBrowseHit = {
  stores: Array<{ _id: string; name: string; slug: string; type?: string; country?: string }>;
  users: any[];
  products: any[];
  tvPosts: any[];
  musicResults: any[];
};

type AskMacGyverModalProps = {
  open: boolean;
  onClose: () => void;
  user: { _id?: string; id?: string } | null;
  query: string;
  onQueryChange: (q: string) => void;
  loading: boolean;
  hasResults: boolean;
  browse: AskMacGyverBrowseHit;
  /** When internal browse is empty, auto-call MacGyver for an external answer. */
  autoAskOnEmpty?: boolean;
  /** Photo from the header camera — auto-runs image search when the modal opens. */
  pendingImageFile?: File | null;
  onPendingImageConsumed?: () => void;
  onAnswer?: (text: string) => void;
};

export function AskMacGyverModal({
  open,
  onClose,
  user,
  query,
  onQueryChange,
  loading,
  hasResults,
  browse,
  autoAskOnEmpty = true,
  pendingImageFile = null,
  onPendingImageConsumed,
  onAnswer,
}: AskMacGyverModalProps) {
  const router = useRouter();
  const autoAskedRef = useRef<string | null>(null);
  const imageConsumedRef = useRef<File | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const resetModal = () => {
    setResponse(null);
    setImagePreview(null);
    setImageFile(null);
    autoAskedRef.current = null;
    imageConsumedRef.current = null;
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handleAskResponse = (data: any) => {
    let text = '';
    if (data?.type === 'search' && data?.query) {
      onQueryChange(data.query);
      router.replace(`/search?q=${encodeURIComponent(data.query)}&macgyver=1`);
      text =
        data?.text ||
        `I found matches on Qwertymates for "${data.query}". Browse results below, or ask a fuller question for a written answer.`;
    } else {
      text = data?.text ?? 'No response.';
    }
    setResponse(text);
    if (text) onAnswer?.(text);
    if (data?.searchQuery && typeof data.searchQuery === 'string') {
      onQueryChange(data.searchQuery);
    }
  };

  const submitTextAsk = async (qOverride?: string) => {
    const q = (qOverride ?? query).trim();
    if (!q || askLoading) return;
    setAskLoading(true);
    setResponse(null);
    try {
      const res = await macgyverAPI.ask(q);
      handleAskResponse(res.data?.data);
    } catch (err: any) {
      setResponse(err.response?.data?.message || err.message || 'Something went wrong. Try again.');
    } finally {
      setAskLoading(false);
    }
  };

  const submitImageAsk = async (file: File) => {
    if (askLoading) return;
    setAskLoading(true);
    setResponse(null);
    try {
      const res = await macgyverAPI.askImage(file, query.trim() || undefined);
      handleAskResponse(res.data?.data);
    } catch (err: any) {
      setResponse(err.response?.data?.message || err.message || 'Image search failed. Try again.');
    } finally {
      setAskLoading(false);
    }
  };

  const startImageAsk = (file: File) => {
    setImageFile(file);
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    void submitImageAsk(file);
  };

  const qTrim = query.trim();

  useEffect(() => {
    if (!open || !user || !pendingImageFile) return;
    if (imageConsumedRef.current === pendingImageFile) return;
    imageConsumedRef.current = pendingImageFile;
    startImageAsk(pendingImageFile);
    onPendingImageConsumed?.();
  }, [open, user, pendingImageFile]);

  // After Qwertymates browse finds nothing, MacGyver searches outside and writes an answer.
  useEffect(() => {
    if (!open || !user || !autoAskOnEmpty) return;
    if (qTrim.length < 2 || loading || hasResults || askLoading || response) return;
    if (pendingImageFile || imageFile) return;
    if (autoAskedRef.current === qTrim) return;
    autoAskedRef.current = qTrim;
    void submitTextAsk(qTrim);
  }, [open, user, autoAskOnEmpty, qTrim, loading, hasResults, askLoading, response]);

  useEffect(() => {
    if (!open) autoAskedRef.current = null;
  }, [open, qTrim]);

  if (!open) return null;

  const { stores, users, products, tvPosts, musicResults } = browse;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} aria-hidden="true" />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2 min-w-0">
            <Wrench className="h-5 w-5 text-amber-500 shrink-0" />
            <span>Ask MacGyver</span>
            {user ? (
              <MacGyverImagePicker
                onPick={startImageAsk}
                disabled={askLoading}
                className="p-1 rounded-full text-slate-400 hover:text-amber-600 hover:bg-amber-50 shrink-0"
                iconClassName="h-4 w-4"
              />
            ) : null}
          </h3>
          <button onClick={handleClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {!user ? (
            <p className="text-slate-600">
              <Link href="/login" className="text-sky-600 hover:underline font-medium">Sign in</Link> to use Ask MacGyver – your AI assistant for Qwertymates and beyond.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-4">When there&apos;s no solution… MacGyver makes one.</p>

              {imagePreview && (
                <div className="mb-4 flex items-center gap-3">
                  <img src={imagePreview} alt="Selected" className="h-16 w-16 rounded-lg object-cover border border-slate-200" />
                  <p className="text-xs text-slate-500">{imageFile?.name || 'Image selected'}</p>
                </div>
              )}

              {response !== null && (
                <div className="mb-4 p-4 rounded-xl bg-slate-50 border border-slate-100 text-slate-700 whitespace-pre-wrap text-sm leading-relaxed">
                  {response}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitTextAsk();
                }}
                className="flex gap-2 items-center"
              >
                <MacGyverImagePicker
                  onPick={startImageAsk}
                  disabled={askLoading}
                  className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-amber-600 disabled:opacity-50 shrink-0"
                  iconClassName="h-5 w-5"
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    const v = e.target.value;
                    onQueryChange(v);
                  }}
                  onBlur={() => {
                    const v = query.trim();
                    if (!v) return;
                    router.replace(`/search?q=${encodeURIComponent(v)}&macgyver=1`);
                  }}
                  placeholder="Search or ask anything..."
                  disabled={askLoading}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:opacity-60 min-w-0"
                />
                <button
                  type="submit"
                  disabled={askLoading || !qTrim}
                  className="px-4 py-2 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {askLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Ask'}
                </button>
              </form>

              {qTrim.length >= 1 && loading && (
                <div className="mt-4 flex justify-center py-4">
                  <Loader2 className="h-6 w-6 text-amber-500 animate-spin" />
                  <span className="sr-only">Searching Qwertymates</span>
                </div>
              )}

              {qTrim.length >= 1 && !loading && !hasResults && !response && askLoading && (
                <div className="mt-4 flex items-center justify-center gap-2 py-4 text-sm text-slate-600">
                  <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
                  MacGyver is searching beyond Qwertymates…
                </div>
              )}

              {qTrim.length >= 1 && !loading && hasResults && (
                <div className="mt-4 space-y-4 max-h-64 overflow-y-auto">
                  <p className="text-sm font-medium text-slate-600">Results for &quot;{qTrim}&quot;</p>
                  {stores.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 mb-2">Stores</p>
                      <div className="space-y-2">
                        {stores.slice(0, 5).map((s) => (
                          <Link key={s._id} href={`/store/${s.slug}`} onClick={handleClose} className="block p-2 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700 truncate">
                            {s.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {users.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 mb-2">Users</p>
                      <div className="space-y-1">
                        {users.slice(0, 5).map((u) => (
                          <Link key={u._id} href={`/user/${u._id}`} onClick={handleClose} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                            <div className="h-10 w-10 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                              {u.avatar ? (
                                <img src={getImageUrl(u.avatar)} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-600 font-bold text-sm">
                                  {(u.name || '?')[0]}
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-slate-900 text-sm">{u.name || 'Unknown'}</p>
                              {u.username && <p className="text-xs text-slate-500">@{u.username}</p>}
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {products.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 mb-2">Products</p>
                      <div className="space-y-2">
                        {products.slice(0, 3).map((p) => (
                          <Link key={p._id} href={`/marketplace/product/${p._id}`} onClick={handleClose} className="block p-2 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700 truncate">
                            {p.title}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {tvPosts.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 mb-2">TV Posts</p>
                      <div className="space-y-2">
                        {tvPosts.slice(0, 3).map((v) => (
                          <Link key={v._id} href="/morongwa-tv" onClick={handleClose} className="block p-2 rounded-lg hover:bg-slate-50 transition-colors text-sm text-slate-700 truncate">
                            {v.caption || 'Video'}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {musicResults.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 mb-2">Music</p>
                      <div className="space-y-2">
                        {musicResults.slice(0, 3).map((m) => (
                          <Link key={m._id} href="/qwerty-music" onClick={handleClose} className="block p-2 rounded-lg hover:bg-slate-50 transition-colors text-sm text-slate-700 truncate">
                            {m.title} – {m.artist}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
