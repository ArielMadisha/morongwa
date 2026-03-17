'use client';

import { useState, useEffect } from 'react';
import { followsAPI } from '@/lib/api';
import { UserPlus, UserCheck, Loader2, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

const FOLLOW_STATUS_TTL_MS = 60_000;
const followStatusCache = new Map<string, { following: boolean; status: 'accepted' | 'pending' | null; ts: number }>();
const inflightStatusRequests = new Map<string, Promise<{ following: boolean; status: 'accepted' | 'pending' | null }>>();

interface FollowButtonProps {
  targetUserId: string;
  currentUserId?: string;
  targetIsPrivate?: boolean;
  className?: string;
  /** When true, show "Following" even when already following (for profile pages) */
  showWhenFollowing?: boolean;
  /** Called when follow state changes (e.g. to refresh follower count) */
  onFollowChange?: (following: boolean) => void;
}

export function FollowButton({ targetUserId, currentUserId, targetIsPrivate, className = '', showWhenFollowing, onFollowChange }: FollowButtonProps) {
  const [following, setFollowing] = useState<boolean | null>(null);
  const [status, setStatus] = useState<'accepted' | 'pending' | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentUserId || currentUserId === targetUserId) {
      setFollowing(false);
      setStatus(null);
      return;
    }
    const cacheKey = `${currentUserId}:${targetUserId}`;
    const cached = followStatusCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < FOLLOW_STATUS_TTL_MS) {
      setFollowing(cached.following);
      setStatus(cached.status);
      return;
    }

    const pending = inflightStatusRequests.get(cacheKey);
    if (pending) {
      pending
        .then((v) => {
          setFollowing(v.following);
          setStatus(v.status);
        })
        .catch(() => {
          setFollowing(false);
          setStatus(null);
        });
      return;
    }

    const req = followsAPI
      .getStatus(targetUserId)
      .then((res) => ({
        following: !!res.data?.following,
        status: (res.data?.status || null) as 'accepted' | 'pending' | null,
      }));
    inflightStatusRequests.set(cacheKey, req);
    req
      .then((v) => {
        followStatusCache.set(cacheKey, { ...v, ts: Date.now() });
        setFollowing(v.following);
        setStatus(v.status);
      })
      .catch(() => {
        setFollowing(false);
        setStatus(null);
      })
      .finally(() => inflightStatusRequests.delete(cacheKey));
  }, [currentUserId, targetUserId]);

  const handleClick = async () => {
    if (!currentUserId || currentUserId === targetUserId) return;
    setLoading(true);
    try {
      if (following) {
        await followsAPI.unfollow(targetUserId);
        setFollowing(false);
        setStatus(null);
        if (currentUserId) {
          followStatusCache.set(`${currentUserId}:${targetUserId}`, { following: false, status: null, ts: Date.now() });
        }
        onFollowChange?.(false);
        toast.success('Unfollowed');
      } else {
        const res = await followsAPI.follow(targetUserId);
        setFollowing(true);
        const nextStatus = (res.data?.data?.status || (targetIsPrivate ? 'pending' : 'accepted')) as 'accepted' | 'pending';
        setStatus(nextStatus);
        if (currentUserId) {
          followStatusCache.set(`${currentUserId}:${targetUserId}`, { following: true, status: nextStatus, ts: Date.now() });
        }
        onFollowChange?.(true);
        toast.success(res.data?.message || 'Following');
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to update follow');
    } finally {
      setLoading(false);
    }
  };

  const isPending = status === 'pending';

  if (!currentUserId || currentUserId === targetUserId) return null;
  // Hide button when already following (no need to show "Following" reminder) unless showWhenFollowing
  if (following && !isPending && !showWhenFollowing) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition disabled:opacity-60 disabled:cursor-not-allowed ${
        following && !isPending
          ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
          : isPending
            ? 'bg-brand-50 text-brand-700 border border-brand-200'
            : 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm'
      } ${className}`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isPending ? (
        <Clock className="h-4 w-4" />
      ) : following ? (
        <UserCheck className="h-4 w-4" />
      ) : (
        <UserPlus className="h-4 w-4" />
      )}
      {loading ? 'Updating...' : isPending ? 'Requested' : following ? 'Following' : 'Follow'}
    </button>
  );
}
