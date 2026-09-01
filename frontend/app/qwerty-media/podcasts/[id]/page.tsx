'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Bell, Heart, Loader2, Lock, Mic, Pause, Play, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { AppShellHeader } from '@/components/AppShellHeader';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { MediaSectionTabs } from '@/components/media/MediaSectionTabs';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { SearchButton } from '@/components/SearchButton';
import { useAuth } from '@/contexts/AuthContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { getImageUrl, podcastsAPI } from '@/lib/api';
import type { PodcastEpisodeRecord } from '@/lib/api';

type CommentRow = {
  _id: string;
  text: string;
  createdAt: string;
  userId?: { _id: string; name?: string; profilePicture?: string };
};

export default function PodcastEpisodePage() {
  const params = useParams<{ id: string }>();
  const episodeId = String(params?.id || '');
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);

  const [episode, setEpisode] = useState<PodcastEpisodeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [liked, setLiked] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    if (!episodeId) return;
    setLoading(true);
    try {
      const res = await podcastsAPI.getEpisode(episodeId);
      setEpisode(res.data.data);
      setLiked(!!res.data.data.liked);
      setSubscribed(!!res.data.data.subscribed);
    } catch {
      setEpisode(null);
    } finally {
      setLoading(false);
    }
  }, [episodeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!episodeId) return;
    podcastsAPI
      .listComments(episodeId)
      .then((res) => setComments((res.data.data as CommentRow[]) || []))
      .catch(() => setComments([]));
  }, [episodeId]);

  useEffect(() => () => audioRef.current?.pause(), []);

  const togglePlay = () => {
    if (!episode || episode.locked) return;
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    const el = audioRef.current ?? new Audio(getImageUrl(episode.audioUrl || ''));
    audioRef.current = el;
    el.onended = () => setPlaying(false);
    void el.play().catch(() => toast.error('Playback failed'));
    setPlaying(true);
    void podcastsAPI.recordPlay(episode._id, Math.round(el.currentTime || 0)).catch(() => undefined);
  };

  const toggleLike = async () => {
    if (!user) {
      toast.error('Sign in to like');
      return;
    }
    try {
      const res = await podcastsAPI.likeEpisode(episodeId);
      setLiked(res.data.data.liked);
      setEpisode((prev) => (prev ? { ...prev, likeCount: res.data.data.likeCount } : prev));
    } catch {
      toast.error('Could not update like');
    }
  };

  const toggleSubscribe = async () => {
    const showId = typeof episode?.podcastId === 'object' ? episode?.podcastId?._id : (episode?.podcastId as string);
    if (!showId) return;
    if (!user) {
      toast.error('Sign in to subscribe');
      return;
    }
    try {
      const res = await podcastsAPI.toggleSubscribe(showId);
      setSubscribed(res.data.data.subscribed);
      toast.success(res.data.data.subscribed ? 'Subscribed — you will be notified' : 'Unsubscribed');
    } catch {
      toast.error('Could not update subscription');
    }
  };

  const submitComment = async () => {
    if (!commentText.trim()) return;
    if (!user) {
      toast.error('Sign in to comment');
      return;
    }
    setPosting(true);
    try {
      await podcastsAPI.addComment(episodeId, commentText.trim());
      setCommentText('');
      const res = await podcastsAPI.listComments(episodeId);
      setComments((res.data.data as CommentRow[]) || []);
    } catch {
      toast.error('Could not post comment');
    } finally {
      setPosting(false);
    }
  };

  const unlock = async () => {
    setUnlocking(true);
    try {
      await podcastsAPI.unlockEpisode(episodeId);
      toast.success('Episode unlocked');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Unlock failed');
    } finally {
      setUnlocking(false);
    }
  };

  const showTitle = typeof episode?.podcastId === 'object' ? episode?.podcastId?.title : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
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
      <div className="flex min-h-0 w-full flex-1">
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
        <main className="w-full flex-1 overflow-y-auto px-4 pb-24 pt-2 sm:px-6 md:pb-8 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <MediaSectionTabs active="podcasts" className="mb-3" />
            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              </div>
            ) : !episode ? (
              <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-slate-600">
                Episode not found. <Link href="/qwerty-media/podcasts" className="text-amber-700 hover:underline">Back to podcasts</Link>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex gap-4">
                    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                      {episode.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={getImageUrl(episode.coverUrl)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-slate-300">
                          <Mic className="h-9 w-9" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold text-slate-900">{episode.title}</h2>
                      {showTitle && <p className="text-sm text-slate-500">{showTitle}</p>}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {episode.locked ? (
                          <button
                            type="button"
                            onClick={unlock}
                            disabled={unlocking}
                            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                          >
                            {unlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                            Unlock for R{episode.price}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={togglePlay}
                            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
                          >
                            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            {playing ? 'Pause' : 'Play'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={toggleLike}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                        >
                          <Heart className={`h-4 w-4 ${liked ? 'fill-rose-500 text-rose-500' : ''}`} />
                          {episode.likeCount || 0}
                        </button>
                        <button
                          type="button"
                          onClick={toggleSubscribe}
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm ${
                            subscribed ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <Bell className="h-4 w-4" />
                          {subscribed ? 'Subscribed' : 'Subscribe'}
                        </button>
                      </div>
                    </div>
                  </div>
                  {episode.description && (
                    <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{episode.description}</p>
                  )}
                </div>

                <section className="mt-5">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">Comments</h3>
                  <div className="mb-3 flex gap-2">
                    <input
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Add a comment"
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={submitComment}
                      disabled={posting}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {comments.map((c) => (
                      <li key={c._id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-xs font-medium text-slate-700">{c.userId?.name || 'User'}</p>
                        <p className="mt-1 text-sm text-slate-700">{c.text}</p>
                      </li>
                    ))}
                    {comments.length === 0 && <li className="text-sm text-slate-500">No comments yet.</li>}
                  </ul>
                </section>
              </>
            )}
          </div>
        </main>
      </div>
      <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />
    </div>
  );
}
