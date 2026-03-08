'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI, getImageUrl, API_BASE } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Music2, Loader2, Plus, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface SongRecord {
  _id: string;
  title: string;
  artist: string;
  genre: string;
  audioUrl: string;
  artworkUrl: string;
  userId?: { _id: string; name?: string; email?: string };
  createdAt?: string;
}

function MusicManagement() {
  const [songs, setSongs] = useState<SongRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    title: '',
    artist: '',
    songwriters: '',
    producer: '',
    genre: '',
    lyrics: '',
    userId: '',
  });

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
    setArtworkFile(null);
    setForm({ title: '', artist: '', songwriters: '', producer: '', genre: '', lyrics: '', userId: '' });
    setUploadOpen(false);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioFile || !artworkFile) {
      toast.error('Please upload both audio (WAV) and artwork (JPEG/PNG)');
      return;
    }
    if (!form.title.trim() || !form.artist.trim() || !form.genre.trim()) {
      toast.error('Title, artist, and genre are required');
      return;
    }
    setUploading(true);
    try {
      await adminAPI.uploadMusicSong(audioFile, artworkFile, {
        title: form.title.trim(),
        artist: form.artist.trim(),
        songwriters: form.songwriters.trim() || undefined,
        producer: form.producer.trim() || undefined,
        genre: form.genre.trim(),
        lyrics: form.lyrics.trim() || undefined,
        userId: form.userId.trim() || undefined,
      });
      toast.success('Song uploaded successfully');
      resetUpload();
      fetchSongs();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const getArtworkUrl = (url: string) => {
    const path = getImageUrl(url) || url;
    return path.startsWith('http') ? path : `${API_BASE || ''}${path}`;
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
                  <input
                    type="text"
                    value={form.genre}
                    onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))}
                    placeholder="e.g. Pop, Amapiano"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">User ID (optional)</label>
                  <input
                    type="text"
                    value={form.userId}
                    onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                    placeholder="Assign to user (leave empty = admin)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Audio (WAV) *</label>
                  <input
                    type="file"
                    accept=".wav,audio/wav,audio/wave,audio/x-wav"
                    onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-sky-50 file:text-sky-700"
                  />
                  {audioFile && <p className="mt-1 text-sm text-emerald-600">✓ {audioFile.name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Artwork (JPEG/PNG 3000×3000) *</label>
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png"
                    onChange={(e) => setArtworkFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-sky-50 file:text-sky-700"
                  />
                  {artworkFile && <p className="mt-1 text-sm text-emerald-600">✓ {artworkFile.name}</p>}
                </div>
                <div className="flex gap-2 pt-4">
                  <button type="button" onClick={resetUpload} className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading || !audioFile || !artworkFile || !form.title.trim() || !form.artist.trim() || !form.genre.trim()}
                    className="flex-1 px-4 py-2 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploading ? <><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Uploading…</> : 'Upload song'}
                  </button>
                </div>
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
