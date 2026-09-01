'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, TrendingUp } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import { tvAPI } from '@/lib/api';
import { wallHashtagSearchUrl } from '@/lib/hashtagQuery';

export default function TrendingHashtagsPage() {
  const [items, setItems] = useState<{ tag: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await tvAPI.getTrendingHashtags(40, 7, 'latest');
        const data = res.data?.data ?? res.data ?? [];
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand-50/40 text-slate-900">
      <SiteHeader minimal />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <Link
          href="/wall"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-sky-600 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to wall
        </Link>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">Trending now</h1>
        <p className="text-slate-600 text-sm sm:text-base mb-8 max-w-xl">
          Hashtags gaining posts on Qwertymates this week. Tap one to see related wall posts.
        </p>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-10 w-10 text-brand-500 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-10 text-center text-slate-600">
            No trending hashtags yet. Post with a hashtag on the wall to get started.
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((h, i) => (
              <li key={h.tag}>
                <Link
                  href={wallHashtagSearchUrl(h.tag)}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-800 shadow-sm hover:border-sky-200 hover:bg-sky-50/50 transition-colors"
                >
                  <span className="text-xs font-semibold text-slate-400 w-6 shrink-0 pt-0.5 tabular-nums">
                    {i + 1}
                  </span>
                  <TrendingUp className="h-4 w-4 text-sky-500 shrink-0 mt-0.5" />
                  <span className="min-w-0 flex-1 leading-snug">
                    <span className="font-semibold">#{h.tag}</span>{' '}
                    <span className="text-sm text-slate-500">
                      {h.count} post{h.count !== 1 ? 's' : ''} this week
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
