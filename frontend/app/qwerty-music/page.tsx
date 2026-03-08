'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Music2, CheckCircle, Clock, Upload, Loader2, X } from 'lucide-react';
import { SearchButton } from '@/components/SearchButton';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { AdvertSlot } from '@/components/AdvertSlot';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { musicAPI, getImageUrl, API_BASE } from '@/lib/api';
import type { SongRecord } from '@/lib/api';
import toast from 'react-hot-toast';

export default function QwertyMusicPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const [artistStatus, setArtistStatus] = useState<{ isVerified: boolean; status: string | null } | null>(null);
  const [songs, setSongs] = useState<SongRecord[]>([]);
  const [genres, setGenres] = useState<{ id: string; label: string }[]>([]);
  const [loadingSongs, setLoadingSongs] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadStep, setUploadStep] = useState<1 | 2 | 3>(1);
  const [applyType, setApplyType] = useState<'artist' | 'company' | 'producer'>('artist');
  const [stageName, setStageName] = useState('');
  const [labelName, setLabelName] = useState('');
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [applying, setApplying] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [songwriters, setSongwriters] = useState('');
  const [producer, setProducer] = useState('');
  const [genre, setGenre] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    musicAPI.getArtistStatus().then((r) => setArtistStatus(r.data?.data ?? null)).catch(() => setArtistStatus(null));
    musicAPI.getGenres().then((r) => setGenres(r.data?.data ?? [])).catch(() => setGenres([]));
  }, []);

  useEffect(() => {
    setLoadingSongs(true);
    musicAPI.getSongs()
      .then((r) => setSongs(r.data?.data ?? []))
      .catch(() => setSongs([]))
      .finally(() => setLoadingSongs(false));
  }, [uploadOpen]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const handleApply = async () => {
    if (!docFiles.length) {
      toast.error('Please upload at least one document');
      return;
    }
    setApplying(true);
    try {
      await musicAPI.artistApply({ type: applyType, stageName: stageName.trim() || undefined, labelName: labelName.trim() || undefined }, docFiles);
      toast.success('Application submitted. We will review manually.');
      setApplyOpen(false);
      setDocFiles([]);
      musicAPI.getArtistStatus().then((r) => setArtistStatus(r.data?.data ?? null));
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Application failed');
    } finally {
      setApplying(false);
    }
  };

  const resetUpload = () => {
    setUploadStep(1);
    setAudioFile(null);
    setArtworkFile(null);
    setTitle('');
    setArtist('');
    setSongwriters('');
    setProducer('');
    setGenre('');
    setLyrics('');
  };

  const handleUploadSong = async () => {
    if (!audioFile || !artworkFile) {
      toast.error('Please upload both audio and artwork');
      return;
    }
    if (!title.trim() || !artist.trim() || !genre.trim()) {
      toast.error('Title, artist, and genre are required');
      return;
    }
    setUploading(true);
    try {
      const res = await musicAPI.uploadSong(audioFile, artworkFile, {
        title: title.trim(),
        artist: artist.trim(),
        songwriters: songwriters.trim() || undefined,
        producer: producer.trim() || undefined,
        genre: genre.trim(),
        lyrics: lyrics.trim() || undefined,
      });
      const post = (res.data as any)?.post;
      if (post?._id && typeof sessionStorage !== 'undefined') {
        try {
          sessionStorage.setItem('qwerty_latest_post', JSON.stringify(post));
        } catch (_) {}
      }
      toast.success('Song uploaded successfully');
      resetUpload();
      setUploadOpen(false);
      musicAPI.getSongs().then((r) => setSongs(r.data?.data ?? []));
      musicAPI.getArtistStatus().then((r) => setArtistStatus(r.data?.data ?? null));
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const getArtworkUrl = (url: string) => {
    const path = getImageUrl(url) || url;
    return path.startsWith('http') ? path : `${API_BASE || ''}${path}`;
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
        <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
          <div className="px-4 sm:px-6 lg:px-8 py-2 sm:py-3">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <Link href="/wall" className="shrink-0 flex items-center" aria-label="Home">
                <img src="/qwertymates-logo-icon.png" alt="Qwertymates" className="h-8 w-8 object-contain lg:hidden" />
                <img src="/qwertymates-logo.png" alt="Qwertymates" className="h-8 w-auto object-contain hidden lg:block" />
              </Link>
              <AppSidebarMenuButton onClick={() => setMenuOpen(true)} />
              <div className="flex items-center gap-2 min-w-0 shrink-0">
                <Music2 className="h-5 w-5 text-sky-600" />
                <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">QwertyMusic</h1>
              </div>
              <div className="flex-1 min-w-0" />
              <SearchButton />
            </div>
          </div>
        </header>

        <div className="flex flex-1 min-h-0">
          <AppSidebar
            variant="wall"
            userName={user?.name}
            userAvatar={(user as any)?.avatar}
            userId={user?._id || user?.id}
            cartCount={cartCount}
            hasStore={hasStore}
            onLogout={handleLogout}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            hideLogo
            belowHeader
          />
          <div className="flex-1 flex gap-0 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
            <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-4 pb-24 lg:pb-6">
              <div className="max-w-6xl mx-auto space-y-6">
                <div className="rounded-2xl border border-white/60 bg-white/80 shadow-xl shadow-sky-50 backdrop-blur p-8 text-center">
                  <Music2 className="h-16 w-16 text-sky-400 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">QwertyMusic</h2>
                  <p className="text-slate-600 mb-4">
                    Music streaming and discovery. Upload high-quality WAV, artwork, and metadata as a verified artist.
                  </p>
                  <p className="text-sm text-slate-500">
                    <Link href="/morongwa-tv" className="text-sky-600 hover:text-sky-700 font-medium">QwertyTV</Link>
                    {' · '}
                    <Link href="/marketplace" className="text-sky-600 hover:text-sky-700 font-medium">QwertyHub</Link>
                  </p>
                </div>

                {/* Songs & Albums Grid */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-900">Songs & Albums</h3>
                    {artistStatus?.isVerified && (
                      <button
                        onClick={() => { resetUpload(); setUploadOpen(true); }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600"
                      >
                        <Upload className="h-4 w-4" />
                        Upload song
                      </button>
                    )}
                  </div>
                  {loadingSongs ? (
                    <div className="flex justify-center py-16">
                      <Loader2 className="h-10 w-10 animate-spin text-sky-500" />
                    </div>
                  ) : songs.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white/80 p-12 text-center text-slate-600">
                      <Music2 className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                      <p className="font-medium text-slate-900">No songs yet</p>
                      <p className="text-sm">Apply for artist verification to upload music.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {songs.map((s) => (
                        <div key={s._id} className="rounded-xl border border-slate-200 bg-white/90 overflow-hidden shadow-sm hover:shadow-md transition">
                          <div className="aspect-square bg-slate-100 relative">
                            <img
                              src={getArtworkUrl(s.artworkUrl)}
                              alt={s.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="p-3">
                            <p className="font-semibold text-slate-900 truncate" title={s.title}>{s.title}</p>
                            <p className="text-sm text-slate-600 truncate">{s.artist}</p>
                            <p className="text-xs text-slate-500">{s.genre}</p>
                          </div>
                          <audio src={`${API_BASE || ''}${s.audioUrl}`} controls className="w-full px-2 pb-2" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Artist verification */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Artist verification</h3>
                  {artistStatus?.isVerified ? (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 text-emerald-800">
                      <CheckCircle className="h-8 w-8 shrink-0" />
                      <div>
                        <p className="font-medium">You are verified</p>
                        <p className="text-sm">Upload songs with WAV audio, 3000×3000 artwork, and full metadata.</p>
                      </div>
                    </div>
                  ) : artistStatus?.status === 'pending' ? (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 text-amber-800">
                      <Clock className="h-8 w-8 shrink-0" />
                      <div>
                        <p className="font-medium">Application pending</p>
                        <p className="text-sm">We are reviewing your application. You will be notified when approved.</p>
                      </div>
                    </div>
                  ) : !applyOpen ? (
                    <div>
                      <p className="text-slate-600 mb-4">Apply to upload music. Verification can be electronic or manual.</p>
                      <button
                        onClick={() => setApplyOpen(true)}
                        className="px-4 py-2 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600"
                      >
                        Apply for verification
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                        <select value={applyType} onChange={(e) => setApplyType(e.target.value as any)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm">
                          <option value="artist">Artist</option>
                          <option value="company">Music company</option>
                          <option value="producer">Producer</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Stage / artist name (optional)</label>
                        <input type="text" value={stageName} onChange={(e) => setStageName(e.target.value)} placeholder="Stage name" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Label name (optional)</label>
                        <input type="text" value={labelName} onChange={(e) => setLabelName(e.target.value)} placeholder="Label" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Documents (ID, proof, etc.) *</label>
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          multiple
                          onChange={(e) => setDocFiles(Array.from(e.target.files || []))}
                          className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-sky-50 file:text-sky-700"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setApplyOpen(false)} className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50">Cancel</button>
                        <button onClick={handleApply} disabled={applying} className="flex-1 px-4 py-2 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600 disabled:opacity-50">
                          {applying ? 'Submitting…' : 'Submit'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </main>
            <AdvertSlot belowHeader />
          </div>
        </div>
        <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />

        {/* Upload modal */}
        {uploadOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Upload song</h3>
                <button onClick={() => { resetUpload(); setUploadOpen(false); }} className="p-2 rounded-lg hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                {/* Step 1: Audio */}
                {uploadStep === 1 && (
                  <div>
                    <h4 className="font-medium text-slate-900 mb-2">1. Upload audio</h4>
                    <p className="text-sm text-slate-600 mb-4">High-quality WAV files (16-bit, 44.1 kHz or higher)</p>
                    <input
                      type="file"
                      accept=".wav,audio/wav,audio/wave,audio/x-wav"
                      onChange={(e) => { setAudioFile(e.target.files?.[0] || null); if (e.target.files?.[0]) setUploadStep(2); }}
                      className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-sky-50 file:text-sky-700"
                    />
                    {audioFile && <p className="mt-2 text-sm text-emerald-600">✓ {audioFile.name}</p>}
                  </div>
                )}

                {/* Step 2: Artwork */}
                {uploadStep === 2 && (
                  <div>
                    <h4 className="font-medium text-slate-900 mb-2">2. Upload artwork</h4>
                    <p className="text-sm text-slate-600 mb-4">3000×3000 pixel square cover art (JPEG or PNG)</p>
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png"
                      onChange={(e) => { setArtworkFile(e.target.files?.[0] || null); if (e.target.files?.[0]) setUploadStep(3); }}
                      className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-sky-50 file:text-sky-700"
                    />
                    {artworkFile && <p className="mt-2 text-sm text-emerald-600">✓ {artworkFile.name}</p>}
                    <button onClick={() => setUploadStep(1)} className="mt-4 text-sm text-slate-600 hover:text-slate-900">← Back</button>
                  </div>
                )}

                {/* Step 3: Metadata */}
                {uploadStep === 3 && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-slate-900 mb-2">3. Add metadata</h4>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Song title *</label>
                      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song title" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Artist name *</label>
                      <input type="text" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Songwriters</label>
                      <input type="text" value={songwriters} onChange={(e) => setSongwriters(e.target.value)} placeholder="Songwriters" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Producer</label>
                      <input type="text" value={producer} onChange={(e) => setProducer(e.target.value)} placeholder="Producer" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Genre *</label>
                      <select value={genre} onChange={(e) => setGenre(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" required>
                        <option value="">Select genre</option>
                        {genres.map((g) => (
                          <option key={g.id} value={g.id}>{g.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Lyrics (explicitly marked)</label>
                      <textarea value={lyrics} onChange={(e) => setLyrics(e.target.value)} placeholder="Lyrics" rows={4} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm resize-none" />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => setUploadStep(2)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50">← Back</button>
                      <button onClick={handleUploadSong} disabled={uploading || !title.trim() || !artist.trim() || !genre} className="flex-1 px-4 py-2 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600 disabled:opacity-50">
                        {uploading ? <><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Uploading…</> : 'Upload song'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
