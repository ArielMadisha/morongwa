'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, X } from 'lucide-react';
import { followsAPI, getImageUrl } from '@/lib/api';
import { userAtUsername, userPublicDisplayName } from '@/lib/userDisplayLabel';

type ProfileUserRow = {
  _id: string;
  name?: string;
  username?: string;
  avatar?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  mode: 'followers' | 'following';
  title: string;
};

export function ProfileConnectionsModal({ open, onClose, userId, mode, title }: Props) {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<ProfileUserRow[]>([]);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setLoading(true);
    const fetcher =
      mode === 'followers' ? followsAPI.getFollowers(userId) : followsAPI.getFollowing(userId);
    fetcher
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res.data?.data) ? res.data.data : [];
        setUsers(
          rows
            .map((u: ProfileUserRow) => ({
              _id: String(u._id),
              name: u.name,
              username: u.username,
              avatar: u.avatar,
            }))
            .filter((u) => u._id)
        );
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId, mode]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-md max-h-[min(80dvh,520px)] rounded-t-2xl sm:rounded-2xl bg-white shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
            </div>
          ) : users.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">No users yet</p>
          ) : (
            <ul className="space-y-1">
              {users.map((u) => {
                const label = userPublicDisplayName(u);
                const handle = userAtUsername(u);
                return (
                  <li key={u._id}>
                    <Link
                      href={`/user/${u._id}`}
                      onClick={onClose}
                      className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-slate-50 transition-colors"
                    >
                      <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-slate-200">
                        {u.avatar ? (
                          <img src={getImageUrl(u.avatar)} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-500">
                            {(label || '?')[0]}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900">{label}</span>
                        {handle ? (
                          <span className="block truncate text-xs text-slate-500">{handle}</span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
