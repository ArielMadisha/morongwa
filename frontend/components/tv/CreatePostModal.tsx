'use client';
import { useState, useRef, useEffect } from 'react';
import { X, Upload, ImagePlus, Video, Radio, Plus, Mic, Music2, ChevronLeft, Loader2 } from 'lucide-react';

/** Store created post so Home/Wall can show it when user navigates there */
function storeLatestPostForHome(created: any) {
  if (created?._id && typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem('qwerty_latest_post', JSON.stringify(created));
    } catch (_) {}
  }
}
import Link from 'next/link';
import { tvAPI, musicAPI, getImageUrl, usersAPI } from '@/lib/api';
import { QSpinner } from '@/components/QSpinner';
import { GENRES } from './GenresDropdown';
import type { Product } from '@/lib/types';
import toast from 'react-hot-toast';

const MAX_CAROUSEL_IMAGES = 20;
const QWERTZ_MAX_DURATION_SECONDS = 180; // 3 minutes

const FILTERS = [
  { id: 'none', label: 'None' },
  { id: 'warm', label: 'Warm' },
  { id: 'cool', label: 'Cool' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'grayscale', label: 'Grayscale' },
];

interface CreatePostModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (created?: any) => void;
  featuredProducts?: (Product & { _id: string })[];
  currentUserId?: string;
}

