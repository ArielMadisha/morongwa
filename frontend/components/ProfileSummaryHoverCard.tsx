'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  X,
  MessageCircle,
  MapPin,
  Store,
  GraduationCap,
  User as UserIcon,
  Loader2,
  ExternalLink,
  Music2,
} from 'lucide-react';
import { getImageUrl } from '@/lib/api';
import { FollowButton } from '@/components/FollowButton';
import { userPublicDisplayName, userAtUsername } from '@/lib/userDisplayLabel';
import { inferIsSchoolProfile } from '@/lib/schoolProfile';
import { fetchProfileSummary, formatSocialCount, type ProfileSummaryData } from '@/lib/profileSummaryCache';

const SHOW_DELAY_MS = 450;
const HIDE_DELAY_MS = 280;

type Props = {
  userId: string;
  displayName?: string;
  avatar?: string;
  currentUserId?: string;
  profileHref: string;
  /** Marketplace / supplier post — show store category line */
  isStore?: boolean;
  children: ReactNode;
  className?: string;
};

function inferIsMusicArtist(data: ProfileSummaryData | null): boolean {
  const u = data?.user;
  if (!u) return false;
  if (u.artistVerified === true) return true;
  const uploads = Number(data?.musicUploadCount ?? 0);
  const audioPosts = Number(data?.musicCount ?? 0);
  return uploads > 0 || audioPosts > 0;
}

function accountCategoryLine(data: ProfileSummaryData | null, isStore?: boolean): string {
  if (isStore) return 'Marketplace seller';
  const u = data?.user;
  if (u && inferIsSchoolProfile(u as { isSchoolAccount?: boolean; name?: string; username?: string })) {
    return 'School';
  }
  const roles = Array.isArray(u?.role) ? (u.role as string[]) : u?.role ? [String(u.role)] : [];
  if (roles.includes('runner')) return 'Runner';
  if (inferIsMusicArtist(data)) return 'Music Artist';
  return 'Content Creator';
}

