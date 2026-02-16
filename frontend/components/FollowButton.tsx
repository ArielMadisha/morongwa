'use client';

import { useState, useEffect } from 'react';
import { followsAPI } from '@/lib/api';
import { UserPlus, UserCheck, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface FollowButtonProps {
  targetUserId: string;
  currentUserId?: string;
  targetIsPrivate?: boolean;
  className?: string;
}

export function FollowButton({ targetUserId, currentUserId, targetIsPrivate, className = '' }: FollowButtonProps) {
  const [following, setFollowing] = useState<boolean | null>(null);
  const [status, setStatus] = useState<'accepted' | 'pending' | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentUserId || currentUserId === targetUserId) {
      setFollowing(false);
      setStatus(null);
      return;
    }
    followsAPI
      .getStatus(targetUserId)
      .then((res) => {
        setFollowing(!!res.data?.following);
        setStatus(res.data?.status || null);
      })
      .catch(() => {
        setFollowing(false);
        setStatus(null);
      });
  }, [currentUserId, targetUserId]);

  const handleClick = async () => {
    if (!currentUserId || currentUserId === targetUserId) return;
    setLoading(true);
    try {
      if (following) {
        await followsAPI.unfollow(targetUserId);
        setFollowing(false);
        setStatus(null);
        toast.success('Unfollowed');
      } else {
        const res = await followsAPI.follow(targetUserId);
        setFollowing(true);
        setStatus(res.data?.data?.status || (targetIsPrivate ? 'pending' : 'accepted'));
        toast.success(res.data?.message || 'Following');
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to update follow');
    } finally {
      setLoading(false);
    }
  };

  if (!currentUserId || currentUserId === targetUserId) return null;

  const isPending = status === 'pending';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors disabled:opacity-50 ${following && !isPending ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-sky-500 text-white hover:bg-sky-600'} ${className}`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : following && !isPending ? (
        <UserCheck className="h-4 w-4" />
      ) : (
        <UserPlus className="h-4 w-4" />
      )}
      {loading ? '...' : following && !isPending ? 'Following' : isPending ? 'Requested' : 'Follow'}
    </button>
  );
}
