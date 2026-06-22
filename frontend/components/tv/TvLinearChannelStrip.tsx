'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Radio, Loader2, ExternalLink } from 'lucide-react';
import { tvChannelAPI, getImageUrlFull } from '@/lib/api';

type ChannelPayload = {
  current: {
    _id: string;
    title?: string;
    videoUrl?: string;
    posterUrl?: string;
    genre?: string;
    durationSeconds?: number;
  } | null;
  isPaused: boolean;
  positionMs: number;
  durationMs: number;
  next: { _id: string; title?: string } | null;
  queue: { _id: string; title?: string }[];
  serverTime: string;
};

function videoSrc(url: string | undefined): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return getImageUrlFull(url);
}

export function TvLinearChannelStrip() {
  const [data, setData] = useState<ChannelPayload | null>(null);
  const [err, setErr] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastIdRef = useRef<string | null>(null);

  const fetchNow = useCallback(async () => {
    try {
      const res = await tvChannelAPI.getNow();
      const d = res.data?.data as ChannelPayload;
      setData(d ?? null);
      setErr(false);
    } catch {
      setErr(true);
    }
  }, []);

  useEffect(() => {
    void fetchNow();
    const t = setInterval(() => void fetchNow(), 8000);
    return () => clearInterval(t);
  }, [fetchNow]);

  const cur = data?.current;
  const src = videoSrc(cur?.videoUrl);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !src) return;
    const id = cur?._id || null;
    const changed = id !== lastIdRef.current;
    if (changed) {
      lastIdRef.current = id;
      el.src = src;
      el.load();
      const posSec = (data?.positionMs ?? 0) / 1000;
      const applySeek = () => {
        try {
          if (Number.isFinite(posSec) && posSec >= 0) el.currentTime = posSec;
        } catch {
          /* ignore */
        }
      };
      el.addEventListener('loadedmetadata', applySeek, { once: true });
      return;
    }
    const posSec = (data?.positionMs ?? 0) / 1000;
    if (!data?.isPaused && Number.isFinite(posSec) && posSec >= 0) {
      const drift = Math.abs(el.currentTime - posSec);
      if (drift > 2.5) {
        try {
          el.currentTime = posSec;
        } catch {
          /* ignore */
        }
      }
    }
  }, [cur?._id, cur?.videoUrl, src, data?.positionMs, data?.isPaused]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !src) return;
    if (data?.isPaused) {
      void el.pause();
    } else {
      void el.play().catch(() => {});
    }
  }, [data?.isPaused, src]);

  if (err && !data) {
    return null;
  }

  if (!data?.queue?.length && !data?.current) {
    return null;
  }

  if (!data?.current && data.queue.length > 0) {
    return (
      <section className="mb-4 rounded-2xl border border-amber-200/60 bg-amber-950/40 px-4 py-3 text-amber-50">
        <p className="text-sm font-medium">
          Platform channel has <strong>{data.queue.length}</strong> programme(s) in the queue — playback is idle until an admin presses{' '}
          <strong>Play</strong> in{' '}
          <Link href="/admin/tv-channel" className="text-sky-200 underline">
            Admin → Linear channel
          </Link>
          .
        </p>
        <p className="mt-1 text-xs text-amber-200/90">
          Up next: <span className="font-semibold text-white">{String(data.queue[0]?.title || 'Programme')}</span>
        </p>
      </section>
    );
  }

  return (
    <section className="mb-4 rounded-2xl border border-slate-200/80 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-lg overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:items-stretch gap-0">
        <div className="relative aspect-video w-full lg:w-[min(100%,420px)] lg:max-w-[45%] shrink-0 bg-black">
          {src ? (
            <video
              ref={videoRef}
              className="h-full w-full object-contain"
              playsInline
              controls
              poster={cur?.posterUrl ? getImageUrlFull(cur.posterUrl) : undefined}
              muted={false}
            />
          ) : (
            <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-slate-400">
              {data?.current ? 'Preparing stream…' : 'No programme on air — open the admin channel to queue uploads.'}
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-300">
            <Radio className="h-3.5 w-3.5" aria-hidden />
            Platform channel
            {data?.isPaused ? (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-200">Paused</span>
            ) : (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-200">On air</span>
            )}
          </div>
          <h2 className="text-lg font-semibold leading-tight text-white sm:text-xl">
            {data?.current?.title || 'Standby'}
          </h2>
          {data?.current?.genre ? (
            <p className="text-xs text-slate-400">{data.current.genre}</p>
          ) : null}
          {data?.next?.title ? (
            <p className="text-sm text-slate-300">
              Next: <span className="font-medium text-white">{data.next.title}</span>
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <Link
              href="/morongwa-tv/channel"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-300 hover:text-sky-200"
            >
              <ExternalLink className="h-4 w-4" />
              Full screen channel
            </Link>
            <Link href="/admin/tv-channel" className="text-sm font-medium text-slate-400 hover:text-white">
              Admin schedule →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function TvLinearChannelStripLoading() {
  return (
    <div className="mb-4 flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/60 py-6 text-sm text-slate-600">
      <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
      Loading platform channel…
    </div>
  );
}
