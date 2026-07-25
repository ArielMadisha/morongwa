'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Plus, Video } from 'lucide-react';
import { morongwaAPI, type MorongwaMeetingRow } from '@/lib/api';

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function MorongwaCalendarSection({ onNewMeeting }: { onNewMeeting?: () => void }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [meetings, setMeetings] = useState<MorongwaMeetingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const weekDays = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const hours = useMemo(() => Array.from({ length: 9 }, (_, i) => i + 8), []);

  useEffect(() => {
    const from = weekStart.toISOString();
    const to = new Date(weekStart.getTime() + 7 * 86400000).toISOString();
    setLoading(true);
    morongwaAPI
      .getMeetings({ from, to })
      .then((res) => setMeetings(Array.isArray(res.data?.data) ? res.data.data : []))
      .catch(() => setMeetings([]))
      .finally(() => setLoading(false));
  }, [weekStart]);

  const meetingsForDay = (day: Date) =>
    meetings.filter((m) => {
      if (!m.scheduledStart) return false;
      const s = new Date(m.scheduledStart);
      return s.toDateString() === day.toDateString();
    });

  return (
    <div className="flex w-full flex-1 flex-col overflow-hidden bg-white min-h-[min(70dvh,calc(100dvh-11rem))] lg:h-full lg:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <h1 className="text-xl font-bold text-slate-900">Calendar</h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setWeekStart((w) => new Date(w.getTime() - 7 * 86400000))} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50" aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-slate-700 min-w-[140px] text-center">
            {weekDays[0]?.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
          </span>
          <button type="button" onClick={() => setWeekStart((w) => new Date(w.getTime() + 7 * 86400000))} className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50" aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">Today</button>
          <button type="button" onClick={onNewMeeting} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700">
            <Plus className="h-4 w-4" /> New meeting
          </button>
        </div>
      </div>
      {loading ? (
        <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-violet-600" /></div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="grid min-w-[640px]" style={{ gridTemplateColumns: '56px repeat(5, 1fr)' }}>
            <div className="border-b border-slate-200 bg-slate-50" />
            {weekDays.map((d) => (
              <div key={d.toISOString()} className="border-b border-l border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-semibold text-slate-600">
                <div>{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                <div className="text-base text-slate-900">{d.getDate()}</div>
              </div>
            ))}
            {hours.map((h) => (
              <Fragment key={`hour-${h}`}>
                <div className="border-b border-slate-100 px-2 py-4 text-xs text-slate-400 text-right">
                  {h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`}
                </div>
                {weekDays.map((d) => {
                  const dayMeetings = meetingsForDay(d).filter((m) => {
                    if (!m.scheduledStart) return false;
                    return new Date(m.scheduledStart).getHours() === h;
                  });
                  return (
                    <div key={`${d.toISOString()}-${h}`} className="relative min-h-[52px] border-b border-l border-slate-100 p-1">
                      {dayMeetings.map((m) => (
                        <div key={m._id} className="mb-1 rounded-md bg-violet-100 px-2 py-1 text-xs text-violet-900">
                          <Video className="inline h-3 w-3 mr-1" />
                          {m.title}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}
      <div className="border-t border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Scheduled meetings</h2>
        {meetings.filter((m) => m.kind === 'scheduled').length === 0 ? (
          <p className="text-sm text-slate-500">You don&apos;t have anything scheduled</p>
        ) : (
          <ul className="space-y-2">
            {meetings.filter((m) => m.kind === 'scheduled').map((m) => (
              <li key={m._id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span className="font-medium">{m.title}</span>
                {m.scheduledStart ? (
                  <span className="text-slate-500"> · {new Date(m.scheduledStart).toLocaleString()}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