function profileStatsLine(summary: ProfileSummaryData | null): string {
  const followers = summary?.followerCount ?? 0;
  const posts = summary?.postCount ?? 0;
  const catalogUploads = summary?.musicUploadCount ?? 0;
  const audioPosts = summary?.musicCount ?? 0;
  const musicUploads = catalogUploads > 0 ? catalogUploads : audioPosts;
  const parts = [
    `${formatSocialCount(followers)} follower${followers === 1 ? '' : 's'}`,
  ];
  if (posts > 0) {
    parts.push(`${formatSocialCount(posts)} post${posts === 1 ? '' : 's'}`);
  }
  if (musicUploads > 0) {
    parts.push(`${formatSocialCount(musicUploads)} music upload${musicUploads === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

export function ProfileSummaryHoverCard({
  userId,
  displayName,
  avatar,
  currentUserId,
  profileHref,
  isStore,
  children,
  className = '',
}: Props) {
  const router = useRouter();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ProfileSummaryData | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const clearTimers = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cardW = 340;
    const margin = 8;
    let left = rect.left;
    if (left + cardW > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - cardW - margin);
    }
    setPos({ top: rect.bottom + margin, left });
  }, []);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    const data = await fetchProfileSummary(userId);
    setSummary(data);
    setLoading(false);
  }, [userId]);

  const scheduleShow = useCallback(() => {
    clearTimers();
    hideTimerRef.current = null;
    showTimerRef.current = setTimeout(() => {
      updatePosition();
      setOpen(true);
      void loadSummary();
    }, SHOW_DELAY_MS);
  }, [clearTimers, updatePosition, loadSummary]);

  const scheduleHide = useCallback(() => {
    clearTimers();
    hideTimerRef.current = setTimeout(() => setOpen(false), HIDE_DELAY_MS);
  }, [clearTimers]);

  const keepOpen = useCallback(() => {
    clearTimers();
  }, [clearTimers]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updatePosition]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const isSelf = !!(currentUserId && userId && String(currentUserId) === String(userId));
  const resolvedUser = summary?.user;
  const name =
    displayName ||
    (resolvedUser ? userPublicDisplayName(resolvedUser as { name?: string; username?: string; email?: string }) : 'User');
  const handle = resolvedUser ? userAtUsername(resolvedUser as { username?: string; name?: string }) : '';
  const avatarSrc =
    (resolvedUser?.avatar ? getImageUrl(String(resolvedUser.avatar)) : '') ||
    (avatar ? getImageUrl(avatar) : '');
  const category = accountCategoryLine(summary, isStore);
  const isMusicArtist = inferIsMusicArtist(summary);
  const isSchool = resolvedUser
    ? inferIsSchoolProfile(resolvedUser as { isSchoolAccount?: boolean; name?: string; username?: string })
    : false;
  const locationLabel = String(
    (resolvedUser?.publicProfileLocation as { label?: string } | undefined)?.label || ''
  ).trim();
  const schoolEmail = String(resolvedUser?.schoolPublicEmail || '').trim();

  const card =
    open && mounted ? (
      <div
        ref={cardRef}
        className="fixed z-[180] w-[min(340px,calc(100vw-16px))] rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15"
        style={{ top: pos.top, left: pos.left }}
        onMouseEnter={keepOpen}
        onMouseLeave={scheduleHide}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${name} profile summary`}
      >
        <div className="flex items-start gap-3 p-4 pb-3">
          <Link href={profileHref} className="shrink-0" onClick={() => setOpen(false)}>
            <span className="block h-20 w-20 overflow-hidden rounded-full bg-slate-100 ring-2 ring-sky-100">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-slate-400">
                  <UserIcon className="h-8 w-8" />
                </span>
              )}
            </span>
          </Link>
          <div className="min-w-0 flex-1 pt-1">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={profileHref}
                className="min-w-0 text-base font-bold text-slate-900 hover:underline leading-snug"
                onClick={() => setOpen(false)}
              >
                {name}
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close profile summary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {handle ? <p className="mt-0.5 truncate text-sm text-slate-500">{handle}</p> : null}
          </div>
        </div>

        <div className="space-y-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-700">
          {loading && !summary ? (
            <div className="flex items-center gap-2 py-2 text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading profile…
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2">
                {isSchool ? (
                  <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                ) : isStore ? (
                  <Store className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                ) : isMusicArtist ? (
                  <Music2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                ) : (
                  <UserIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                )}
                <span>{category}</span>
              </div>
              {locationLabel ? (
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span className="line-clamp-2">{locationLabel}</span>
                </div>
              ) : null}
              {schoolEmail ? (
                <div className="flex items-start gap-2">
                  <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <a href={`mailto:${schoolEmail}`} className="truncate text-sky-600 hover:underline">
                    {schoolEmail}
                  </a>
                </div>
              ) : null}
              <div className="flex items-center gap-2 pt-0.5">
                <UserIcon className="h-4 w-4 shrink-0 text-slate-400" />
                <span>{profileStatsLine(summary)}</span>
              </div>
            </>
          )}
        </div>

        {!isSelf && currentUserId ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 p-3">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push(`/messages?with=${encodeURIComponent(userId)}`);
              }}
              className="inline-flex flex-1 min-w-[120px] items-center justify-center gap-2 rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-600"
            >
              <MessageCircle className="h-4 w-4" />
              Message
            </button>
            <FollowButton
              targetUserId={userId}
              currentUserId={currentUserId}
              targetIsPrivate={!!resolvedUser?.isPrivate}
              className="!rounded-lg !border !border-slate-200 !bg-slate-100 !px-3 !py-2 !text-sm !font-semibold !text-slate-800 hover:!bg-slate-200"
            />
            <Link
              href={profileHref}
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
              aria-label="View full profile"
              title="View profile"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="border-t border-slate-100 p-3">
            <Link
              href={profileHref}
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
            >
              <ExternalLink className="h-4 w-4" />
              View profile
            </Link>
          </div>
        )}
      </div>
    ) : null;

  if (!userId) return <>{children}</>;

  return (
    <span
      ref={anchorRef}
      className={`relative inline-flex min-w-0 ${className}`}
      onMouseEnter={scheduleShow}
      onMouseLeave={scheduleHide}
      onFocus={scheduleShow}
      onBlur={scheduleHide}
    >
      {children}
      {mounted && card ? createPortal(card, document.body) : null}
    </span>
  );
}
