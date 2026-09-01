'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { tvAPI, followsAPI, getImageUrl } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { FollowButton } from '@/components/FollowButton';
import { WallRightRailExtras } from '@/components/WallRightRailExtras';
import { Hash, Plus, TrendingUp } from 'lucide-react';
import { wallHashtagSearchUrl, wallStartTopicUrl } from '@/lib/hashtagQuery';
import { toAppealingDisplayName, userPublicDisplayName } from '@/lib/userDisplayLabel';

interface AdvertSlotProps {
  /** When true, slot sticks below fixed header */
  belowHeader?: boolean;
  /** Optional content to render below Qwerty Users */
  bottomContent?: React.ReactNode;
  /** When true, sidebar flows with page content (no sticky/max-height) so page scroll reveals Sponsored + Birthdays */
  scrollWithPage?: boolean;
  /** Cap Qwerty Users suggestions (Wall uses 4; Sponsored then Birthdays below in the rail). */
  suggestedLimit?: number;
  /** Bump after new posts so trending refetches (e.g. wall CreatePostModal onCreated). */
  trendingRefreshKey?: number;
  /** When set (e.g. wall filtered by `#tag`), show related topics + start-topic CTA instead of global trending. */
  activeHashtag?: string;
  /** Wall-only: open create modal with the active hashtag prefilled. */
  onStartTopicWithHashtag?: (tag: string) => void;
  /** Morongwa hub: skip mobile trending strip so section content uses full width. */
  hideMobileStrip?: boolean;
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

const TRENDING_POLL_MS = 90_000;
const SUGGESTED_USERS_POLL_MS = 120_000;

function TrendingList({
  items,
  emptyLabel,
  onItemClick,
}: {
  items: { tag: string; count: number }[];
  emptyLabel?: string;
  onItemClick?: (tag: string) => void;
}) {
  if (items.length === 0) {
    return emptyLabel ? <p className="text-[11px] text-slate-500 leading-snug">{emptyLabel}</p> : null;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((h) => (
        <li key={h.tag}>
          {onItemClick ? (
            <button
              type="button"
              onClick={() => onItemClick(h.tag)}
              className="flex w-full items-start gap-1.5 text-left text-xs text-slate-800 hover:text-sky-600 transition-colors leading-snug"
            >
              <TrendingUp className="h-3.5 w-3.5 text-sky-500 shrink-0 mt-0.5" />
              <span className="min-w-0 break-words">
                <span className="font-medium">#{h.tag}</span>{' '}
                <span className="text-slate-500 text-[11px]">
                  {h.count} post{h.count !== 1 ? 's' : ''} this week
                </span>
              </span>
            </button>
          ) : (
            <Link
              href={wallHashtagSearchUrl(h.tag)}
              className="flex items-start gap-1.5 text-xs text-slate-800 hover:text-sky-600 transition-colors leading-snug"
            >
              <TrendingUp className="h-3.5 w-3.5 text-sky-500 shrink-0 mt-0.5" />
              <span className="min-w-0 break-words">
                <span className="font-medium">#{h.tag}</span>{' '}
                <span className="text-slate-500 text-[11px]">
                  {h.count} post{h.count !== 1 ? 's' : ''} this week
                </span>
              </span>
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AdvertSlot({
  belowHeader: _belowHeader,
  bottomContent,
  scrollWithPage = true,
  suggestedLimit = 5,
  trendingRefreshKey,
  activeHashtag,
  onStartTopicWithHashtag,
  hideMobileStrip,
}: AdvertSlotProps = {}) {
  const { user } = useAuth();
  const [trendingHashtags, setTrendingHashtags] = useState<{ tag: string; count: number }[]>([]);
  const [relatedHashtags, setRelatedHashtags] = useState<{ tag: string; count: number }[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const normalizedActive = activeHashtag?.replace(/^#/, '').trim().toLowerCase() || undefined;

  const loadTrendingHashtags = useCallback(() => {
    return tvAPI
      .getTrendingHashtags(4, 7, 'latest')
      .then((res) => {
        const d = res.data?.data ?? res.data ?? [];
        const arr = Array.isArray(d) ? d : [];
        setTrendingHashtags(arr.slice(0, 4));
      })
      .catch(() => setTrendingHashtags([]));
  }, []);

  const loadRelatedHashtags = useCallback(() => {
    if (!normalizedActive) {
      setRelatedHashtags([]);
      return Promise.resolve();
    }
    return tvAPI
      .getRelatedHashtags(normalizedActive, 8, 7)
      .then((res) => {
        const d = res.data?.data ?? res.data ?? [];
        const arr = Array.isArray(d) ? d : [];
        setRelatedHashtags(arr.slice(0, 8));
      })
      .catch(() => setRelatedHashtags([]));
  }, [normalizedActive]);

  useEffect(() => {
    if (normalizedActive) {
      void loadRelatedHashtags();
    } else {
      void loadTrendingHashtags();
    }
  }, [normalizedActive, loadTrendingHashtags, loadRelatedHashtags, trendingRefreshKey]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (normalizedActive) void loadRelatedHashtags();
      else void loadTrendingHashtags();
    }, TRENDING_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        if (normalizedActive) void loadRelatedHashtags();
        else void loadTrendingHashtags();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [normalizedActive, loadTrendingHashtags, loadRelatedHashtags]);

  useEffect(() => {
    if (!user?._id && !(user as { id?: string })?.id) {
      setSuggestedUsers([]);
      return;
    }
    const limit = Math.max(1, Math.min(8, Math.floor(suggestedLimit) || 5));
    const loadSuggested = () => {
      followsAPI
        .getSuggested({ limit })
        .then((res) => {
          const d = res.data?.data ?? res.data ?? [];
          setSuggestedUsers(Array.isArray(d) ? d.slice(0, limit) : []);
        })
        .catch(() => setSuggestedUsers([]));
    };
    loadSuggested();
    const interval = window.setInterval(loadSuggested, SUGGESTED_USERS_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadSuggested();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?._id, (user as { id?: string })?.id, trendingRefreshKey, suggestedLimit]);

  const displayItems = normalizedActive ? relatedHashtags : trendingHashtags;
  const panelTitle = normalizedActive ? `Related to #${normalizedActive}` : 'Trending now';
  const mobileTitle = normalizedActive ? `Related to #${normalizedActive}` : 'Trending now';
  const emptyRelated =
    normalizedActive && relatedHashtags.length === 0
      ? 'No related topics yet — start one below.'
      : undefined;

  const startTopicButton = normalizedActive ? (
    onStartTopicWithHashtag ? (
      <button
        type="button"
        onClick={() => onStartTopicWithHashtag(normalizedActive)}
        className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 text-[11px] font-semibold text-white hover:bg-sky-600 transition-colors"
      >
        <Plus className="h-3.5 w-3.5 shrink-0" />
        Start topic with #{normalizedActive}
      </button>
    ) : (
      <Link
        href={wallStartTopicUrl(normalizedActive, !!user)}
        className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 text-[11px] font-semibold text-white hover:bg-sky-600 transition-colors"
      >
        <Plus className="h-3.5 w-3.5 shrink-0" />
        Start topic with #{normalizedActive}
      </Link>
    )
  ) : null;

  const headerOffset = 'top-0';
  // Trending + Users + Sponsored×2 + Birthdays is taller than the viewport. A sticky
  // max-height rail with overflow-y-auto (and site-hidden scrollbars) clipped
  // the second Sponsored ad and Birthdays with no discoverable scroll cue.
  // Default: rail grows with content; parent page scrolls (scrollWithPage).
  // Sticky is opt-out only — never invent an invisible scroll trap.
  const asideHeight = '';
  const asideOverflow = 'overflow-visible';
  const asideSticky = scrollWithPage ? '' : `sticky ${headerOffset} self-start`;

  const navigateToHashtag = (tag: string) => {
    window.location.href = wallHashtagSearchUrl(tag);
  };

  return (
    <>
      {/* Mobile: horizontal trending strip (hidden on Morongwa hub — section content needs full width) */}
      {!hideMobileStrip && (displayItems.length > 0 || normalizedActive) && (
        <div className="order-1 flex w-full min-w-0 max-w-full flex-shrink-0 flex-col gap-2 px-3 py-2 lg:hidden">
          {normalizedActive ? (
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{mobileTitle}</p>
          ) : (
            <Link
              href="/trending"
              className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold hover:text-sky-600 hover:underline cursor-pointer"
            >
              {mobileTitle}
            </Link>
          )}
          {normalizedActive && (
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {onStartTopicWithHashtag ? (
                <button
                  type="button"
                  onClick={() => onStartTopicWithHashtag(normalizedActive)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  Start #{normalizedActive}
                </button>
              ) : (
                <Link
                  href={wallStartTopicUrl(normalizedActive, !!user)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  Start #{normalizedActive}
                </Link>
              )}
            </div>
          )}
          {displayItems.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 px-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {displayItems.map((h) => (
                <Link
                  key={h.tag}
                  href={wallHashtagSearchUrl(h.tag)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 transition-colors hover:border-sky-200 hover:bg-sky-50"
                >
                  <TrendingUp className="h-4 w-4 shrink-0 text-sky-500" />
                  <span className="font-medium">#{h.tag}</span>
                  <span className="text-xs text-slate-500">
                    {h.count} post{h.count !== 1 ? 's' : ''}
                  </span>
                </Link>
              ))}
            </div>
          )}
          {emptyRelated && displayItems.length === 0 ? (
            <p className="text-xs text-slate-500">{emptyRelated}</p>
          ) : null}
        </div>
      )}
      <aside
        className={`${asideSticky} order-3 hidden w-64 min-h-0 shrink-0 flex-col gap-3 pt-0 pr-2 lg:flex xl:w-72 lg:pr-4 ${asideOverflow} ${asideHeight}`}
      >
        <div className="space-y-4 pb-3">
          {(displayItems.length > 0 || normalizedActive) && (
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              {normalizedActive ? (
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <Hash className="h-3 w-3" />
                  {panelTitle}
                </p>
              ) : (
                <Link
                  href="/trending"
                  className="mb-1.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-sky-600 hover:underline cursor-pointer"
                >
                  {panelTitle}
                </Link>
              )}
              {normalizedActive ? (
                <>
                  {startTopicButton}
                  <div className="mt-2">
                    <TrendingList items={relatedHashtags} emptyLabel={emptyRelated} />
                  </div>
                  <Link
                    href={`/hashtag/${encodeURIComponent(normalizedActive)}`}
                    className="mt-2 block text-center text-[11px] font-medium text-sky-600 hover:underline"
                  >
                    Explore creators using #{normalizedActive}
                  </Link>
                </>
              ) : (
                <TrendingList items={trendingHashtags} onItemClick={navigateToHashtag} />
              )}
            </div>
          )}
          {suggestedUsers.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5 font-semibold">Qwerty Users</p>
              <ul className="space-y-2.5">
                {suggestedUsers.map((u) => {
                  const displayName =
                    toAppealingDisplayName(
                      userPublicDisplayName({
                        name: u.name,
                        username: u.username,
                        isSchoolAccount: (u as { isSchoolAccount?: boolean }).isSchoolAccount,
                      })
                    ) || 'User';
                  return (
                    <li key={u._id} className="flex items-start gap-2">
                      <Link href={`/user/${u._id}`} className="shrink-0 pt-0.5">
                        <div className="h-9 w-9 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center">
                          {u.avatar ? (
                            <img src={getImageUrl(u.avatar)} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-sm font-medium text-slate-600">
                              {displayName.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/user/${u._id}`}
                          className="font-medium text-[11px] leading-snug text-slate-900 hover:text-sky-600 line-clamp-2"
                          title={displayName}
                        >
                          {displayName}
                        </Link>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {(u.followerCount ?? 0)} Follower{(u.followerCount ?? 0) !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <FollowButton
                        targetUserId={u._id}
                        currentUserId={user?._id || (user as { id?: string })?.id}
                        targetIsPrivate={(u as { isPrivate?: boolean }).isPrivate}
                        className="shrink-0 self-center !px-2 !py-1 !text-[11px]"
                        onFollowChange={() => setSuggestedUsers((prev) => prev.filter((x) => x._id !== u._id))}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <WallRightRailExtras refreshKey={trendingRefreshKey ?? 0} />
          {bottomContent}
        </div>
      </aside>
    </>
  );
}
