'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { getImageUrl, messengerAPI } from '@/lib/api';
import { userPublicDisplayName } from '@/lib/userDisplayLabel';

export type TaggedPerson = {
  _id: string;
  name?: string;
  username?: string;
  avatar?: string;
  isSchoolAccount?: boolean;
};

function personId(u: { _id?: string; id?: string }): string {
  return String(u._id || (u as { id?: string }).id || '');
}

function personLabel(u: TaggedPerson): string {
  return userPublicDisplayName(u) || u.username || 'User';
}

type Props = {
  selected: TaggedPerson[];
  onChange: (next: TaggedPerson[]) => void;
  currentUserId?: string;
  max?: number;
};

export function TagPeoplePicker({ selected, onChange, currentUserId, max = 20 }: Props) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<TaggedPerson[]>([]);
  const [loading, setLoading] = useState(false);
  /** Stable string key — avoid Set identity churn that re-fires search every parent render. */
  const selectedKey = useMemo(
    () =>
      selected
        .map((s) => s._id)
        .filter(Boolean)
        .sort()
        .join(','),
    [selected]
  );
  const selectedIds = useMemo(() => new Set(selectedKey ? selectedKey.split(',') : []), [selectedKey]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setHits((prev) => (prev.length ? [] : prev));
      setLoading(false);
      return;
    }
    const t = window.setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      void (async () => {
        try {
          const res = await messengerAPI.searchUsers(query, 12);
          if (ac.signal.aborted) return;
          const rows = (res.data?.data ?? []) as TaggedPerson[];
          setHits(
            Array.isArray(rows)
              ? rows.filter((u) => {
                  const id = personId(u);
                  return id && id !== currentUserId && !selectedIds.has(id);
                })
              : []
          );
        } catch {
          if (!ac.signal.aborted) setHits([]);
        } finally {
          if (!ac.signal.aborted) setLoading(false);
        }
      })();
    }, 280);
    return () => {
      window.clearTimeout(t);
      abortRef.current?.abort();
    };
  }, [q, currentUserId, selectedKey, selectedIds]);

  const add = (u: TaggedPerson) => {
    const id = personId(u);
    if (!id || selectedIds.has(id) || selected.length >= max) return;
    onChange([...selected, { ...u, _id: id }]);
    setQ('');
    setHits([]);
  };

  const remove = (id: string) => {
    onChange(selected.filter((s) => s._id !== id));
  };

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
        <UserPlus className="h-4 w-4 text-sky-600" />
        Tag people
      </label>
      <p className="text-xs text-slate-500">Search friends or schools. They&apos;ll get a &quot;tagged you&quot; notification.</p>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((u) => (
            <span
              key={u._id}
              className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800"
            >
              {personLabel(u)}
              <button
                type="button"
                onClick={() => remove(u._id)}
                className="rounded-full p-0.5 hover:bg-sky-200"
                aria-label={`Remove ${personLabel(u)}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          type="text"
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or @username…"
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
          disabled={selected.length >= max}
        />
        {(loading || hits.length > 0 || (q.trim().length >= 2 && !loading)) && (
          <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white shadow-lg">
            {loading ? (
              <li className="px-3 py-2 text-xs text-slate-500">Searching…</li>
            ) : hits.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate-500">No people found</li>
            ) : (
              hits.map((u) => {
                const id = personId(u);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => add(u)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sky-50"
                    >
                      {u.avatar ? (
                        <img
                          src={getImageUrl(u.avatar)}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                          {personLabel(u).slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800">{personLabel(u)}</span>
                        {u.username ? (
                          <span className="block truncate text-xs text-slate-500">@{u.username}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
