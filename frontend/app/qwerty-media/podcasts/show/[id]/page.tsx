'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Bell, Loader2, Mic } from 'lucide-react';
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
import type { PodcastEpisodeRecord, PodcastShowRecord } from '@/lib/api';

export default function PodcastShowPage() {
  const params = useParams<{ id: string }>();
  const showId = String(params?.id || '');
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);

  const [show, setShow] = useState<PodcastShowRecord | null>(null);
  const [episodes, setEpisodes] = useState<PodcastEpisodeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);

  const load = useCallback(async () => {
    if (!showId) return;
    setLoading(true);
    try {
      const [showRes, epRes] = await Promise.all([
        podcastsAPI.getShow(showId),
        podcastsAPI.listEpisodes({ podcastId: showId, limit: 50 }),
      ]);
      setShow(showRes.data.data);
      setEpisodes(epRes.data.data || []);
    } catch {
      setShow(null);
    } finally {
      setLoading(false);
    }
  }, [showId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSubscribe = async () => {
    if (!user) {
      toast.error('Sign in to subscribe');
      return;
    }
    try {
      const res = await podcastsAPI.toggleSubscribe(showId);
      setSubscribed(res.data.data.subscribed);
      toast.success(res.data.data.subscribed ? 'Subscribed' : 'Unsubscribed');
    } catch {
      toast.error('Could not update subscription');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <AppShellHeader
        homeHref="/wall"
        center={
          <div className="flex min-w-0 items-center gap-2">
            <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} />
            <Mic className="h-5 w-5 shrink-0 text-amber-600" />
            <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg">
              {show?.title || 'QwertyPodcasts'}
            </h1>
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
            ) : !show ? (
              <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-slate-600">
                Show not found.{' '}
                <Link href="/qwerty-media/podcasts" className="text-amber-700 hover:underline">
                  Back to podcasts
                </Link>
              </div>
            ) : (
              <>
                <div className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                    {show.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={getImageUrl(show.coverUrl)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-300">
                        <Mic className="h-9 w-9" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-slate-900">{show.title}</h2>
                    <p className="text-sm text-slate-500">
                      {show.episodeCount || 0} episodes · {show.subscriberCount || 0} subscribers
                    </p>
                    {show.description && <p className="mt-2 text-sm text-slate-700">{show.description}</p>}
                    <button
                      type="button"
                      onClick={toggleSubscribe}
                      className={`mt-3 inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm ${
                        subscribed
                          ? 'border-amber-300 bg-amber-50 text-amber-800'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Bell className="h-4 w-4" />
                      {subscribed ? 'Subscribed' : 'Subscribe'}
                    </button>
                  </div>
                </div>

                <ul className="mt-5 space-y-2">
                  {episodes.map((ep) => (
                    <li key={ep._id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <Link
                        href={`/qwerty-media/podcasts/${ep._id}`}
                        className="text-sm font-semibold text-slate-900 hover:text-amber-700"
                      >
                        {ep.title}
                      </Link>
                      {ep.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{ep.description}</p>}
                    </li>
                  ))}
                  {episodes.length === 0 && <li className="text-sm text-slate-500">No episodes yet.</li>}
                </ul>
              </>
            )}
          </div>
        </main>
      </div>
      <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />
    </div>
  );
}
