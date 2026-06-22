'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Hash, Loader2, ArrowRight, TrendingUp } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import { tvAPI, getImageUrl } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { wallHashtagSearchUrl } from '@/lib/hashtagQuery';

type AccountRow = { _id: string; name?: string; avatar?: string; username?: string };

export default function HashtagExplorePage() {
  const params = useParams();
  const rawTag = params.tag as string;
  const tag = useMemo(() => decodeURIComponent(rawTag || '').replace(/^#/, '').trim(), [rawTag]);
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [relatedHashtags, setRelatedHashtags] = useState<{ tag: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const joinPath = `/wall?create=1&hashtag=${encodeURIComponent(tag)}&q=%23${encodeURIComponent(tag)}`;
  const joinHref = user ? joinPath : `/login?returnTo=${encodeURIComponent(joinPath)}`;

  const loadRelated = useCallback(() => {
    if (!tag || tag.length > 80) {
      setRelatedHashtags([]);
      return Promise.resolve();
    }
    return tvAPI
      .getRelatedHashtags(tag, 8, 7)
      .then((res) => {
        const data = res.data?.data ?? res.data ?? [];
        setRelatedHashtags(Array.isArray(data) ? data : []);
      })
      .catch(() => setRelatedHashtags([]));
  }, [tag]);

  useEffect(() => {
    if (!tag || tag.length > 80) {
      setAccounts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [accountsRes] = await Promise.all([
          tvAPI.getHashtagAccounts(tag),
          loadRelated(),
        ]);
        const data = accountsRes.data?.data ?? accountsRes.data ?? [];
        if (!cancelled) setAccounts(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setAccounts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tag, loadRelated]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand-50/40 text-slate-900">
      <SiteHeader minimal />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 mb-8">
          <div>
            <p className="text-sm font-medium text-brand-600 mb-1 flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Hashtag
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">#{tag || '…'}</h1>
            <p className="text-slate-600 mt-2 max-w-xl text-sm sm:text-base">
              Creators who have posted with this hashtag on Qwerty TV / the wall. Order is shuffled so everyone gets a fair chance to be discovered.
            </p>
          </div>
          <Link
            href={joinHref}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 text-white font-semibold px-5 py-3 shadow-sm hover:bg-brand-600 transition-colors shrink-0"
          >
            Join this hashtag
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <p className="text-xs text-slate-500 mb-4">
          Join opens the create flow on your wall with this tag prefilled (sign in if needed).{' '}
          <Link href={wallHashtagSearchUrl(tag)} className="text-brand-600 font-semibold hover:underline">
            View posts on the wall
          </Link>
        </p>

        {relatedHashtags.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Related trending topics
            </p>
            <ul className="flex flex-wrap gap-2">
              {relatedHashtags.map((h) => (
                <li key={h.tag}>
                  <Link
                    href={wallHashtagSearchUrl(h.tag)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 hover:border-brand-200 hover:bg-brand-50 transition-colors"
                  >
                    <TrendingUp className="h-3.5 w-3.5 text-brand-500 shrink-0" />
                    #{h.tag}
                    <span className="text-xs text-slate-500">{h.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-10 w-10 text-brand-500 animate-spin" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-10 text-center text-slate-600">
            No public posts with this hashtag yet. Be the first to{' '}
            <Link href={joinHref} className="text-brand-600 font-semibold hover:underline">
              join #{tag}
            </Link>
            .
          </div>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {accounts.map((a) => {
              const href = `/user/${a._id}`;
              const label = a.name || a.username || 'Member';
              const av = a.avatar ? getImageUrl(a.avatar) : '';
              return (
                <li key={a._id}>
                  <Link
                    href={href}
                    className="flex flex-col items-center text-center rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow-md hover:border-brand-200 transition-all"
                  >
                    <div className="h-16 w-16 rounded-full bg-slate-100 overflow-hidden mb-3 ring-2 ring-white shadow">
                      {av ? (
                        <img src={av} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-slate-400 text-lg font-semibold">
                          {label.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="font-medium text-slate-900 text-sm line-clamp-2">{label}</span>
                    {a.username ? (
                      <span className="text-xs text-slate-500">@{a.username}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
