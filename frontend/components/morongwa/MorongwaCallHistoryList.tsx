'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, PhoneCall, PhoneOutgoing } from 'lucide-react';
import { voiceAPI } from '@/lib/api';

export type VoiceCallRow = {
  _id: string;
  destinationPhone: string;
  status: string;
  durationSec?: number;
  billedAmountZar?: number;
  createdAt: string;
};

type MorongwaCallHistoryListProps = {
  searchQuery: string;
  onRedial?: (e164: string) => void;
  refreshKey?: number;
};

function formatDestination(digits: string): string {
  const d = String(digits || '').replace(/\D/g, '');
  return d ? `+${d}` : 'Unknown';
}

function statusLabel(status: string): string {
  const s = String(status || '').toLowerCase();
  if (s === 'completed') return 'Completed';
  if (s === 'in-progress') return 'In progress';
  if (s === 'ringing' || s === 'queued') return 'Ringing';
  if (s === 'no-answer') return 'No answer';
  if (s === 'busy') return 'Busy';
  if (s === 'canceled' || s === 'cancelled') return 'Canceled';
  if (s === 'failed') return 'Failed';
  return status || 'Unknown';
}

export function MorongwaCallHistoryList({ searchQuery, onRedial, refreshKey = 0 }: MorongwaCallHistoryListProps) {
  const [calls, setCalls] = useState<VoiceCallRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await voiceAPI.getHistory(40);
      const rows = (res.data?.calls ?? []) as VoiceCallRow[];
      setCalls(Array.isArray(rows) ? rows : []);
    } catch {
      setCalls([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const q = searchQuery.trim().toLowerCase();
  const filtered = calls.filter((c) => {
    if (!q) return true;
    const dest = formatDestination(c.destinationPhone).toLowerCase();
    return dest.includes(q) || String(c.status || '').toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="py-8 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="py-8 text-center text-slate-600">
        <PhoneOutgoing className="mx-auto mb-2 h-8 w-8 text-slate-300" />
        <p className="text-sm">No calls yet</p>
        <p className="text-xs mt-1 text-slate-500">Use Call phone to dial a number</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {filtered.map((call) => {
        const dest = formatDestination(call.destinationPhone);
        const when = new Date(call.createdAt);
        const duration = Number(call.durationSec || 0);
        const billed = Number(call.billedAmountZar || 0);
        return (
          <button
            key={call._id}
            type="button"
            onClick={() => onRedial?.(dest)}
            className="w-full text-left rounded-lg p-3 transition hover:bg-indigo-50 group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 break-words">{dest}</p>
                <p className="text-xs text-slate-600">
                  {when.toLocaleDateString([], { day: 'numeric', month: 'short' })}{' '}
                  {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {duration > 0 ? ` · ${Math.ceil(duration / 60)} min` : ''}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{statusLabel(call.status)}</p>
              </div>
              <div className="shrink-0 text-right">
                {billed > 0 ? (
                  <p className="text-xs font-semibold text-slate-700">R{billed.toFixed(2)}</p>
                ) : null}
                <PhoneCall className="h-4 w-4 text-indigo-500 opacity-0 group-hover:opacity-100 mt-1 ml-auto" />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