export function CreatePostModal({
  open,
  onClose,
  onCreated,
  featuredProducts = [],
  currentUserId,
}: CreatePostModalProps) {
  const [step, setStep] = useState<'upload' | 'details'>('upload');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [type, setType] = useState<'video' | 'image' | 'carousel' | 'audio'>('image');
  const [caption, setCaption] = useState('');
  const [filter, setFilter] = useState<string>('');
  const [genre, setGenre] = useState<string>('qwertz');
  const [productId, setProductId] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [heading, setHeading] = useState('');
  const [subject, setSubject] = useState('');
  const [hashtagsInput, setHashtagsInput] = useState('');
  const [spinnerMode, setSpinnerMode] = useState<'off' | 'loop' | 'once'>('off');
  const [audioStep, setAudioStep] = useState<'choose' | 'record' | 'upload' | 'record-details' | 'upload-details' | null>(null);
  const [artistVerified, setArtistVerified] = useState<boolean | null>(null);
  const [musicGenre, setMusicGenre] = useState('');
  const [musicTitle, setMusicTitle] = useState('');
  const [artworkUrl, setArtworkUrl] = useState('');
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [mySongs, setMySongs] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qwertzInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);

  const validateQwertzVideoDuration = (file: File) =>
    new Promise<void>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const media = document.createElement('video');
      media.preload = 'metadata';
      media.src = url;
      media.onloadedmetadata = () => {
        const duration = Number(media.duration || 0);
        URL.revokeObjectURL(url);
        if (!duration || Number.isNaN(duration)) {
          reject(new Error('Could not read video duration.'));
          return;
        }
        if (duration > QWERTZ_MAX_DURATION_SECONDS) {
          reject(new Error('Qwertz videos must be 3 minutes or less.'));
          return;
        }
        resolve();
      };
      media.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Invalid video file.'));
      };
    });

  useEffect(() => {
    if (audioStep === 'choose' && currentUserId) {
      musicAPI.getArtistStatus().then((r) => setArtistVerified(r.data?.data?.isVerified ?? false)).catch(() => setArtistVerified(false));
    }
  }, [audioStep, currentUserId]);

  useEffect(() => {
    if (audioStep === 'upload' && artistVerified && currentUserId) {
      musicAPI.getSongs().then((r) => {
        const all = r.data?.data ?? [];
        const mine = all.filter((s: any) => {
          const uid = s.userId?._id ?? s.userId;
          return uid && String(uid) === String(currentUserId);
        });
        setMySongs(mine);
      }).catch(() => setMySongs([]));
    }
  }, [audioStep, artistVerified, currentUserId]);

  const artworkInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setMediaUrls([]);
    setType('image');
    setCaption('');
    setFilter('');
    setGenre('qwertz');
    setProductId('');
    setUploading(false);
    setPosting(false);
    setHeading('');
    setSubject('');
    setHashtagsInput('');
    setSpinnerMode('off');
    setAudioStep(null);
    setArtistVerified(null);
    setMusicGenre('');
    setMusicTitle('');
    setArtworkUrl('');
    setSelectedSongId(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      if (files.length === 1) {
        const file = files[0];
        const isVideo = file.type.startsWith('video/');
        const res = await tvAPI.uploadMedia(file);
        const url = res.data?.url ?? (res.data as any)?.url;
        if (url) {
          setMediaUrls([url]);
          setType(isVideo ? 'video' : 'image');
          setStep('details');
        }
      } else {
        const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
        if (imageFiles.length === 0) {
          toast.error('Please select images only for carousel');
          return;
        }
        const res = await tvAPI.uploadImages(imageFiles.slice(0, MAX_CAROUSEL_IMAGES));
        const urls = res.data?.urls ?? (res.data as any)?.urls ?? (res.data as any)?.data?.urls ?? [];
        if (urls.length) {
          setMediaUrls(urls);
          setType('carousel');
          setStep('details');
        } else {
          toast.error('No images could be uploaded. Try again or use smaller images.');
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imagesInputRef.current) imagesInputRef.current.value = '';
    }
  };

  const handleQwertzSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      toast.error('Please select a video file for Qwertz');
      return;
    }
    setUploading(true);
    try {
      await validateQwertzVideoDuration(file);
      const res = await tvAPI.uploadMedia(file);
      const url = res.data?.url ?? (res.data as any)?.url;
      if (url) {
        setMediaUrls([url]);
        setType('video');
        setGenre('qwertz');
        setStep('details');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to upload Qwertz video');
    } finally {
      setUploading(false);
      if (qwertzInputRef.current) qwertzInputRef.current.value = '';
    }
  };

  const handleSubmitTextPost = async () => {
    const h = heading.trim();
    const s = subject.trim();
    const tags = hashtagsInput
      .split(/[\s,]+/)
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);
    setSpinnerMode('loop');
    try {
      const res = await tvAPI.createPost({
        type: 'text',
        heading: h || undefined,
        subject: s || undefined,
        hashtags: tags.length ? tags : undefined,
      });
      setSpinnerMode('once');
      toast.success('Post created!');
      setHeading('');
      setSubject('');
      setHashtagsInput('');
      const created = res.data?.data ?? res.data;
      storeLatestPostForHome(created);
      onCreated?.(created);
      handleClose();
    } catch (err: any) {
      setSpinnerMode('off');
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to create post');
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('audio/')) return;
    setUploading(true);
    try {
      const res = await musicAPI.uploadAudio(file);
      const url = res.data?.data?.url ?? (res.data as any)?.url;
      if (url) {
        setMediaUrls([url]);
        setType('audio' as any);
        setAudioStep('record-details');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (audioInputRef.current) audioInputRef.current.value = '';
    }
  };

  const handleMusicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('audio/')) return;
    setUploading(true);
    try {
      const res = await musicAPI.uploadAudio(file);
      const url = res.data?.data?.url ?? (res.data as any)?.url;
      if (url) {
        setMediaUrls([url]);
        setType('audio' as any);
        setGenre(musicGenre || 'qwertz');
        setAudioStep('upload-details');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (musicInputRef.current) musicInputRef.current.value = '';
    }
  };

  const handleArtworkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const res = await tvAPI.uploadMedia(file);
      const url = res.data?.url ?? (res.data as any)?.url;
      if (url) setArtworkUrl(url);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Artwork upload failed');
    } finally {
      setUploading(false);
      if (artworkInputRef.current) artworkInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!mediaUrls.length) return;
    setPosting(true);
    try {
      const res = await tvAPI.createPost({
        type,
        mediaUrls,
        heading: heading.trim() || undefined,
        caption: subject.trim() || undefined,
        filter: filter || undefined,
        genre: genre || undefined,
        productId: productId || undefined,
      });
      toast.success('Post created!');
      handleClose();
      const created = res.data?.data ?? res.data;
      storeLatestPostForHome(created);
      onCreated(created);
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to create post');
    } finally {
      setPosting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Create post</h2>
          <div className="flex items-center gap-2">
            <QSpinner
              size={24}
              speedMs={800}
              running={spinnerMode}
              onCompleteOnce={() => setSpinnerMode('off')}
              className={spinnerMode !== 'off' ? '' : 'q-no-motion'}
            />
            <button onClick={handleClose} className="p-2 rounded-lg hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Text post area - heading, subject, hashtags */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-sky-500 flex items-center justify-center text-white">
              <Plus className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <input
                type="text"
                value={heading}
                onChange={(e) => setHeading(e.target.value)}
                placeholder="Heading"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-lg font-semibold placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
              />
              <textarea
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What's on your mind?"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 resize-none"
                rows={2}
              />
              <input
                type="text"
                value={hashtagsInput}
                onChange={(e) => setHashtagsInput(e.target.value)}
                placeholder="#hashtags"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
              />
              {step === 'upload' && audioStep === null && (
                <button
                  onClick={handleSubmitTextPost}
                  disabled={spinnerMode === 'loop'}
                  className="px-4 py-2 rounded-xl bg-sky-500 text-white text-sm font-medium hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {spinnerMode === 'loop' ? 'Posting…' : 'Post'}
                </button>
              )}
            </div>
          </div>
        </div>

        {audioStep !== null ? (
          <div className="p-4 pt-0 space-y-4">
            {audioStep === 'choose' && (
              <>
                <button
                  type="button"
                  onClick={() => setAudioStep(null)}
                  className="flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm mb-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <h3 className="text-base font-semibold text-slate-900 mb-3">Post Audio</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setAudioStep('record')}
                    className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 cursor-pointer transition-colors"
                  >
                    <Mic className="h-10 w-10 text-sky-500" />
                    <span className="text-sm font-medium text-slate-700 text-center">Record Voice</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAudioStep('upload')}
                    className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 cursor-pointer transition-colors"
                  >
                    <Music2 className="h-10 w-10 text-sky-500" />
                    <span className="text-sm font-medium text-slate-700 text-center">Upload Music</span>
                    </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Upload Music requires artist verification. Apply at <Link href="/qwerty-music" className="text-sky-600 hover:underline">QwertyMusic</Link>.
                </p>
              </>
            )}
            {audioStep === 'record' && (
              <>
                <button
                  type="button"
                  onClick={() => setAudioStep('choose')}
                  className="flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm mb-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <h3 className="text-base font-semibold text-slate-900 mb-3">Record Voice</h3>
                <p className="text-sm text-slate-600 mb-4">Upload an audio file (e.g. voice note, podcast clip).</p>
                <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 cursor-pointer transition-colors">
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleAudioUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                  {uploading ? (
                    <QSpinner size={28} running="loop" speedMs={800} />
                  ) : (
                    <Mic className="h-10 w-10 text-sky-500" />
                  )}
                  <span className="text-sm font-medium text-slate-700">Upload audio file</span>
                </label>
              </>
            )}
            {audioStep === 'upload' && (
              <>
                <button
                  type="button"
                  onClick={() => setAudioStep('choose')}
                  className="flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm mb-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <h3 className="text-base font-semibold text-slate-900 mb-3">Upload Music</h3>
                {artistVerified === false ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <p className="font-medium mb-2">Artist verification required</p>
                    <p className="mb-4">Only verified music companies, artists, or producers can upload music. Apply for verification at QwertyMusic.</p>
                    <Link href="/qwerty-music" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700">
                      <Music2 className="h-4 w-4" />
                      Go to QwertyMusic
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {mySongs.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-slate-700 mb-2">Or post from your QwertyMusic songs</p>
                        <div className="max-h-32 overflow-y-auto space-y-1 border border-slate-200 rounded-lg p-2">
                          {mySongs.map((s) => (
                            <button
                              key={s._id}
                              type="button"
                              onClick={() => {
                                setSelectedSongId(s._id);
                                setMediaUrls([s.audioUrl]);
                                setArtworkUrl(s.artworkUrl || '');
                                setMusicTitle(s.title || '');
                                setType('audio' as any);
                                setAudioStep('upload-details');
                              }}
                              className={`w-full flex items-center gap-2 p-2 rounded-lg text-left hover:bg-slate-50 ${selectedSongId === s._id ? 'bg-sky-50 border border-sky-200' : ''}`}
                            >
                              {s.artworkUrl ? (
                                <img src={getImageUrl(s.artworkUrl)} alt="" className="h-10 w-10 rounded object-cover" />
                              ) : (
                                <Music2 className="h-10 w-10 text-sky-400" />
                              )}
                              <span className="text-sm font-medium truncate">{s.title} {s.artist ? `– ${s.artist}` : ''}</span>
                              {s.downloadEnabled && <span className="text-xs text-emerald-600 ml-auto">Buy</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Song title</label>
                      <input
                        type="text"
                        value={musicTitle}
                        onChange={(e) => setMusicTitle(e.target.value)}
                        placeholder="Track name"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Genre</label>
                      <select
                        value={musicGenre}
                        onChange={(e) => setMusicGenre(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      >
                        <option value="">Select genre</option>
                        <option value="pop">Pop</option>
                        <option value="hiphop">Hip Hop</option>
                        <option value="rnb">R&B</option>
                        <option value="afrobeats">Afrobeats</option>
                        <option value="amapiano">Amapiano</option>
                        <option value="gospel">Gospel</option>
                        <option value="jazz">Jazz</option>
                        <option value="rock">Rock</option>
                        <option value="electronic">Electronic</option>
                        <option value="reggae">Reggae</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 cursor-pointer transition-colors">
                      <input
                        ref={musicInputRef}
                        type="file"
                        accept="audio/*"
                        onChange={handleMusicUpload}
                        disabled={uploading}
                        className="hidden"
                      />
                      {uploading ? (
                        <QSpinner size={28} running="loop" speedMs={800} />
                      ) : (
                        <Music2 className="h-10 w-10 text-sky-500" />
                      )}
                      <span className="text-sm font-medium text-slate-700">Upload song</span>
                    </label>
                    <p className="text-xs text-slate-500">Pay per creation royalty model applies.</p>
                  </div>
                )}
              </>
            )}
            {(audioStep === 'record-details' || audioStep === 'upload-details') && mediaUrls.length > 0 && (
              <div className="space-y-4">
                <div className="rounded-xl bg-slate-100 p-4 flex items-center gap-3">
                  <Music2 className="h-10 w-10 text-sky-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">Audio ready</p>
                    <audio src={mediaUrls[0]} controls className="w-full mt-2 max-h-10" />
                  </div>
                </div>
                {audioStep === 'upload-details' && (
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-2">Cover art (required)</p>
                    {artworkUrl ? (
                      <div className="flex items-center gap-2">
                        <img src={getImageUrl(artworkUrl)} alt="Artwork" className="h-16 w-16 rounded-lg object-cover" />
                        <button type="button" onClick={() => setArtworkUrl('')} className="text-sm text-rose-600 hover:underline">Remove</button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 cursor-pointer">
                        <input ref={artworkInputRef} type="file" accept="image/*" onChange={handleArtworkUpload} className="hidden" />
                        <Upload className="h-8 w-8 text-slate-400" />
                        <span className="text-xs text-slate-600">Upload cover image</span>
                      </label>
                    )}
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setAudioStep('choose'); setMediaUrls([]); }}
                    className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                        if (audioStep === 'upload-details' && !artworkUrl && !selectedSongId) {
                          toast.error('Please add cover art for your song');
                          return;
                        }
                        setPosting(true);
                        try {
                        const res = await tvAPI.createPost({
                          type: 'audio',
                          mediaUrls,
                          heading: heading.trim() || musicTitle.trim() || undefined,
                          caption: subject.trim() || undefined,
                          genre: musicGenre || genre || undefined,
                          artworkUrl: artworkUrl || undefined,
                          songId: selectedSongId || undefined,
                        });
                        toast.success('Post created!');
                        handleClose();
                        const created = res.data?.data ?? res.data;
                        storeLatestPostForHome(created);
                        onCreated?.(created);
                      } catch (err: any) {
                        toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to create post');
                      } finally {
                        setPosting(false);
                      }
                    }}
                    disabled={posting}
                    className="flex-1 px-4 py-2 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Post
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : step === 'upload' ? (
          <div className="p-4 pt-0 space-y-4">
            <div className="flex items-stretch gap-3 overflow-x-auto pb-1">
              <label
                title="Upload up to 20 images"
                className="min-w-[120px] flex-1 flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 cursor-pointer transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*,image/*"
                  onChange={handleFileSelect}
                  disabled={uploading}
                  className="hidden"
                />
                {uploading ? (
                  <div className="h-9 w-9 flex items-center justify-center">
                    <QSpinner size={28} running="loop" speedMs={800} />
                  </div>
                ) : (
                  <Video className="h-9 w-9 text-sky-500" />
                )}
                <span className="text-sm font-medium text-slate-700 text-center">Video</span>
              </label>
              <label
                title="create short videos"
                className="min-w-[120px] flex-1 flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-fuchsia-200 hover:border-fuchsia-300 hover:bg-fuchsia-50/50 cursor-pointer transition-colors"
              >
                <input
                  ref={qwertzInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleQwertzSelect}
                  disabled={uploading}
                  className="hidden"
                />
                <Plus className="h-9 w-9 text-fuchsia-500" />
                <span className="text-sm font-medium text-slate-700 text-center">Create Qwertz</span>
              </label>
              <label className="min-w-[120px] flex-1 flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 cursor-pointer transition-colors">
                <input
                  ref={imagesInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  disabled={uploading}
                  className="hidden"
                />
                <ImagePlus className="h-9 w-9 text-sky-500" />
                <span className="text-sm font-medium text-slate-700 text-center">Images</span>
              </label>
              <button
                type="button"
                onClick={async () => {
                  if (!currentUserId) {
                    toast.error('Sign in to go live');
                    return;
                  }
                  try {
                    const res = await usersAPI.toggleLive(currentUserId);
                    const isLive = res.data?.isLive ?? false;
                    toast.success(isLive ? 'You are now live!' : 'Live ended');
                    handleClose();
                    onCreated();
                  } catch (e: any) {
                    toast.error(e.response?.data?.message || 'Failed to toggle live');
                  }
                }}
                className="min-w-[120px] flex-1 flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-red-300 hover:bg-red-50/50 cursor-pointer transition-colors"
              >
                <Radio className="h-9 w-9 text-red-500" />
                <span className="text-sm font-medium text-slate-700 text-center">Go live</span>
              </button>
              <button
                type="button"
                onClick={() => setAudioStep('choose')}
                className="min-w-[120px] flex-1 flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 cursor-pointer transition-colors"
              >
                <Music2 className="h-9 w-9 text-sky-500" />
                <span className="text-sm font-medium text-slate-700 text-center">Post Audio</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {/* Preview */}
            <div className="aspect-square max-h-48 rounded-xl overflow-hidden bg-slate-100 relative">
              {type === 'audio' ? (
                <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-slate-800">
                  <Music2 className="h-12 w-12 text-sky-400 mb-2" />
                  <audio src={mediaUrls[0]} controls className="w-full max-w-full" />
                </div>
              ) : type === 'video' ? (
                <video src={mediaUrls[0]} controls className="w-full h-full object-contain" />
              ) : type === 'carousel' && mediaUrls.length > 1 ? (
                <>
                  <img
                    src={getImageUrl(mediaUrls[0])}
                    alt={`Preview 1 of ${mediaUrls.length}`}
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                    {mediaUrls.map((_, i) => (
                      <span
                        key={i}
                        className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-sky-500' : 'bg-white/60'}`}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <img
                  src={getImageUrl(mediaUrls[0])}
                  alt="Preview"
                  className="w-full h-full object-contain"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Filter</label>
              <div className="flex flex-wrap gap-2">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id === 'none' ? '' : f.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                      (f.id === 'none' && !filter) || filter === f.id
                        ? 'bg-sky-500 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Genre</label>
              <div className="flex flex-wrap gap-2">
                {GENRES.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGenre(g.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer ${
                      genre === g.id ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                    title={g.desc}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {featuredProducts.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Link product (optional)
                </label>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                >
                  <option value="">None</option>
                  {featuredProducts.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setStep('upload')}
                className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={posting}
                className="flex-1 px-4 py-2 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Post
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
