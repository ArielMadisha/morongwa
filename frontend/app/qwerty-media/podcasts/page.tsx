'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Heart, Loader2, Lock, Mic, Pause, Play, Plus, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { AdvertSlot } from '@/components/AdvertSlot';
import { AppShellHeader } from '@/components/AppShellHeader';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import {
  CollapsibleBottomChrome,
  CollapsibleChrome,
  ScrollAwareChromeRoot,
} from '@/components/ScrollAwareAppShell';
import { mergeScrollAwareRef } from '@/hooks/useScrollAwareChrome';
import { MediaSectionTabs } from '@/components/media/MediaSectionTabs';
import { MediaChipRow } from '@/components/media/MediaChipRow';
import { MEDIA_GRID_CLASS } from '@/components/media/MediaPageShell';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { SearchButton } from '@/components/SearchButton';
import { useAuth } from '@/contexts/AuthContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { getImageUrl, podcastsAPI } from '@/lib/api';
import type { PodcastEpisodeRecord, PodcastShowRecord } from '@/lib/api';

function formatDuration(seconds?: number) {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function mediaUrl(url?: string) {
  if (!url) return '';
  return getImageUrl(url);
}

export default function QwertyPodcastsPage() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);

  const [categories, setCategories] = useState<{ id: string; label: string }[]>([]);
  const [category, setCategory] = useState('all');
  const [episodes, setEpisodes] = useState<PodcastEpisodeRecord[]>([]);
  const [shows, setShows] = useState<PodcastShowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [myShows, setMyShows] = useState<PodcastShowRecord[]>([]);

  useEffect(() => {
    podcastsAPI
      .getCategories()
      .then((res) => setCategories(res.data.data || []))
      .catch(() => setCategories([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [epRes, showRes] = await Promise.all([
        podcastsAPI.listEpisodes({ category, limit: 24 }),
        podcastsAPI.listShows({ category, limit: 12 }),
      ]);
      setEpisodes(epRes.data.data || []);
      setShows(showRes.data.data || []);
    } catch {
      setEpisodes([]);
      setShows([]);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    podcastsAPI
      .myShows()
      .then((res) => setMyShows(res.data.data || []))
      .catch(() => setMyShows([]));
  }, [user, uploadOpen]);

  useEffect(() => () => audioRef.current?.pause(), []);

  const togglePlay = (episode: PodcastEpisodeRecord) => {
    if (episode.locked) {
      toast.error('Unlock this premium episode to listen.');
      return;
    }
    const src = mediaUrl(episode.audioUrl);
    if (!src) return;
    if (playingId === episode._id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const el = new Audio(src);
    audioRef.current = el;
    el.onended = () => setPlayingId(null);
    void el.play().catch(() => toast.error('Playback failed'));
    setPlayingId(episode._id);
    void podcastsAPI.recordPlay(episode._id).catch(() => undefined);
  };

  const toggleLike = async (episode: PodcastEpisodeRecord) => {
    if (!user) {
      toast.error('Sign in to like episodes');
      return;
    }
    try {
      const res = await podcastsAPI.likeEpisode(episode._id);
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (res.data.data.liked) next.add(episode._id);
        else next.delete(episode._id);
        return next;
      });
      setEpisodes((prev) =>
        prev.map((e) => (e._id === episode._id ? { ...e, likeCount: res.data.data.likeCount } : e))
      );
    } catch {
      toast.error('Could not update like');
    }
  };

  const unlock = async (episode: PodcastEpisodeRecord) => {
    if (!user) {
      toast.error('Sign in to unlock premium episodes');
      return;
    }
    setUnlockingId(episode._id);
    try {
      await podcastsAPI.unlockEpisode(episode._id);
      toast.success('Episode unlocked');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Unlock failed');
    } finally {
      setUnlockingId(null);
    }
  };

  return (
    <ScrollAwareChromeRoot>
      {(attachScroll) => (
    <div className="flex h-[100dvh] min-h-screen flex-col overflow-hidden bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <CollapsibleChrome edge="top">
      <AppShellHeader
        homeHref="/wall"
        center={
          <div className="flex min-w-0 items-center gap-2">
            <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} />
            <Mic className="h-5 w-5 shrink-0 text-amber-600" />
            <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg">QwertyPodcasts</h1>
          </div>
        }
        actions={
          <>
            <SearchButton />
            <ProfileHeaderButton />
          </>
        }
      />
      </CollapsibleChrome>
      <div className="flex min-h-0 min-w-0 w-full flex-1">
        <AppSidebar
          variant="wall"
          userName={user?.name}
          userAvatar={(user as any)?.avatar}
          userId={user?._id || user?.id}
          cartCount={cartCount}
          hasStore={hasStore}
          onLogout={logout}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          hideLogo
          belowHeader
        />
        <div
          ref={mergeScrollAwareRef(attachScroll, scrollContainerRef)}
          className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y lg:flex-row"
        >
          <main className="order-2 box-border w-full min-w-0 flex-1 px-3 pb-24 pt-0 sm:px-6 md:pb-6 lg:order-none lg:px-8">
            <MediaSectionTabs active="podcasts" />

            <MediaChipRow
              ariaLabel="Podcast categories"
              options={categories}
              selected={category}
              onSelect={setCategory}
            />

            {shows.length > 0 && (
              <section className="mb-6">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">Shows</h2>
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                  {shows.map((s) => (
                    <Link
                      key={s._id}
                      href={`/qwerty-media/podcasts/show/${s._id}`}
                      className="w-40 shrink-0 rounded-xl border border-slate-200 bg-white p-3 hover:shadow-sm"
                    >
                      <div className="mb-2 h-24 w-full overflow-hidden rounded-lg bg-slate-100">
                        {s.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={mediaUrl(s.coverUrl)} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-slate-300">
                            <Mic className="h-8 w-8" />
                          </div>
                        )}
                      </div>
                      <p className="truncate text-sm font-medium text-slate-800">{s.title}</p>
                      <p className="text-xs text-slate-500">{s.episodeCount || 0} episodes</p>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Episodes</h2>
              {user && (
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
                >
                  <Plus className="h-4 w-4" />
                  New episode
                </button>
              )}
            </div>
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              </div>
            ) : episodes.length === 0 ? (
              <div className="rounded-2xl border border-slate-100 bg-white/90 p-12 text-center shadow-sm">
                <Mic className="mx-auto mb-4 h-16 w-16 text-slate-300" />
                <h3 className="mb-2 text-xl font-semibold text-slate-700">No episodes yet</h3>
                <p className="text-slate-600">No episodes in this category yet. Check another category or publish one.</p>
              </div>
            ) : (
              <div className={MEDIA_GRID_CLASS}>
                {episodes.map((ep) => {
                  const showTitle = typeof ep.podcastId === 'object' ? ep.podcastId?.title : undefined;
                  return (
                    <div
                      key={ep._id}
                      className="flex h-full min-h-[300px] flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm"
                    >
                      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-slate-100">
                        {ep.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={mediaUrl(ep.coverUrl)} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Mic className="h-12 w-12 text-slate-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 p-3">
                        <Link
                          href={`/qwerty-media/podcasts/${ep._id}`}
                          className="block truncate text-sm font-semibold text-slate-900 hover:text-amber-700"
                          title={ep.title}
                        >
                          {ep.title}
                        </Link>
                        <p className="truncate text-xs text-slate-500">
                          {showTitle ? `${showTitle} · ` : ''}
                          {formatDuration(ep.durationSeconds) || 'Audio'}
                          {ep.playCount ? ` · ${ep.playCount} plays` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 px-3 pb-3">
                        <button
                          type="button"
                          onClick={() => toggleLike(ep)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
                          aria-label="Like episode"
                        >
                          <Heart className={`h-4 w-4 ${likedIds.has(ep._id) ? 'fill-rose-500 text-rose-500' : ''}`} />
                          {ep.likeCount || 0}
                        </button>
                        {ep.locked ? (
                          <button
                            type="button"
                            onClick={() => unlock(ep)}
                            disabled={unlockingId === ep._id}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
                          >
                            {unlockingId === ep._id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Lock className="h-4 w-4" />
                            )}
                            R{ep.price}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => togglePlay(ep)}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600"
                            aria-label={playingId === ep._id ? 'Pause' : 'Play'}
                          >
                            {playingId === ep._id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            {playingId === ep._id ? 'Pause' : 'Play'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
          <AdvertSlot belowHeader />
        </div>
      </div>
      <CollapsibleBottomChrome>
        <MobileBottomNav cartCount={cartCount} hasStore={hasStore} embedded />
      </CollapsibleBottomChrome>

      {uploadOpen && (
        <UploadEpisodeModal
          shows={myShows}
          categories={categories}
          onClose={() => setUploadOpen(false)}
          onCreated={() => {
            setUploadOpen(false);
            void load();
          }}
        />
      )}
    </div>
      )}
    </ScrollAwareChromeRoot>
  );
}

function UploadEpisodeModal({
  shows,
  categories,
  onClose,
  onCreated,
}: {
  shows: PodcastShowRecord[];
  categories: { id: string; label: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [mode, setMode] = useState<'episode' | 'show'>(shows.length ? 'episode' : 'show');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const [showTitle, setShowTitle] = useState('');
  const [showCategory, setShowCategory] = useState('');
  const [showDescription, setShowDescription] = useState('');

  const [podcastId, setPodcastId] = useState(shows[0]?._id ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [price, setPrice] = useState('15');
  const [crossPost, setCrossPost] = useState(true);

  const createShow = async () => {
    if (!showTitle.trim() || !showCategory) {
      toast.error('Show title and category are required');
      return;
    }
    setBusy(true);
    try {
      const res = await podcastsAPI.createShow({
        title: showTitle.trim(),
        category: showCategory,
        description: showDescription.trim() || undefined,
      });
      toast.success('Show created');
      setPodcastId(res.data.data._id);
      setMode('episode');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not create show');
    } finally {
      setBusy(false);
    }
  };

  const createEpisode = async () => {
    if (!podcastId || !title.trim() || !audio) {
      toast.error('Show, title and audio file are required');
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      await podcastsAPI.createEpisode({
        podcastId,
        title: title.trim(),
        description: description.trim() || undefined,
        tags: tags.trim() || undefined,
        audio,
        cover: cover || undefined,
        isPremium,
        price: isPremium ? Number(price) : undefined,
        crossPostToTv: crossPost,
        onUploadProgress: setProgress,
      });
      toast.success('Episode published');
      onCreated();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === 'show' ? 'Create a podcast show' : 'Upload an episode'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 hover:bg-slate-100">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {shows.length > 0 && (
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setMode('episode')}
              className={`rounded-lg px-3 py-1.5 text-sm ${mode === 'episode' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}
            >
              Episode
            </button>
            <button
              type="button"
              onClick={() => setMode('show')}
              className={`rounded-lg px-3 py-1.5 text-sm ${mode === 'show' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}
            >
              New show
            </button>
          </div>
        )}

        {mode === 'show' ? (
          <div className="space-y-3">
            <input
              value={showTitle}
              onChange={(e) => setShowTitle(e.target.value)}
              placeholder="Show title"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <select
              value={showCategory}
              onChange={(e) => setShowCategory(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <textarea
              value={showDescription}
              onChange={(e) => setShowDescription(e.target.value)}
              placeholder="What is your show about?"
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={createShow}
              disabled={busy}
              className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? 'Creating…' : 'Create show'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <select
              value={podcastId}
              onChange={(e) => setPodcastId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              {shows.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.title}
                </option>
              ))}
            </select>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Episode title"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Episode description"
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Tags (comma separated)"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-600">
              <Upload className="h-4 w-4" />
              {audio ? audio.name : 'Choose audio file (MP3, AAC, M4A, WAV)'}
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => setAudio(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-600">
              <Upload className="h-4 w-4" />
              {cover ? cover.name : 'Optional episode cover image'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setCover(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={crossPost} onChange={(e) => setCrossPost(e.target.checked)} />
              Cross-post to the QwertyTV feed
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={isPremium} onChange={(e) => setIsPremium(e.target.checked)} />
              Premium episode (unlocked with ACBPay Wallet)
            </label>
            {isPremium && (
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="Price in ZAR"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            )}
            {busy && progress > 0 && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-amber-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
            <button
              type="button"
              onClick={createEpisode}
              disabled={busy}
              className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? `Uploading… ${progress}%` : 'Publish episode'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
