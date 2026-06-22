'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Loader2,
  Camera,
  Check,
  Download,
  Music2,
  Pencil,
  X,
} from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { usersAPI, getImageUrlFull, musicAPI, API_BASE } from '@/lib/api';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { MobileHeaderLogo } from '@/components/MobileHeaderLogo';
import { SearchButton } from '@/components/SearchButton';
import { SetPictureOptionsModal } from '@/components/SetPictureOptionsModal';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { ProfileLocationSettings } from '@/components/ProfileLocationSettings';
import type { PublicProfileLocation } from '@/lib/publicProfileLocation';

function initials(name: string) {
  if (!name) return 'S';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
}

function SchoolManageContent() {
  const params = useParams();
  const router = useRouter();
  const schoolUserId = params.schoolUserId as string;
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const [loading, setLoading] = useState(true);
  const [schoolUser, setSchoolUser] = useState<any>(null);
  const [schoolPage, setSchoolPage] = useState<{
    canEditProfile: boolean;
    canManageManagers: boolean;
    managerCount: number;
    isOwner: boolean;
  } | null>(null);
  const [nameValue, setNameValue] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [privateSaving, setPrivateSaving] = useState(false);
  const [pictureOpen, setPictureOpen] = useState(false);
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [galleryText, setGalleryText] = useState('');
  const [gallerySaving, setGallerySaving] = useState(false);
  const [publicEmail, setPublicEmail] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [downloads, setDownloads] = useState<any[]>([]);
  const [themeSavingId, setThemeSavingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const refreshSchool = useCallback(async () => {
    const res = await usersAPI.getProfileStats(schoolUserId);
    setSchoolUser(res.data?.user ?? null);
    setSchoolPage(res.data?.schoolPage ?? null);
    const u = res.data?.user;
    setNameValue(u?.name || '');
    setIsPrivate(!!u?.isPrivate);
    const g = (u?.profileGalleryUrls as string[]) || [];
    setGalleryText(g.join('\n'));
    setPublicEmail((u?.schoolPublicEmail as string) || '');
  }, [schoolUserId]);

  useEffect(() => {
    if (!schoolUserId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await usersAPI.getProfileStats(schoolUserId);
        if (cancelled) return;
        const sp = res.data?.schoolPage;
        if (!sp?.canEditProfile) {
          toast.error('You cannot manage this page');
          router.replace(`/user/${schoolUserId}`);
          return;
        }
        setSchoolUser(res.data?.user ?? null);
        setSchoolPage(sp);
        const u = res.data?.user;
        setNameValue(u?.name || '');
        setIsPrivate(!!u?.isPrivate);
        const g = (u?.profileGalleryUrls as string[]) || [];
        setGalleryText(g.join('\n'));
        setPublicEmail((u?.schoolPublicEmail as string) || '');
        const pur = await musicAPI.getMyPurchases();
        if (cancelled) return;
        const raw = pur.data?.data ?? pur.data ?? [];
        setDownloads(Array.isArray(raw) ? raw : []);
      } catch {
        if (!cancelled) {
          toast.error('Failed to load school page');
          router.replace(`/user/${schoolUserId}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolUserId, router]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const saveName = async () => {
    const n = nameValue.trim();
    if (n.length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }
    setNameSaving(true);
    try {
      await usersAPI.updateProfile(schoolUserId, { name: n });
      toast.success('Name updated');
      setEditingName(false);
      await refreshSchool();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to update name');
    } finally {
      setNameSaving(false);
    }
  };

  const togglePrivate = async () => {
    setPrivateSaving(true);
    try {
      await usersAPI.updateProfile(schoolUserId, { isPrivate: !isPrivate });
      setIsPrivate(!isPrivate);
      await refreshSchool();
      toast.success('Privacy updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed');
    } finally {
      setPrivateSaving(false);
    }
  };

  const saveGallery = async () => {
    const urls = galleryText
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    setGallerySaving(true);
    try {
      await usersAPI.updateProfile(schoolUserId, { profileGalleryUrls: urls.slice(0, 12) });
      toast.success('Gallery URLs saved');
      await refreshSchool();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed');
    } finally {
      setGallerySaving(false);
    }
  };

  const savePublicEmail = async () => {
    const trimmed = publicEmail.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error('Enter a valid email or leave blank to clear');
      return;
    }
    setEmailSaving(true);
    try {
      await usersAPI.updateProfile(schoolUserId, { schoolPublicEmail: trimmed });
      toast.success(trimmed ? 'Public contact email saved' : 'Public contact email cleared');
      await refreshSchool();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed');
    } finally {
      setEmailSaving(false);
    }
  };

  const handlePictureSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setPictureFile(file);
      setPictureOpen(true);
    }
    e.target.value = '';
  };

  const uploadAsAvatar = async () => {
    if (!pictureFile) return;
    try {
      await usersAPI.uploadAvatar(schoolUserId, pictureFile);
      toast.success('Profile picture updated');
      setPictureFile(null);
      await refreshSchool();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Upload failed');
    }
  };

  const uploadAsStrip = async () => {
    if (!pictureFile) return;
    try {
      await usersAPI.uploadStripBackground(schoolUserId, pictureFile);
      toast.success('Strip background updated');
      setPictureFile(null);
      await refreshSchool();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Upload failed');
    }
  };

  const handleSetThemeSong = async (songId: string | null) => {
    const marker = songId || '__clear__';
    setThemeSavingId(marker);
    try {
      await usersAPI.setThemeSong(schoolUserId, songId);
      toast.success(songId ? 'Theme song updated' : 'Theme song cleared');
      await refreshSchool();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to update theme song');
    } finally {
      setThemeSavingId(null);
    }
  };

  const handleDownload = async (songId: string) => {
    setDownloadingId(songId);
    try {
      const res = await musicAPI.getDownloadLinks(songId);
      const data = res.data?.data ?? res.data;
      if (!data) return;
      const toHref = (url: string) => (url?.startsWith('/uploads/') ? url : `${API_BASE || ''}${url || ''}`);
      if (data.type === 'album' && Array.isArray(data.tracks)) {
        data.tracks.forEach((t: any) => {
          const a = document.createElement('a');
          a.href = toHref(t.url);
          a.download = `${t.title || 'track'}.wav`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        });
      } else if (data.url) {
        const a = document.createElement('a');
        a.href = toHref(data.url);
        a.download = `${data.title || 'song'}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      toast.success('Download started');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading || !schoolUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-sky-500" />
      </div>
    );
  }

  const activeThemeSongId = String(schoolUser?.profileThemeSong?.songId || '');
  const roles = Array.isArray(user?.role) ? user.role : [user?.role];
  const variant = roles.includes('runner') ? 'runner' : 'client';

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900 flex">
      <AppSidebar
        variant={variant}
        userName={user?.name}
        userAvatar={(user as any)?.avatar}
        userId={user?._id || user?.id}
        cartCount={cartCount}
        hasStore={hasStore}
        onLogout={handleLogout}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white/85 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
          <div className="px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-2">
            <MobileHeaderLogo />
            <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} />
            <Link
              href={`/user/${schoolUserId}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-sky-600"
            >
              <ArrowLeft className="h-4 w-4" />
              View public page
            </Link>
            <div className="flex-1 min-w-0" />
            <SearchButton />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pb-24 lg:pb-8 px-4 sm:px-6 pt-4 max-w-2xl mx-auto w-full">
          <h1 className="text-xl font-bold text-slate-900">Manage school page</h1>
          <p className="text-sm text-slate-600 mt-1 mb-4">
            {schoolPage?.isOwner ? 'You are the page owner.' : 'You are a page manager.'} Up to five people can help
            manage this page — invite them from the public profile.
          </p>

          <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <label className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-slate-200 text-xl font-semibold text-slate-600 overflow-hidden cursor-pointer group">
                <input type="file" accept="image/*" className="hidden" onChange={handlePictureSelect} />
                {schoolUser.avatar ? (
                  <img src={getImageUrlFull(schoolUser.avatar)} alt="" className="w-full h-full object-cover" />
                ) : (
                  initials(schoolUser.name || 'S')
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="h-8 w-8 text-white" />
                </div>
              </label>
              <div className="flex-1 min-w-0">
                {editingName ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      value={nameValue}
                      onChange={(e) => setNameValue(e.target.value)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm flex-1 min-w-0 max-w-xs"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => void saveName()}
                      disabled={nameSaving}
                      className="p-1.5 rounded-lg bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingName(false);
                        setNameValue(schoolUser.name || '');
                      }}
                      disabled={nameSaving}
                      className="p-1.5 rounded-lg border border-slate-200"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-900">{schoolUser.name}</h2>
                    <button
                      type="button"
                      onClick={() => setEditingName(true)}
                      className="p-1 rounded text-slate-500 hover:text-sky-600"
                      title="Edit name"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={() => void togglePrivate()}
                    disabled={privateSaving}
                  />
                  Private page (follow requests)
                </label>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Profile gallery (URLs)</h3>
              <p className="text-xs text-slate-500 mb-2">One path per line, up to 12. Must start with /uploads/</p>
              <textarea
                value={galleryText}
                onChange={(e) => setGalleryText(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
              />
              <button
                type="button"
                onClick={() => void saveGallery()}
                disabled={gallerySaving}
                className="mt-2 rounded-lg bg-slate-800 text-white text-sm px-4 py-2 hover:bg-slate-900 disabled:opacity-50"
              >
                {gallerySaving ? 'Saving…' : 'Save gallery'}
              </button>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Profile location</h3>
              <ProfileLocationSettings
                userId={schoolUserId}
                initial={schoolUser.publicProfileLocation as PublicProfileLocation | undefined}
                onSaved={() => void refreshSchool()}
              />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Public contact email</h3>
              <p className="text-xs text-slate-500 mb-2">
                Shown on the public school profile (separate from the account login email). Leave blank to hide.
              </p>
              <input
                type="email"
                value={publicEmail}
                onChange={(e) => setPublicEmail(e.target.value)}
                placeholder="school@example.com"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void savePublicEmail()}
                disabled={emailSaving}
                className="mt-2 rounded-lg bg-slate-800 text-white text-sm px-4 py-2 hover:bg-slate-900 disabled:opacity-50"
              >
                {emailSaving ? 'Saving…' : 'Save email'}
              </button>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
                <Music2 className="h-4 w-4" />
                Theme song (your purchases)
              </h3>
              {schoolUser?.profileThemeSong?.audioUrl && (
                <div className="mb-3 rounded-lg border border-sky-100 bg-sky-50/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{schoolUser.profileThemeSong?.title || 'Theme'}</p>
                    <button
                      type="button"
                      onClick={() => void handleSetThemeSong(null)}
                      disabled={themeSavingId === '__clear__'}
                      className="text-xs px-2 py-1 rounded border border-slate-200 bg-white"
                    >
                      Clear theme
                    </button>
                  </div>
                  <audio
                    src={getImageUrlFull(schoolUser.profileThemeSong?.audioUrl)}
                    controls
                    className="mt-2 w-full h-9"
                  />
                </div>
              )}
              {downloads.length === 0 ? (
                <p className="text-sm text-slate-500">No purchases on your account — buy a song on QwertyMusic to set a theme.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {downloads.map((d) => (
                    <div key={d.songId} className="rounded-lg border border-slate-100 p-2 text-center">
                      <p className="text-xs font-medium text-slate-900 truncate">{d.song?.title || 'Song'}</p>
                      <button
                        type="button"
                        onClick={() => void handleSetThemeSong(String(d.songId))}
                        disabled={themeSavingId === String(d.songId)}
                        className="mt-2 w-full text-xs py-1.5 rounded bg-sky-500 text-white disabled:opacity-50"
                      >
                        {activeThemeSongId === String(d.songId) ? 'Active' : 'Use as theme'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDownload(d.songId)}
                        disabled={downloadingId === d.songId}
                        className="mt-1 w-full text-xs py-1 rounded border border-slate-200 flex items-center justify-center gap-1"
                      >
                        <Download className="h-3 w-3" />
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>

        <SetPictureOptionsModal
          open={pictureOpen}
          onClose={() => {
            setPictureOpen(false);
            setPictureFile(null);
          }}
          imagePreview={pictureFile ?? undefined}
          onSetProfilePic={() => void uploadAsAvatar()}
          onSetStripBackground={() => void uploadAsStrip()}
        />

        <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />
      </div>
    </div>
  );
}

export default function SchoolManagePage() {
  return (
    <ProtectedRoute>
      <SchoolManageContent />
    </ProtectedRoute>
  );
}
