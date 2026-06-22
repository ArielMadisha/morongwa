'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Download, Smartphone, ExternalLink } from 'lucide-react';
import { AppShellHeader } from '@/components/AppShellHeader';
import { AppSidebar } from '@/components/AppSidebar';
import { SearchButton } from '@/components/SearchButton';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { useAuth } from '@/contexts/AuthContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import {
  APPS_GALLERY_PAGE_URL,
  ERRANDS_ANDROID_PLAY_URL,
  MOBILE_RELEASES_MANIFEST_URL,
  galleryImageUrl,
  type MobileReleaseManifest,
} from '@/lib/mobileAppGallery';

const PLAY_BADGE_SRC =
  'https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png';

export default function AppsGalleryPage() {
  const { user } = useAuth();
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [manifest, setManifest] = useState<MobileReleaseManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(MOBILE_RELEASES_MANIFEST_URL, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`Manifest HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setManifest(data))
      .catch((e) => setError(e?.message || 'Could not load app gallery'))
      .finally(() => setLoading(false));
  }, []);

  const androidShots = manifest?.gallery?.android ?? [];
  const huaweiShots = manifest?.gallery?.huawei ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-white to-slate-50 text-slate-900">
      <AppShellHeader
        onMenuClick={() => setMenuOpen((v) => !v)}
        center={
          <>
            <Smartphone className="h-6 w-6 text-sky-600 shrink-0" />
            <h1 className="text-base sm:text-lg font-semibold text-slate-900">Qwertymates Apps</h1>
          </>
        }
        actions={
          <>
            <SearchButton />
            <ProfileHeaderButton />
          </>
        }
      />

      <div className="flex min-h-0 flex-1 w-full">
        {user ? (
          <AppSidebar
            variant="wall"
            cartCount={cartCount}
            hasStore={hasStore}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            hideLogo
            belowHeader
          />
        ) : null}

        <main className="flex-1 min-w-0 overflow-auto pb-16">
          <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
            <p className="text-slate-600">
              Download Qwertymates for Android and Huawei devices — hosted on our servers (no third-party store required).
            </p>

            {loading ? (
              <div className="mt-12 flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
              </div>
            ) : error ? (
              <p className="mt-8 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800">{error}</p>
            ) : (
              <div className="mt-8 space-y-8">
                {manifest?.pendingNote ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {manifest.pendingNote}
                    {manifest.pendingVersion ? ` Target: v${manifest.pendingVersion}.` : ''}
                  </p>
                ) : null}

                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-bold text-slate-900">Android (Google Play package)</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {manifest?.android?.label || 'AAB'} — v{manifest?.android?.version || '—'}
                    {manifest?.android?.versionCode ? ` (${manifest.android.versionCode})` : ''}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {manifest?.android?.url ? (
                      <a
                        href={manifest.android.url}
                        className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
                      >
                        <Download className="h-4 w-4" />
                        Download AAB from our server
                      </a>
                    ) : null}
                    <a
                      href={manifest?.android?.playStoreUrl || ERRANDS_ANDROID_PLAY_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2"
                    >
                      <img src={PLAY_BADGE_SRC} alt="Get it on Google Play" className="h-12 w-auto" />
                    </a>
                  </div>
                  {androidShots.length > 0 ? (
                    <div className="mt-6 flex gap-3 overflow-x-auto pb-2">
                      {androidShots.map((src) => (
                        <img
                          key={src}
                          src={galleryImageUrl(src)}
                          alt=""
                          className="h-48 w-auto rounded-lg border border-slate-200 object-cover shrink-0"
                        />
                      ))}
                    </div>
                  ) : null}
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-bold text-slate-900">Huawei (AppGallery)</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {manifest?.huawei?.label || 'AAB'} — v{manifest?.huawei?.version || '—'}
                    {manifest?.huawei?.versionCode ? ` (${manifest.huawei.versionCode})` : ''}
                  </p>
                  {manifest?.huawei?.note ? (
                    <p className="mt-2 text-xs text-slate-500">{manifest.huawei.note}</p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-3">
                    {manifest?.huawei?.url ? (
                      <a
                        href={manifest.huawei.url}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900"
                      >
                        <Download className="h-4 w-4" />
                        Download AAB from our server (Huawei AppGallery)
                      </a>
                    ) : null}
                  </div>
                  {huaweiShots.length > 0 ? (
                    <div className="mt-6 flex gap-3 overflow-x-auto pb-2">
                      {huaweiShots.map((src) => (
                        <img
                          key={src}
                          src={galleryImageUrl(src)}
                          alt=""
                          className="h-48 w-auto rounded-lg border border-slate-200 object-cover shrink-0"
                        />
                      ))}
                    </div>
                  ) : null}
                </section>

                <p className="text-xs text-slate-500">
                  Gallery manifest:{' '}
                  <a href={MOBILE_RELEASES_MANIFEST_URL} className="text-sky-600 hover:underline inline-flex items-center gap-1">
                    {MOBILE_RELEASES_MANIFEST_URL}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  {' · '}
                  Page: {APPS_GALLERY_PAGE_URL}
                </p>
              </div>
            )}

            <div className="mt-10">
              <Link href={user ? '/wall' : '/'} className="text-sky-600 font-medium hover:underline">
                ← Back
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
