'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { messengerAPI } from '@/lib/api';
import { userPublicDisplayName } from '@/lib/userDisplayLabel';

export type GroupChatParticipant = {
  _id: string;
  name?: string;
  username?: string;
  email?: string;
};

type MorongwaGroupChatModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (participants: GroupChatParticipant[]) => void;
  currentUserId: string;
};

export function MorongwaGroupChatModal({ open, onClose, onCreate, currentUserId }: MorongwaGroupChatModalProps) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<GroupChatParticipant[]>([]);
  const [selected, setSelected] = useState<Map<string, GroupChatParticipant>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setHits([]);
      setSelected(new Map());
      return;
    }
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      messengerAPI
        .searchUsers(q)
        .then((res) => {
          const list = (res.data?.data ?? []) as GroupChatParticipant[];
          setHits(list.filter((u) => String(u._id) !== currentUserId));
        })
        .catch(() => setHits([]))
        .finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(timer);
  }, [open, query, currentUserId]);

  if (!open) return null;

  const toggle = (u: GroupChatParticipant) => {
    const id = String(u._id);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, u);
      return next;
    });
  };

  const canCreate = selected.size > 0;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-labelledby="group-chat-title"
        className="relative w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl"
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 id="group-chat-title" className="text-base font-semibold text-slate-900">
            Start a group chat
          </h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter name, email or phone number"
            className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#5B5FC7] focus:outline-none focus:ring-2 focus:ring-violet-100"
            autoFocus
          />
          {selected.size > 0 && (
            <div className="flex flex-wrap gap-2">
              {Array.from(selected.values()).map((u) => (
                <span
                  key={u._id}
                  className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-800"
                >
                  {userPublicDisplayName(u)}
                  <button type="button" onClick={() => toggle(u)} className="text-violet-600 hover:text-violet-900" aria-label="Remove">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="max-h-48 overflow-y-auto rounded-md border border-slate-100">
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : hits.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-500">
                {query.trim() ? 'No users found — try another name or email.' : 'Search to add people to the group.'}
              </p>
            ) : (
              hits.map((u) => {
                const id = String(u._id);
                const picked = selected.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggle(u)}
                    className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 ${
                      picked ? 'bg-violet-50' : ''
                    }`}
                  >
                    <span className="font-medium text-slate-900">{userPublicDisplayName(u)}</span>
                    {u.username && <span className="text-xs text-slate-500">@{u.username}</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => onCreate(Array.from(selected.values()))}
            className="rounded-md bg-[#5B5FC7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4b4fb8] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
