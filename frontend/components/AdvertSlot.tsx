'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { tvAPI, followsAPI, getImageUrl } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { FollowButton } from '@/components/FollowButton';
import { TrendingUp } from 'lucide-react';

interface AdvertSlotProps {
  /** When true, slot sticks below fixed header */
  belowHeader?: boolean;
  /** Optional content to render below Qwerty Users */
  bottomContent?: React.ReactNode;
  /** When true, sidebar flows with page content (no fixed height) so scroll works from anywhere */
  scrollWithPage?: boolean;
}

/**
 * Web: Right-hand advert column - top square (sponsored/random ads only).
 * Use on all app pages for consistent design.
 */
interface SuggestedUser {
  _id: string;
  name: string;
  avatar?: string;
  username?: string;
  followerCount?: number;
}

export function AdvertSlot({ belowHeader, bottomContent, scrollWithPage }: AdvertSlotProps = {}) {
  const { user } = useAuth();
  const [trendingHashtags, setTrendingHashtags] = useState<{ tag: string; count: number }[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);

  useEffect(() => {
    tvAPI.getTrendingHashtags(5)
      .then((res) => {
        const d = res.data?.data ?? res.data ?? [];
        const arr = Array.isArray(d) ? d : [];
        setTrendingHashtags(arr.slice(0, 5));
      })
      .catch(() => setTrendingHashtags([]));
  }, []);

  useEffect(() => {
    if (!user?._id && !(user as { id?: string })?.id) {
      setSuggestedUsers([]);
      return;
    }
    followsAPI.getSuggested({ limit: 5 })
      .then((res) => {
        const d = res.data?.data ?? res.data ?? [];
        setSuggestedUsers(Array.isArray(d) ? d : []);
      })
      .catch(() => setSuggestedUsers([]));
  }, [user?._id, (user as { id?: string })?.id]);

  const headerOffset = belowHeader ? 'top-14' : 'top-0';
  const asideHeight = scrollWithPage ? '' : (belowHeader ? 'h-[calc(100vh-3.5rem)]' : 'h-screen');
  const asideOverflow = scrollWithPage ? 'overflow-visible' : 'overflow-hidden';
  const asideSticky = scrollWithPage ? '' : `sticky ${headerOffset} self-start`;
  return (
    <>
    {/* Mobile: horizontal trending strip - appears above feed when container is flex-col */}
    {trendingHashtags.length > 0 && (
      <div className="lg:hidden flex-shrink-0 px-4 py-2 overflow-x-auto scrollbar-thin order-1">
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2 font-semibold">Trending now</p>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          {trendingHashtags.map((h) => (
            <Link
              key={h.tag}
              href={`/wall?q=%23${encodeURIComponent(h.tag)}`}
              className="flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm text-slate-800 hover:bg-sky-50 hover:border-sky-200 transition-colors"
            >
              <TrendingUp className="h-4 w-4 text-sky-500 shrink-0" />
              <span className="font-medium">#{h.tag}</span>
              <span className="text-slate-500 text-xs">{h.count} post{h.count !== 1 ? 's' : ''}</span>
            </Link>
          ))}
        </div>
      </div>
    )}
    <aside className={`${asideSticky} hidden lg:flex flex-col w-64 xl:w-80 shrink-0 gap-4 pt-0 pr-2 lg:pr-4 ${asideOverflow} ${asideHeight} order-3`}>
      <div className="space-y-6">
        {trendingHashtags.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2 font-semibold">Trending now</p>
            <ul className="space-y-2">
              {trendingHashtags.map((h) => (
                <li key={h.tag}>
                  <Link
                    href={`/wall?q=%23${encodeURIComponent(h.tag)}`}
                    className="flex items-center gap-2 text-sm text-slate-800 hover:text-sky-600 transition-colors"
                  >
                    <TrendingUp className="h-4 w-4 text-sky-500 shrink-0" />
                    <span className="font-medium">#{h.tag}</span>
                    <span className="text-slate-500 text-xs">{h.count} public post{h.count !== 1 ? 's' : ''}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {suggestedUsers.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2 font-semibold">Qwerty Users</p>
            <ul className="space-y-2">
              {suggestedUsers.map((u) => (
                <li key={u._id} className="flex items-center gap-3">
                  <Link href={`/user/${u._id}`} className="shrink-0">
                    <div className="h-10 w-10 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center">
                      {u.avatar ? (
                        <img src={getImageUrl(u.avatar)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-sm font-medium text-slate-600">
                          {(u.name || 'U').charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link href={`/user/${u._id}`} className="font-semibold text-xs text-slate-900 block hover:text-sky-600 break-words">
                      {u.name || (u.username ? `@${u.username}` : 'User')}
                    </Link>
                    <p className="text-[8px] text-slate-500">
                      {(u.followerCount ?? 0)} Follower{(u.followerCount ?? 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <FollowButton
                    targetUserId={u._id}
                    currentUserId={user?._id || (user as { id?: string })?.id}
                    targetIsPrivate={(u as { isPrivate?: boolean }).isPrivate}
                    className="shrink-0 px-3 py-1.5 text-xs"
                    onFollowChange={() => setSuggestedUsers((prev) => prev.filter((x) => x._id !== u._id))}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
        {bottomContent}
      </div>
    </aside>
    </>
  );
}
