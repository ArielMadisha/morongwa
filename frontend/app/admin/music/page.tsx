'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI, getImageUrl, API_BASE, usersAPI } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Music2, Loader2, Plus, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';

const MUSIC_GENRES = [
  'Pop', 'Hip Hop', 'R&B', 'Afrobeats', 'Amapiano', 'Gospel', 'Jazz', 'Rock',
  'Electronic', 'Reggae', 'Classical', 'Country', 'Folk', 'Soul', 'House',
  'Kwaito', 'Gqom', 'Maskandi', 'Traditional', 'Other',
];

interface SongRecord {
  _id: string;
  type?: 'song' | 'album';
  title: string;
  artist: string;
  genre: string;
  audioUrl: string;
  artworkUrl: string;
  tracks?: { title: string; audioUrl: string }[];
  downloadEnabled?: boolean;
  downloadPrice?: number;
  userId?: { _id: string; name?: string; email?: string };
  createdAt?: string;
}

function MusicManagement() {
  const [songs, setSongs] = useState<SongRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [trackFiles, setTrackFiles] = useState<File[]>([]);
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<'song' | 'album'>('song');
  const [form, setForm] = useState({
    title: '',
    artist: '',
    songwriters: '',
    producer: '',
    genre: '',
    lyrics: '',
    userId: '',
    downloadEnabled: false,
    downloadPrice: '10',
  });
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<{ _id: string; name?: string; email?: string; username?: string }[]>([]);
  const [userSearching, setUserSearching] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [selectedUserName, setSelectedUserName] = useState('');
  const userSearchRef = useRef<HTMLDivElement>(null);

  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) {
      setUserResults([]);
      return;
    }
    setUserSearching(true);
    try {
      const res = await usersAPI.list({ q: q.trim(), limit: 15 });
      const users = (res.data as any)?.users ?? [];
      setUserResults(users);
      setShowUserDropdown(true);
    } catch {
      setUserResults([]);
    } finally {
      setUserSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchUsers(userSearch), 200);
    return () => clearTimeout(t);
  }, [userSearch, searchUsers]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userSearchRef.current && !userSearchRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetchSongs();
  }, []);

  const fetchSongs = async () => {
    try {
      const res = await adminAPI.getMusicSongs();
      const data = res.data?.data ?? res.data ?? [];
      setSongs(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load songs');
      setSongs([]);
    } finally {
      setLoading(false);
    }
  };

  const resetUpload = () => {
    setAudioFile(null);
    setTrackFiles([]);
    setArtworkFile(null);
    setUploadType('song');
    setForm({ title: '', artist: '', songwriters: '', producer: '', genre: '', lyrics: '', userId: '', downloadEnabled: false, downloadPrice: '10' });
    setUserSearch('');
    setUserResults([]);
    setShowUserDropdown(false);
    setSelectedUserName('');
    setUploadOpen(false);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!artworkFile) {
      toast.error('Please upload artwork (JPEG/PNG)');
      return;
    }
    if (uploadType === 'song' && !audioFile) {
      toast.error('Please upload song audio (WAV)');
      return;
    }
    if (uploadType === 'album' && trackFiles.length === 0) {
      toast.error('Please upload album tracks (WAV)');
      return;
    }
    if (!form.title.trim() || !form.artist.trim() || !form.genre.trim()) {
      toast.error('Title, artist, and genre are required');
      return;
    }
    if (form.downloadEnabled && (Number(form.downloadPrice) < 10 || Number(form.downloadPrice) > 25)) {
      toast.error('Download price must be between R10 and R25');
      return;
    }
    setUploading(true);
    try {
      if (uploadType === 'album') {
        await adminAPI.uploadMusicAlbum(trackFiles, artworkFile, {
          title: form.title.trim(),
          artist: form.artist.trim(),
          songwriters: form.songwriters.trim() || undefined,
          producer: form.producer.trim() || undefined,
          genre: form.genre.trim(),
          lyrics: form.lyrics.trim() || undefined,
          userId: form.userId.trim() || undefined,
          downloadEnabled: form.downloadEnabled,
          downloadPrice: form.downloadEnabled ? Number(form.downloadPrice) : undefined,
        });
        toast.success('Album uploaded successfully');
      } else {
        await adminAPI.uploadMusicSong(audioFile as File, artworkFile, {
          title: form.title.trim(),
          artist: form.artist.trim(),
          songwriters: form.songwriters.trim() || undefined,
          producer: form.producer.trim() || undefined,
          genre: form.genre.trim(),
          lyrics: form.lyrics.trim() || undefined,
          userId: form.userId.trim() || undefined,
          downloadEnabled: form.downloadEnabled,
          downloadPrice: form.downloadEnabled ? Number(form.downloadPrice) : undefined,
        });
        toast.success('Song uploaded successfully');
      }
      resetUpload();
      fetchSongs();
    } catch (err: any) {
      const isNetworkError = err.code === 'ERR_NETWORK' || err.message?.includes('Network Error') || !err.response;
      const msg = isNetworkError
        ? 'Connection failed. Check that the backend is running and try again.'
        : (err.response?.data?.error || err.response?.data?.message || err.message || 'Upload failed');
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const getArtworkUrl = (url: string) => {
    if (!url) return '';
    return getImageUrl(url) || url;
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-sky-600">Qwertymates</p>
              <h1 className="mt-1 text-3xl font-semibold text-slate-900">QwertyMusic</h1>
              <p className="mt-1 text-sm text-slate-600">Load songs/albums. Admin uploads bypass artist verification.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setUploadOpen(true)}
                className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-sky-700"
              >
                <Plus className="h-4 w-4" />
                Upload song
              </button>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to admin
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 backdrop-blur">
            {loading ? (
              <div className="flex justify-center py-24">
                <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
              </div>
            ) : songs.length === 0 ? (
              <div className="py-16 text-center">
                <Music2 className="mx-auto h-16 w-16 text-slate-300" />
                <p className="mt-4 text-slate-600">No songs yet. Upload a song to get started.</p>
                <button
                  onClick={() => setUploadOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-white font-medium hover:bg-sky-600"
                >
                  <Upload className="h-4 w-4" />
                  Upload song
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
                      {s.type === 'album' && <p className="text-xs text-violet-600 mt-1">Album · {s.tracks?.length || 0} tracks</p>}
                      {s.downloadEnabled && <p className="text-xs text-emerald-700 mt-1">Downloads: R{Number(s.downloadPrice || 0).toFixed(0)}</p>}
                      {s.userId && (
                        <p className="text-xs text-slate-400 mt-1 truncate">{(s.userId as any).name || (s.userId as any).email}</p>
                      )}
                    </div>
                    <audio src={`${API_BASE || ''}${s.audioUrl}`} controls className="w-full px-2 pb-2" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {uploadOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Upload song</h3>
                <button onClick={resetUpload} className="p-2 rounded-lg hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleUpload} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type *</label>
                  <select
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value as 'song' | 'album')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  >
                    <option value="song">Song</option>
                    <option value="album">Album</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Song title *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Song title"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Artist name *</label>
                  <input
                    type="text"
                    value={form.artist}
                    onChange={(e) => setForm((f) => ({ ...f, artist: e.target.value }))}
                    placeholder="Artist"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Genre *</label>
                  <select
                    value={form.genre}
                    onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    required
                  >
                    <option value="">Select genre</option>
                    {MUSIC_GENRES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div ref={userSearchRef} className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Assign to user (optional)</label>
                  {form.userId ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                      <span className="text-sm text-slate-800 flex-1">Selected: {selectedUserName || 'User'}</span>
                      <button
                        type="button"
                        onClick={() => { setForm((f) => ({ ...f, userId: '' })); setSelectedUserName(''); setUserSearch(''); setUserResults([]); }}
                        className="text-slate-500 hover:text-slate-700 text-sm"
                      >
                        Clear
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => { setUserSearch(e.target.value); setShowUserDropdown(true); }}
                        onFocus={() => setShowUserDropdown(true)}
                        placeholder="Search by name (e.g. type O, Ob...)"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      />
                      {showUserDropdown && (
                        <div className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                          {userSearching ? (
                            <div className="px-3 py-4 text-center text-slate-500 text-sm">Searching…</div>
                          ) : !userSearch.trim() ? (
                            <div className="px-3 py-4 text-center text-slate-500 text-sm">Type to search users</div>
                          ) : userResults.length === 0 ? (
                            <div className="px-3 py-4 text-center text-slate-500 text-sm">No users found</div>
                          ) : (
                            userResults.map((u) => (
                              <button
                                key={u._id}
                                type="button"
                                onClick={() => {
                                  setForm((f) => ({ ...f, userId: u._id }));
                                  setSelectedUserName(u.name || u.username || u.email || 'User');
                                  setUserSearch('');
                                  setUserResults([]);
                                  setShowUserDropdown(false);
                                }}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-sky-50 flex flex-col"
                              >
                                <span className="font-medium text-slate-800">{u.name || u.username || 'Unknown'}</span>
                                {u.email && <span className="text-xs text-slate-500">{u.email}</span>}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {uploadType === 'album' ? 'Album tracks (WAV) *' : 'Audio (WAV) *'}
                  </label>
                  <p className="text-xs text-slate-500 mb-1">16-bit or 24-bit, 44.1 kHz, Stereo</p>
                  <input
                    type="file"
                    multiple={uploadType === 'album'}
                    accept=".wav,audio/wav,audio/wave,audio/x-wav"
                    onChange={(e) => {
                      if (uploadType === 'album') setTrackFiles(Array.from(e.target.files || []));
                      else setAudioFile(e.target.files?.[0] || null);
                    }}
                    className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-sky-50 file:text-sky-700"
                  />
                  {uploadType === 'album'
                    ? (trackFiles.length > 0 && <p className="mt-1 text-sm text-emerald-600">✓ {trackFiles.length} tracks selected</p>)
                    : (audioFile && <p className="mt-1 text-sm text-emerald-600">✓ {audioFile.name}</p>)}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Artwork (JPEG/PNG 1200×1200) *</label>
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png"
                    onChange={(e) => setArtworkFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-sky-50 file:text-sky-700"
                  />
                  {artworkFile && <p className="mt-1 text-sm text-emerald-600">✓ {artworkFile.name}</p>}
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.downloadEnabled}
                      onChange={(e) => setForm((f) => ({ ...f, downloadEnabled: e.target.checked }))}
                    />
                    Allow paid downloads (streaming stays default)
                  </label>
                  {form.downloadEnabled && (
                    <div className="mt-2">
                      <label className="block text-sm text-slate-700 mb-1">Download price (R10-R25)</label>
                      <input
                        type="number"
                        min={10}
                        max={25}
                        step={1}
                        value={form.downloadPrice}
                        onChange={(e) => setForm((f) => ({ ...f, downloadPrice: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      />
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-4">
                  <button type="button" onClick={resetUpload} className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      uploading ||
                      !artworkFile ||
                      (uploadType === 'song' ? !audioFile : trackFiles.length === 0) ||
                      !form.title.trim() ||
                      !form.artist.trim() ||
                      !form.genre.trim() ||
                      (form.downloadEnabled && (Number(form.downloadPrice) < 10 || Number(form.downloadPrice) > 25))
                    }
                    className="flex-1 px-4 py-2 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploading ? <><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Uploading…</> : uploadType === 'album' ? 'Upload album' : 'Upload song'}
                  </button>
                </div>
                <p className="pt-4 text-center text-sm text-slate-500">
                  Struggling to upload?{' '}
                  <Link href="/support?category=music:upload" className="text-sky-600 hover:underline font-medium">
                    Raise a support ticket
                  </Link>
                </p>
              </form>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}

export default function AdminMusicPage() {
  return <MusicManagement />;
}
