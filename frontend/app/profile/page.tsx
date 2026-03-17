"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, LayoutDashboard, Wallet, ClipboardList, HelpCircle, ShieldCheck, Lock, Radio, UserCheck, Camera, Pencil, Check, X, Download, Music2, LayoutGrid } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { usersAPI, followsAPI, musicAPI, getImageUrl, API_BASE } from "@/lib/api";
import { AppSidebar, AppSidebarMenuButton } from "@/components/AppSidebar";
import { SearchButton } from "@/components/SearchButton";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { SetPictureOptionsModal } from "@/components/SetPictureOptionsModal";
import { ContentPreferencesModal } from "@/components/ContentPreferencesModal";
import { useCartAndStores } from "@/lib/useCartAndStores";
import toast from "react-hot-toast";

function initials(name: string) {
  if (!name) return "M";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
}

export default function ProfilePage() {
  const { user, logout, refreshUser } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [pictureOptionsOpen, setPictureOptionsOpen] = useState(false);
  const [selectedPictureFile, setSelectedPictureFile] = useState<File | null>(null);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameValue, setUsernameValue] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneValue, setPhoneValue] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [downloads, setDownloads] = useState<Array<{ songId: string; song?: { _id: string; title?: string; artist?: string; artworkUrl?: string; type?: string; tracks?: { title: string; audioUrl: string }[] }; amount: number; createdAt: string }>>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [contentPrefsOpen, setContentPrefsOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);

  useEffect(() => {
    if (user) {
      setIsPrivate(!!(user as any).isPrivate);
      setIsLive(!!(user as any).isLive);
      followsAPI.getPendingRequests().then((res) => {
        const data = res.data?.data ?? res.data ?? [];
        setPendingRequests(Array.isArray(data) ? data : []);
      }).catch(() => setPendingRequests([]));
      musicAPI.getMyPurchases().then((res) => {
        const data = res.data?.data ?? res.data ?? [];
        setDownloads(Array.isArray(data) ? data : []);
      }).catch(() => setDownloads([]));
    }
  }, [user]);

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

  const handleTogglePrivate = async () => {
    if (!user?._id && !user?.id) return;
    try {
      await usersAPI.updateProfile(user._id || user.id!, { isPrivate: !isPrivate });
      setIsPrivate(!isPrivate);
      refreshUser?.();
    } catch {
      // error handled by toast in API
    }
  };

  const handleToggleLive = async () => {
    if (!user?._id && !user?.id) return;
    try {
      const res = await usersAPI.toggleLive(user._id || user.id!);
      setIsLive(res.data?.isLive ?? false);
      refreshUser?.();
    } catch {
      // error handled
    }
  };

  const getFollowerId = (r: any) => (r.followerId && typeof r.followerId === 'object' ? r.followerId._id : r.followerId)?.toString?.() ?? '';
  const handleAcceptRequest = async (followerId: string) => {
    try {
      await followsAPI.acceptRequest(followerId);
      setPendingRequests((p) => p.filter((r: any) => getFollowerId(r) !== followerId));
    } catch {
      // error
    }
  };

  const handleRejectRequest = async (followerId: string) => {
    try {
      await followsAPI.rejectRequest(followerId);
      setPendingRequests((p) => p.filter((r: any) => getFollowerId(r) !== followerId));
    } catch {
      // error
    }
  };

  const handlePictureFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedPictureFile(file);
      setPictureOptionsOpen(true);
    }
    e.target.value = '';
  };

  const handleSetProfilePic = async () => {
    if (!selectedPictureFile || !user?._id && !user?.id) return;
    try {
      await usersAPI.uploadAvatar(user._id || user.id!, selectedPictureFile);
      toast.success('Profile picture updated');
      setSelectedPictureFile(null);
      refreshUser?.();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to update profile picture');
    }
  };

  const handleSetStripBackground = async () => {
    if (!selectedPictureFile || !user?._id && !user?.id) return;
    try {
      await usersAPI.uploadStripBackground(user._id || user.id!, selectedPictureFile);
      toast.success('Strip background updated');
      setSelectedPictureFile(null);
      refreshUser?.();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to update strip background');
    }
  };

  const startEditUsername = () => {
    setUsernameValue((user as any).username || "");
    setEditingUsername(true);
  };

  const cancelEditUsername = () => {
    setEditingUsername(false);
    setUsernameValue("");
  };

  const formatPhoneDisplay = (p?: string) => {
    if (!p) return "Not set";
    const d = p.replace(/\D/g, "");
    if (d.startsWith("27") && d.length >= 11) return `+27 ${d.slice(2, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
    return p;
  };

  const savePhone = async () => {
    const digits = phoneValue.replace(/\D/g, "");
    if (digits.length < 10) {
      toast.error("Enter a valid phone number (at least 10 digits)");
      return;
    }
    if (!user?._id && !user?.id) return;
    setPhoneSaving(true);
    try {
      await usersAPI.updateProfile(user._id || user.id!, { phone: digits });
      toast.success("Phone number updated. Required for QR payments and money requests.");
      setEditingPhone(false);
      setPhoneValue("");
      refreshUser?.();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Failed to update");
    } finally {
      setPhoneSaving(false);
    }
  };

  const saveUsername = async () => {
    const uname = usernameValue.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
    if (uname.length < 2) {
      toast.error("Username must be at least 2 characters (letters, numbers, underscore)");
      return;
    }
    if (!user?._id && !user?.id) return;
    setUsernameSaving(true);
    try {
      await usersAPI.updateProfile(user._id || user.id!, { username: uname });
      toast.success("Username updated");
      setEditingUsername(false);
      setUsernameValue("");
      refreshUser?.();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Username already taken");
    } finally {
      setUsernameSaving(false);
    }
  };

  if (!user) return null;

  const roles = Array.isArray(user.role) ? user.role : [user.role];
  const statusLabel = user.suspended ? "Suspended" : user.active ? "Active" : "Inactive";
  const variant = roles.includes("runner") ? "runner" : "client";

  const dashboardHref = roles.includes("admin") || roles.includes("superadmin")
    ? "/admin"
    : roles.length > 1
    ? "/dashboard"
    : roles.includes("runner")
    ? "/dashboard/runner"
    : "/dashboard/client";

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900 flex">
        <AppSidebar
          variant={variant}
          userName={user?.name}
          userAvatar={(user as any)?.avatar}
          userId={user?._id || user?.id}
          cartCount={cartCount}
          hasStore={hasStore}
          onLogout={logout}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-white/85 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
            <div className="px-4 sm:px-6 lg:px-8 py-2 sm:py-3 flex items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} />
                <Link
                  href={dashboardHref}
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to dashboard
                </Link>
              </div>
              <div className="flex-1 min-w-0" />
              <SearchButton />
            </div>
          </header>
          <div className="flex-1 overflow-auto pb-24 lg:pb-0">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 pb-8">
          <div className="mb-4">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">My profile</h1>
            <p className="text-slate-600 text-sm mt-0.5">The Digital Home for Doers, Sellers & Creators.</p>
          </div>

          {/* Profile card */}
          <div className="rounded-2xl bg-white border border-slate-100 shadow-lg shadow-blue-900/5 overflow-hidden">
            <div className="p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                <label className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-2xl font-semibold text-white overflow-hidden cursor-pointer group">
                  <input type="file" accept="image/*" className="hidden" onChange={handlePictureFileSelect} />
                  {(user as any).avatar ? (
                    <img src={getImageUrl((user as any).avatar)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    initials(user.name)
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="h-8 w-8 text-white" />
                  </div>
                </label>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold text-slate-900">{user.name}</h2>
                  <p className="text-slate-600">{user.email}</p>
                  <div className="mt-2 flex items-center gap-2">
                    {editingUsername ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-slate-500 text-sm">@</span>
                          <input
                            type="text"
                            value={usernameValue}
                            onChange={(e) => setUsernameValue(e.target.value)}
                            placeholder="username"
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm w-40 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveUsername();
                              if (e.key === "Escape") cancelEditUsername();
                            }}
                          />
                          <button
                            onClick={saveUsername}
                            disabled={usernameSaving}
                            className="p-1.5 rounded-lg bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={cancelEditUsername}
                            disabled={usernameSaving}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-500">Letters, numbers, underscore (2–30 chars)</p>
                      </div>
                    ) : (
                      <span className="text-slate-600 text-sm">
                        @{(user as any).username || "not set"}
                      </span>
                    )}
                    {!editingUsername && (
                      <button
                        onClick={startEditUsername}
                        className="p-1 rounded text-slate-500 hover:text-sky-600 hover:bg-sky-50"
                        title="Edit username"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700">
                    <ShieldCheck className="h-4 w-4" />
                    {roles.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(" + ")}
                  </div>
                </div>
              </div>

              {/* Phone - required for QR payments & money requests */}
              <div className="mt-6 pt-6 border-t border-slate-100">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Phone</p>
                <p className="text-xs text-slate-500 mt-0.5">Required for QR payments at stores and money requests (WhatsApp/SMS).</p>
                <div className="mt-2 flex items-center gap-2">
                  {editingPhone ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="tel"
                          value={phoneValue}
                          onChange={(e) => setPhoneValue(e.target.value)}
                          placeholder="+27 82 123 4567"
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm w-48 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") savePhone();
                            if (e.key === "Escape") { setEditingPhone(false); setPhoneValue(""); }
                          }}
                        />
                        <button onClick={savePhone} disabled={phoneSaving} className="p-1.5 rounded-lg bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50">
                          <Check className="h-4 w-4" />
                        </button>
                        <button onClick={() => { setEditingPhone(false); setPhoneValue(""); }} disabled={phoneSaving} className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="text-slate-700 text-sm">{formatPhoneDisplay((user as any).phone)}</span>
                      <button onClick={() => { setEditingPhone(true); setPhoneValue((user as any).phone || ""); }} className="p-1 rounded text-slate-500 hover:text-sky-600 hover:bg-sky-50" title="Edit phone">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Status row */}
              <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{statusLabel}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Verification</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {user.isVerified ? "Verified" : "Pending"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Joined</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {new Date(user.createdAt || '').toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Privacy & Go Live */}
              <div className="mt-6 pt-6 border-t border-slate-100 space-y-4">
                <h3 className="text-sm font-semibold text-slate-700">Privacy & live</h3>
                <label className="flex items-center justify-between gap-4 cursor-pointer">
                  <span className="flex items-center gap-2 text-sm text-slate-700">
                    <Lock className="h-4 w-4 text-slate-500" />
                    Private account
                  </span>
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={handleTogglePrivate}
                    className="rounded text-sky-600"
                  />
                </label>
                <p className="text-xs text-slate-500">When private, others must request to follow. You approve each request.</p>
                <button
                  type="button"
                  onClick={() => setContentPrefsOpen(true)}
                  className="flex items-center justify-between gap-4 w-full px-4 py-3 rounded-xl border border-slate-200 hover:border-sky-200 hover:bg-sky-50/50 text-left transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm text-slate-700">
                    <LayoutGrid className="h-4 w-4 text-slate-500" />
                    Customize feed
                  </span>
                  <span className="text-xs text-slate-500">Products, content</span>
                </button>
                <label className="flex items-center justify-between gap-4 cursor-pointer">
                  <span className="flex items-center gap-2 text-sm text-slate-700">
                    <Radio className="h-4 w-4 text-red-500" />
                    Go live
                  </span>
                  <input
                    type="checkbox"
                    checked={isLive}
                    onChange={handleToggleLive}
                    className="rounded text-sky-600"
                  />
                </label>
                <p className="text-xs text-slate-500">When live, you appear in statuses and on QwertyTV.</p>
              </div>

              {/* Upload profile picture / strip background */}
              <div className="mt-6 pt-6 border-t border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Profile picture</h3>
                <p className="text-xs text-slate-500 mb-2">Click your avatar above to upload a new picture. You can set it as profile picture or strip background.</p>
              </div>

              {isPrivate && pendingRequests.length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <UserCheck className="h-4 w-4" /> Follow requests ({pendingRequests.length})
                  </h3>
                  <ul className="space-y-2">
                    {pendingRequests.map((req: any) => {
                      const follower = req.followerId || req;
                      const fid = String(typeof follower === 'object' ? follower._id : follower);
                      return (
                        <li key={req._id || fid} className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 last:border-0">
                          <span className="text-sm font-medium text-slate-900">
                            {typeof follower === 'object' ? follower.name : 'User'}
                          </span>
                          <div className="flex gap-2">
                            <button onClick={() => handleAcceptRequest(fid)} className="px-3 py-1 rounded-lg bg-sky-500 text-white text-xs font-medium hover:bg-sky-600">Accept</button>
                            <button onClick={() => handleRejectRequest(fid)} className="px-3 py-1 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50">Reject</button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Downloads - purchased songs & videos */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Download className="h-4 w-4" /> Downloads
            </h3>
            {downloads.length === 0 ? (
              <div className="rounded-xl border border-slate-100 bg-white p-6 text-center text-slate-500">
                <Music2 className="h-12 w-12 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">No downloads yet</p>
                <p className="text-xs mt-1">Songs and albums you purchase appear here. Download anytime.</p>
                <Link href="/qwerty-music" className="mt-3 inline-block text-sm font-medium text-sky-600 hover:text-sky-700">Browse QwertyMusic</Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {downloads.map((d) => (
                  <div key={d.songId} className="rounded-xl border border-slate-100 bg-white overflow-hidden shadow-sm hover:shadow-md transition">
                    <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
                      {d.song?.artworkUrl ? (
                        <img src={getImageUrl(d.song.artworkUrl)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Music2 className="h-12 w-12 text-slate-400" />
                      )}
                    </div>
                    <div className="p-2">
                      <p className="font-medium text-slate-900 text-sm truncate" title={d.song?.title}>{d.song?.title || 'Song'}</p>
                      {d.song?.artist && <p className="text-xs text-slate-600 truncate">{d.song.artist}</p>}
                      {d.song?.type === 'album' && Array.isArray(d.song?.tracks) && d.song.tracks.length > 0 && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-100">
                          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mb-0.5">Tracks</p>
                          <ol className="space-y-0.5 text-[11px] text-slate-600 max-h-16 overflow-y-auto">
                            {d.song.tracks.map((t, i) => (
                              <li key={i} className="truncate" title={t.title}>{i + 1}. {t.title}</li>
                            ))}
                          </ol>
                        </div>
                      )}
                      <button
                        onClick={() => handleDownload(d.songId)}
                        disabled={downloadingId === d.songId}
                        className="mt-1.5 w-full py-1.5 rounded-lg bg-sky-500 text-white text-xs font-medium hover:bg-sky-600 disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {downloadingId === d.songId ? 'Preparing...' : (d.song?.type === 'album' ? 'Download album' : 'Download')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Quick links</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Link
                href={dashboardHref}
                className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <LayoutDashboard className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">Dashboard</p>
                  <p className="text-sm text-slate-500">Stay on top of tasks</p>
                </div>
              </Link>
              <Link
                href="/wallet"
                className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">Wallet & payments</p>
                  <p className="text-sm text-slate-500">Manage your funds</p>
                </div>
              </Link>
              <Link
                href="/wall"
                className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">Browse tasks</p>
                  <p className="text-sm text-slate-500">Find the right fit</p>
                </div>
              </Link>
              <Link
                href="/support?category=general:account"
                className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <HelpCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">Get help</p>
                  <p className="text-sm text-slate-500">Support & contact</p>
                </div>
              </Link>
            </div>
          </div>

          {/* Security tip */}
          <div className="mt-8 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-700">Stay secure:</span> Log out on shared devices.
              Spot something unusual?{" "}
              <Link href="/support?category=general:account" className="font-medium text-blue-600 hover:text-blue-700">
                Report an issue
              </Link>
            </p>
          </div>
        </div>
          </div>
        </div>
      </div>
      <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />

      <SetPictureOptionsModal
        open={pictureOptionsOpen}
        onClose={() => { setPictureOptionsOpen(false); setSelectedPictureFile(null); }}
        imagePreview={selectedPictureFile ?? undefined}
        onSetProfilePic={handleSetProfilePic}
        onSetStripBackground={handleSetStripBackground}
      />
      <ContentPreferencesModal
        open={contentPrefsOpen}
        onClose={() => setContentPrefsOpen(false)}
        user={user}
        onSaved={() => {
          refreshUser?.();
        }}
      />
    </ProtectedRoute>
  );
}
