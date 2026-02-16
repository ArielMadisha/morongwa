'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getImageUrl } from '@/lib/api';
import { tvAPI } from '@/lib/api';
import { Plus } from 'lucide-react';
import { FollowButton } from '@/components/FollowButton';

export interface StatusItem {
  userId: string;
  name?: string;
  avatar?: string;
  isLive?: boolean;
  latestPost?: {
    _id: string;
    type: string;
    mediaUrls: string[];
    createdAt: string;
  } | null;
}

interface StatusesStripProps {
  currentUserId?: string;
  userAvatar?: string;
  stripBackgroundPic?: string;
  onAddStatus?: () => void;
}

export function StatusesStrip({ currentUserId, userAvatar, stripBackgroundPic, onAddStatus }: StatusesStripProps) {
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tvAPI
      .getStatuses()
      .then((res) => {
        const data = res.data?.data ?? res.data ?? [];
        setStatuses(Array.isArray(data) ? data : []);
      })
      .catch(() => setStatuses([]))
      .finally(() => setLoading(false));
  }, []);

  const thumbnail = (s: StatusItem) => {
    if (s.latestPost?.mediaUrls?.[0]) {
      return getImageUrl(s.latestPost.mediaUrls[0]);
    }
    return s.avatar ? getImageUrl(s.avatar) : undefined;
  };

  if (loading && statuses.length === 0) return null;

  const stripBgStyle = stripBackgroundPic
    ? { backgroundImage: `url(${getImageUrl(stripBackgroundPic)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {};

  return (
    <div
      ref={stripRef}
      className="flex gap-4 overflow-x-auto pb-2 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden min-h-[88px] rounded-xl px-3 py-2 items-start"
      style={stripBgStyle}
    >
      {onAddStatus && (
        <div className="flex-shrink-0 flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={onAddStatus}
            className="flex-shrink-0 relative flex flex-col items-center justify-center gap-0.5 cursor-pointer group w-14 h-14 rounded-full bg-sky-500 hover:bg-sky-600 text-white transition-colors border-0 overflow-hidden"
            aria-label="Create post"
          >
            {userAvatar ? (
              <>
                <img
                  src={getImageUrl(userAvatar)}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-sky-900/40 flex flex-col items-center justify-center">
                  <Plus className="h-5 w-5" strokeWidth={2.5} />
                </div>
              </>
            ) : (
              <Plus className="h-5 w-5" strokeWidth={2.5} />
            )}
          </button>
          <span className="text-[10px] font-semibold leading-tight text-slate-700">create</span>
        </div>
      )}
      {statuses.map((s) => {
        const uid = String(s.userId?._id ?? s.userId);
        return (
        <div
          key={uid}
          className="flex-shrink-0 flex flex-col items-center gap-1"
        >
          <Link
            href="/morongwa-tv"
            className="flex flex-col items-center gap-1 cursor-pointer group"
            aria-label={`View ${s.name || 'user'}'s story`}
          >
            <div className="relative">
              <div
                className={`w-14 h-14 rounded-full p-0.5 flex-shrink-0 bg-gradient-to-tr from-sky-500 via-purple-500 to-pink-500 ${
                  s.isLive ? 'animate-pulse' : ''
                }`}
              >
                <div className="w-full h-full rounded-full overflow-hidden bg-white p-0.5">
                  {thumbnail(s) ? (
                    <img
                      src={thumbnail(s)}
                      alt=""
                      className="w-full h-full object-cover rounded-full"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold text-lg">
                      {(s.name || '?')[0]}
                    </div>
                  )}
                </div>
              </div>
              {s.isLive && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white whitespace-nowrap">
                  LIVE
                </span>
              )}
            </div>
            <span className="text-[10px] font-semibold leading-tight text-slate-700 truncate max-w-[70px]">
              {s.name || 'Unknown'}
            </span>
          </Link>
          <div onClick={(e) => e.stopPropagation()}>
            <FollowButton targetUserId={uid} currentUserId={currentUserId} className="!px-2 !py-1 !text-[10px]" />
          </div>
        </div>
      );
      })}
    </div>
  );
}
