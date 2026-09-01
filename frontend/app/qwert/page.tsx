'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Scissors, Upload, Video } from 'lucide-react';
import { AppShellHeader } from '@/components/AppShellHeader';
import { qwertzAPI, type QwertzJob, type QwertzVideo } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

export default function QwertEditorPage() {
  const { user } = useAuth();
  const [health, setHealth] = useState<string>('checking…');
  const [video, setVideo] = useState<QwertzVideo | null>(null);
  const [job, setJob] = useState<QwertzJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [trimEnd, setTrimEnd] = useState(30);

  useEffect(() => {
    qwertzAPI
      .health()
      .then((r) => {
        const ff = r.data?.ffmpeg?.ok ? 'FFmpeg OK' : 'FFmpeg missing on server';
        setHealth(`${r.data?.status || 'unknown'} · ${ff}`);
      })
      .catch(() => setHealth('Qwertz service unavailable — set QWERTZ_API_URL on backend'));
  }, []);

  const pollJob = useCallback(async (jobId: string) => {
    for (let i = 0; i < 40; i++) {
      const { data } = await qwertzAPI.getJob(jobId);
      const j = data.data;
      setJob(j);
      if (j.status === 'completed' || j.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }, []);

  const onUpload = async (file: File | null) => {
    if (!file || !user) {
      toast.error(user ? 'Choose a video file' : 'Sign in to use Qwert');
      return;
    }
    setBusy(true);
    try {
      const { data } = await qwertzAPI.upload(file);
      setVideo(data.data);
      setTrimEnd(Math.min(30, data.data.durationSeconds || 30));
      toast.success('Uploaded to Qwertz');
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const onTrimExport = async () => {
    if (!video) return;
    setBusy(true);
    try {
      const { data } = await qwertzAPI.edit(video.id, {
        trimStart: 0,
        trimEnd: trimEnd,
        crop9x16: true,
        filter: 'warm',
        loop: true,
      });
      await pollJob(data.data.jobId);
      const refreshed = await qwertzAPI.getVideo(video.id);
      setVideo(refreshed.data.data);
      toast.success('Export complete');
    } catch {
      toast.error('Edit/export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-slate-50 text-slate-900">
      <AppShellHeader
        center={
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-sky-600" />
            <span className="font-semibold">Qwertz — Video Editing Suite</span>
          </div>
        }
      />
      <main className="mx-auto max-w-lg px-4 py-8 space-y-6">
        <p className="text-sm text-slate-600">
          Phase 1 MVP — vertical 9:16 clips up to 90s. Trim, crop, and export via the Qwertz API on Qwertymates.
        </p>
        <p className="text-xs text-slate-500">Service: {health}</p>

        {!user ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
            <Link href="/login" className="font-medium text-sky-700 underline">
              Sign in
            </Link>{' '}
            to upload and edit.
          </p>
        ) : (
          <>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-sky-200 bg-white p-8 hover:border-sky-400">
              <Upload className="h-8 w-8 text-sky-600" />
              <span className="text-sm font-medium">Upload video (max 90s)</span>
              <input
                type="file"
                accept="video/*"
                className="hidden"
                disabled={busy}
                onChange={(e) => void onUpload(e.target.files?.[0] || null)}
              />
            </label>

            {video ? (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium">Video {video.id.slice(0, 8)}… · {video.durationSeconds}s</p>
                {video.playbackUrl ? (
                  <video src={video.playbackUrl} controls loop={video.loop} className="w-full rounded-lg bg-black" />
                ) : null}
                <label className="block text-sm">
                  Trim end (seconds)
                  <input
                    type="number"
                    min={1}
                    max={video.durationSeconds}
                    value={trimEnd}
                    onChange={(e) => setTrimEnd(Number(e.target.value))}
                    className="mt-1 w-full rounded border px-2 py-1"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onTrimExport()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-2 text-white disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                  Trim & export 9:16
                </button>
                {job ? (
                  <p className="text-xs text-slate-500">
                    Job {job.jobId.slice(0, 8)}… — {job.status} ({job.progress}%)
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        <p className="text-xs text-slate-400">
          Docs: repo <code>DOCS/Qwertz/</code> · API <code>/api/qwertz/*</code>
        </p>
      </main>
    </div>
  );
}
