'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, User } from 'lucide-react';
import { walletAPI } from '@/lib/api';
import { formatCountryHint } from '@/lib/adminFollowupLinks';

export type MerchantAgentOption = {
  _id: string;
  name: string;
  username?: string;
  publicNote?: string;
  businessName?: string;
  businessDescription?: string;
  countryCode?: string;
};

/** Primary line: business name (matches admin “Business” column). */
function agentPrimaryLabel(a: MerchantAgentOption): string {
  return a.businessName?.trim() || a.name?.trim() || a.username || 'Agent';
}

/** Secondary: account holder + @username (matches admin “User” column, not phone). */
function agentAccountLine(a: MerchantAgentOption): string {
  const parts: string[] = [];
  const holder = a.name?.trim();
  if (holder && holder !== agentPrimaryLabel(a)) parts.push(holder);
  if (a.username) parts.push(`@${a.username}`);
  return parts.join(' · ');
}

/** Area / hours line from description or public note. */
function agentPlaceLine(a: MerchantAgentOption): string {
  const loc = formatCountryHint(a.countryCode);
  const detail = (a.publicNote || a.businessDescription || '').trim();
  if (loc && detail) return `${detail} · ${loc}`;
  return detail || loc || '';
}

function matchesName(a: MerchantAgentOption, q: string): boolean {
  const hay = [a.name, a.username, a.businessName].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

function matchesPlace(a: MerchantAgentOption, q: string): boolean {
  const hay = [
    a.publicNote,
    a.businessDescription,
    a.countryCode,
    formatCountryHint(a.countryCode),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

type Props = {
  currentUserId?: string;
  value: string;
  onChange: (agentId: string) => void;
};

export function MerchantAgentPicker({ currentUserId, value, onChange }: Props) {
  const [placeQuery, setPlaceQuery] = useState('');
  const [nameQuery, setNameQuery] = useState('');
  const [agents, setAgents] = useState<MerchantAgentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const hasFilter = placeQuery.trim() || nameQuery.trim();
    const delay = hasFilter ? 220 : 0;
    const t = setTimeout(() => {
      setLoading(true);
      walletAPI
        .searchMerchantAgents({
          q: nameQuery.trim() || undefined,
          location: placeQuery.trim() || undefined,
        })
        .then((r) => {
          if (!cancelled) setAgents(Array.isArray(r.data) ? r.data : []);
        })
        .catch(() => {
          if (!cancelled) setAgents([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [nameQuery, placeQuery]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => {
    const nq = nameQuery.trim().toLowerCase();
    const pq = placeQuery.trim().toLowerCase();
    return agents
      .filter((a) => String(a._id) !== String(currentUserId || ''))
      .filter((a) => (!nq ? true : matchesName(a, nq)))
      .filter((a) => (!pq ? true : matchesPlace(a, pq)));
  }, [agents, nameQuery, placeQuery, currentUserId]);

  const selected = agents.find((a) => String(a._id) === value);

  return (
    <div ref={wrapRef} className="space-y-2 mb-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="relative">
          <label className="sr-only">Search by area or place</label>
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Type place"
            value={placeQuery}
            onChange={(e) => {
              setPlaceQuery(e.target.value);
              setOpen(true);
              if (!e.target.value.trim() && !nameQuery.trim()) onChange('');
            }}
            onFocus={() => setOpen(true)}
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
            autoComplete="off"
          />
        </div>
        <div className="relative">
          <label className="sr-only">Search by agent or business name</label>
          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Type agent name"
            value={nameQuery}
            onChange={(e) => {
              setNameQuery(e.target.value);
              setOpen(true);
              if (!e.target.value.trim() && !placeQuery.trim()) onChange('');
            }}
            onFocus={() => setOpen(true)}
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-9 text-sm"
            autoComplete="off"
          />
          {loading ? (
            <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-sky-600" />
          ) : null}
        </div>
      </div>

      {selected && !open ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm">
          <p className="font-medium text-sky-900">{agentPrimaryLabel(selected)}</p>
          {agentAccountLine(selected) ? (
            <p className="text-xs text-sky-800 mt-0.5">{agentAccountLine(selected)}</p>
          ) : null}
          {agentPlaceLine(selected) ? (
            <p className="text-xs text-sky-700 mt-0.5">{agentPlaceLine(selected)}</p>
          ) : null}
          <button type="button" className="text-xs text-sky-600 underline mt-1" onClick={() => setOpen(true)}>
            Change agent
          </button>
        </div>
      ) : null}

      {open && (
        <ul
          className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-md divide-y divide-slate-100"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-3 text-sm text-slate-500">
              {loading
                ? 'Searching…'
                : 'No agents match. Try business name (e.g. Mabeka), account name, or a place like Hammanskraal.'}
            </li>
          ) : (
            filtered.map((a) => (
              <li key={a._id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === a._id}
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-sky-50 ${
                    value === a._id ? 'bg-sky-50 font-semibold text-sky-900' : 'text-slate-800'
                  }`}
                  onClick={() => {
                    onChange(a._id);
                    setNameQuery(agentPrimaryLabel(a));
                    setOpen(false);
                  }}
                >
                  <p className="font-medium">{agentPrimaryLabel(a)}</p>
                  {agentAccountLine(a) ? (
                    <p className="text-xs text-slate-600 mt-0.5">{agentAccountLine(a)}</p>
                  ) : null}
                  {agentPlaceLine(a) ? (
                    <p className="text-xs text-slate-500 mt-0.5">{agentPlaceLine(a)}</p>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      <p className="text-[10px] text-slate-500">
        List uses business name first (e.g. Mabeka), then account holder (e.g. Ariel Madisha). Search by place uses
        area text in their profile, not phone numbers. Agents must enable &quot;Show me in agent search&quot;.
      </p>
    </div>
  );
}
