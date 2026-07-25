'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Mail, Search, X } from 'lucide-react';
import { morongwaAPI, messengerAPI } from '@/lib/api';
import { userPublicDisplayName } from '@/lib/userDisplayLabel';

type InviteUser = { _id: string; name?: string; username?: string };

type Props = {
  meetingId: string;
  meetingTitle?: string;
  currentUserId: string;
  onClose: () => void;
};

export function MeetingInvitePanel({ meetingId, meetingTitle, currentUserId, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<InviteUser[]>([]);
  const [selected, setSelected] = useState<Map<string, InviteUser>>(new Map());
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      messengerAPI
        .searchUsers(q, 100)
        .then((res) => {
          const list = (res.data?.data ?? []) as InviteUser[];
          setHits(Array.isArray(list) ? list.filter((u) => String(u._id) !== currentUserId) : []);
        })
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 220);
    return () => clearTimeout(timer);
  }, [query, currentUserId]);

  const toggle = (u: InviteUser) => {
    const id = String(u._id);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, u);
      return next;
    });
  };

  const sendInvites = async () => {
    const ids = Array.from(selected.keys());
    if (!ids.length) {
      toast.error('Select at least one Qwertymates user');
      return;
    }
    setSending(true);
    try {
      const res = await morongwaAPI.inviteToMeeting({ meetingId, recipientUserIds: ids });
      const count = Number(res.data?.sent ?? ids.length);
      toast.success(`Invite sent to ${count} user${count === 1 ? '' : 's'}`);
      setSelected(new Map());
      onClose();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Could not send invites');
    } finally {
      setSending(false);
    }
  };

  const joinUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/messages?section=meet&join=${encodeURIComponent(meetingId)}`
      : `https://www.qwertymates.com/messages?section=meet&join=${encodeURIComponent(meetingId)}`;

  const shareText = `Join my Qwertymates meeting "${meetingTitle || 'Meeting'}".\nMeeting ID: ${meetingId}\n${joinUrl}`;

  return (
    <div className="w-full max-w-md rounded-xl border border-white/25 bg-black/75 p-4 text-left shadow-2xl backdrop-blur-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">Invite Qwertymates users</p>
          <p className="text-xs text-sky-100/90 mt-0.5">Search and send an in-app invite with join link</p>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-white/80 hover:bg-white/10" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, @username or email…"
          className="w-full rounded-lg border border-white/20 bg-white/95 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
          autoFocus
        />
      </div>

      {selected.size > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {Array.from(selected.values()).map((u) => (
            <span
              key={u._id}
              className="inline-flex items-center gap-1 rounded-full bg-sky-500/30 px-2 py-0.5 text-xs font-medium text-white"
            >
              {userPublicDisplayName(u)}
              <button type="button" onClick={() => toggle(u)} className="hover:text-sky-100" aria-label="Remove">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-white/15 bg-white/95">
        {searching ? (
          <div className="flex justify-center py-5">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : !query.trim() ? (
          <p className="px-3 py-4 text-sm text-slate-500">Type to search any Qwertymates user.</p>
        ) : hits.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-500">No users found.</p>
        ) : (
          hits.map((u) => {
            const picked = selected.has(String(u._id));
            return (
              <button
                key={u._id}
                type="button"
                onClick={() => toggle(u)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${
                  picked ? 'bg-sky-50' : ''
                }`}
              >
                <span className="min-w-0 truncate font-medium text-slate-900">{userPublicDisplayName(u)}</span>
                {u.username ? <span className="shrink-0 text-xs text-slate-500">@{u.username}</span> : null}
              </button>
            );
          })
        )}
      </div>

      <button
        type="button"
        disabled={sending || selected.size === 0}
        onClick={() => void sendInvites()}
        className="mb-3 w-full rounded-lg bg-sky-500 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-500"
      >
        {sending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : `Send invite${selected.size > 1 ? 's' : ''}`}
      </button>

      <div className="flex flex-wrap justify-center gap-2 border-t border-white/15 pt-3">
        <a
          href={`mailto:?subject=${encodeURIComponent('Qwertymates meeting invite')}&body=${encodeURIComponent(shareText)}`}
          className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
        >
          <Mail className="h-3.5 w-3.5" />
          Email
        </a>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
        >
          WhatsApp
        </a>
      </div>
    </div>
  );
}
