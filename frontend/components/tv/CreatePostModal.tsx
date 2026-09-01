'use client';
import { useState, useRef, useEffect } from 'react';
import { X, Upload, ImagePlus, Video, Radio, Plus, Mic, Music2, ChevronLeft, Loader2, Copy, ExternalLink } from 'lucide-react';

/** Store created post so Home/Wall can show it when user navigates there */
function storeLatestPostForHome(created: any) {
  if (created?._id && typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem('qwerty_latest_post', JSON.stringify(created));
    } catch (_) {}
  }
}
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { tvAPI, musicAPI, getImageUrl, usersAPI, liveAPI, livekitAPI, type SongRecord, formatUploadAxiosError } from '@/lib/api';

import {
  ACCEPT_TV_IMAGES,
  isVideoFile,
  isImageFile,
  isGifFile,
  validateQwertzVideoDuration,
} from '@/lib/mediaUpload';
import { QSpinner } from '@/components/QSpinner';
import { GENRES } from './GenresDropdown';
import type { Product } from '@/lib/types';
import toast from 'react-hot-toast';
import { dispatchFeedContentUpdated } from '@/lib/avatarUpdatedEvent';
import { TagPeoplePicker, type TaggedPerson } from './TagPeoplePicker';

const MAX_CAROUSEL_IMAGES = 20;
const QWERTZ_MAX_DURATION_SECONDS = 180; // 3 minutes

function parseHashtagsInput(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/^#/, '').toLowerCase())
    .filter(Boolean);
}

function buildMediaCaption(subjectLine: string, tags: string[]): string | undefined {
  const s = subjectLine.trim();
  const tagStr = tags.map((t) => `#${t}`).join(' ');
  const out = [s, tagStr].filter(Boolean).join(' ').trim();
  return out || undefined;
}

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
  /** When opening from hashtag Join — prefill text-post hashtags (without #). */
  prefillHashtag?: string;
  /** Open already focused on Create Qwertz (e.g. /morongwa-tv?compose=qwertz). */
  composeMode?: 'qwertz' | null;
}

export function CreatePostModal({
  open,
  onClose,
  onCreated,
  featuredProducts = [],
  currentUserId,
  prefillHashtag,
  composeMode = null,
}: CreatePostModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<'upload' | 'details'>('upload');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [type, setType] = useState<'video' | 'image' | 'carousel' | 'audio'>('image');
  const [caption, setCaption] = useState('');
  const [filter, setFilter] = useState<string>('');
  const [genre, setGenre] = useState<string>('comedy');
  const [productId, setProductId] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  /** When set, only that tile shows a spinner (avoids blocking every tile on one slow upload). */
  const [uploadingTile, setUploadingTile] = useState<'video' | 'qwertz' | 'images' | 'audio' | null>(null);
  const [posting, setPosting] = useState(false);
  const [heading, setHeading] = useState('');
  const [subject, setSubject] = useState('');
  const [hashtagsInput, setHashtagsInput] = useState('');
  const [taggedPeople, setTaggedPeople] = useState<TaggedPerson[]>([]);
  const [spinnerMode, setSpinnerMode] = useState<'off' | 'loop' | 'once'>('off');
  const [audioStep, setAudioStep] = useState<'choose' | 'record' | 'upload' | 'record-details' | 'upload-details' | null>(null);
  const [artistVerified, setArtistVerified] = useState<boolean | null>(null);
  const [musicGenre, setMusicGenre] = useState('');
  const [musicTitle, setMusicTitle] = useState('');
  const [artworkUrl, setArtworkUrl] = useState('');
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [mySongs, setMySongs] = useState<any[]>([]);
  const [mediaSensitive, setMediaSensitive] = useState(false);
  /** After POST /live/start — show OBS copy helpers */
  const [liveObsInfo, setLiveObsInfo] = useState<{
    obsServerUrl: string;
    streamKey: string;
    hlsUrl: string;
    watchUrl: string;
  } | null>(null);
  const [liveActionBusy, setLiveActionBusy] = useState(false);
  /** QwertyTV video + approved Sounds (catalog). */
  const [videoSoundSongId, setVideoSoundSongId] = useState<string | null>(null);
  const [soundQuery, setSoundQuery] = useState('');
  const [soundDebounced, setSoundDebounced] = useState('');
  const [soundChoices, setSoundChoices] = useState<SongRecord[]>([]);
  const [soundsLoading, setSoundsLoading] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSoundDebounced(soundQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [soundQuery]);

  useEffect(() => {
    if (!open || step !== 'details' || type !== 'video') return;
    let cancelled = false;
    setSoundsLoading(true);
    musicAPI
      .listSounds({ q: soundDebounced || undefined, limit: 40 })
      .then((res) => {
        if (!cancelled) setSoundChoices(Array.isArray(res.data?.data) ? res.data.data : []);
      })
      .catch(() => {
        if (!cancelled) setSoundChoices([]);
      })
      .finally(() => {
        if (!cancelled) setSoundsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, step, type, soundDebounced]);

  useEffect(() => {
    if (!open || !prefillHashtag) return;
    const t = prefillHashtag.replace(/^#/, '').trim();
    if (!t) return;
    setHashtagsInput((prev) => {
      const parts = prev
        .split(/[,\s]+/)
        .map((p) => p.replace(/^#/, '').trim().toLowerCase())
        .filter(Boolean);
      if (parts.includes(t.toLowerCase())) return prev;
      return prev.trim() ? `${prev.trim()}, ${t}` : t;
    });
  }, [open, prefillHashtag]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const qwertzInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || composeMode !== 'qwertz') return;
    setGenre('qwertz');
    const t = window.setTimeout(() => {
      qwertzInputRef.current?.click();
    }, 250);
    return () => window.clearTimeout(t);
  }, [open, composeMode]);

  /** Lock background scroll on mobile while compose is open (prevents iOS “frozen” overlay). */
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const uploadTvVideo = async (
    file: File,
    tile: 'video' | 'qwertz',
    opts?: { validateQwertz?: boolean }
  ) => {
    const toastId = `tv-upload-${tile}`;
    setUploading(true);
    setUploadingTile(tile);
    toast.loading(tile === 'qwertz' ? 'Preparing Qwertz…' : 'Uploading video…', { id: toastId });
    try {
      if (opts?.validateQwertz) {
        await validateQwertzVideoDuration(file, QWERTZ_MAX_DURATION_SECONDS);
      }
      toast.loading('Uploading… 0%', { id: toastId });
      const res = await tvAPI.uploadMedia(file, {
        onUploadProgress: (pct) => {
          toast.loading(`Uploading… ${pct}%`, { id: toastId });
        },
      });
      const url = res.data?.url ?? (res.data as any)?.url;
      const sensitive = res.data?.sensitive ?? (res.data as any)?.sensitive ?? false;
      if (!url) {
        toast.error('Upload finished but no media URL was returned. Try again or use a smaller file.');
        return;
      }
      setMediaUrls([url]);
      setType('video');
      setMediaSensitive(sensitive);
      if (tile === 'qwertz') setGenre('qwertz');
      setStep('details');
      toast.success(tile === 'qwertz' ? 'Qwertz video ready — add caption and post' : 'Video ready — add caption and post', {
        id: toastId,
      });
    } catch (err: any) {
      toast.error(formatUploadAxiosError(err, err.response?.data?.message || err?.message || 'Upload failed'), {
        id: toastId,
      });
    } finally {
      setUploading(false);
      setUploadingTile(null);
    }
  };

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
    setGenre('comedy');
    setProductId('');
    setUploading(false);
    setUploadingTile(null);
    setPosting(false);
    setHeading('');
    setSubject('');
    setHashtagsInput('');
    setTaggedPeople([]);
    setSpinnerMode('off');
    setAudioStep(null);
    setArtistVerified(null);
    setMusicGenre('');
    setMusicTitle('');
    setArtworkUrl('');
    setSelectedSongId(null);
    setMediaSensitive(false);
    setLiveObsInfo(null);
    setLiveActionBusy(false);
    setVideoSoundSongId(null);
    setSoundQuery('');
    setSoundDebounced('');
    setSoundChoices([]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const uploadTvImageFiles = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    setUploadingTile('images');
    const toastId = 'tv-upload-images';
    toast.loading(files.length === 1 && isGifFile(files[0]) ? 'Uploading GIF…' : 'Uploading…', { id: toastId });
    try {
      if (files.length === 1) {
        const file = files[0];
        if (!isImageFile(file)) {
          toast.error('Please select a JPEG, PNG, GIF, or WebP file', { id: toastId });
          return;
        }
        const res = await tvAPI.uploadMedia(file, {
          onUploadProgress: (pct) => toast.loading(`Uploading… ${pct}%`, { id: toastId }),
        });
        const url = res.data?.url ?? (res.data as any)?.url;
        const sensitive = res.data?.sensitive ?? (res.data as any)?.sensitive ?? false;
        if (url) {
          setMediaUrls([url]);
          setType('image');
          setMediaSensitive(sensitive);
          setStep('details');
          toast.success(isGifFile(file) ? 'GIF ready — add caption and post' : 'Image ready — add caption and post', {
            id: toastId,
          });
        } else {
          toast.error('Upload finished but no media URL was returned.', { id: toastId });
        }
      } else {
        const imageFiles = files.filter((f) => isImageFile(f));
        if (imageFiles.length === 0) {
          toast.error('Please select JPEG, PNG, GIF, or WebP files only', { id: toastId });
          return;
        }
        const res = await tvAPI.uploadImages(imageFiles.slice(0, MAX_CAROUSEL_IMAGES), {
          onUploadProgress: (pct) => toast.loading(`Uploading… ${pct}%`, { id: toastId }),
        });
        const urls = res.data?.urls ?? (res.data as any)?.urls ?? (res.data as any)?.data?.urls ?? [];
        const sensitive = res.data?.sensitive ?? (res.data as any)?.sensitive ?? false;
        if (urls.length) {
          setMediaUrls(urls);
          setType('carousel');
          setMediaSensitive(sensitive);
          setStep('details');
          toast.success('Images ready — add caption and post', { id: toastId });
        } else {
          toast.error('No images could be uploaded. Try again or use smaller files.', { id: toastId });
        }
      }
    } catch (err: any) {
      toast.error(formatUploadAxiosError(err, err.response?.data?.message || 'Upload failed'), { id: toastId });
    } finally {
      setUploading(false);
      setUploadingTile(null);
      if (imagesInputRef.current) imagesInputRef.current.value = '';
    }
  };

  /** Video button — videos only (GIFs/images use Images & GIFs). */
  const handleVideoOnlySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isGifFile(file) || (isImageFile(file) && !isVideoFile(file))) {
      await uploadTvImageFiles([file]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (!isVideoFile(file)) {
      toast.error('Please choose a video file (MP4, WebM, MOV, MKV, etc.)');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    await uploadTvVideo(file, 'video');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** Images / carousel — JPEG, PNG, GIF (animated), WebP. */
  const handleImageCarouselSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    await uploadTvImageFiles(Array.from(files));
  };

  const handleQwertzSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isVideoFile(file)) {
      toast.error('Please select a video file for Qwertz');
      return;
    }
    await uploadTvVideo(file, 'qwertz', { validateQwertz: true });
    if (qwertzInputRef.current) qwertzInputRef.current.value = '';
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
        taggedUserIds: taggedPeople.map((p) => p._id),
      });
      const created = res.data?.data ?? res.data;
      storeLatestPostForHome(created);
      try {
        dispatchFeedContentUpdated();
        onCreated?.(created);
      } catch (cbErr) {
        console.error('onCreated after text post failed', cbErr);
      }
      setSpinnerMode('once');
      toast.success('Post created!');
      setHeading('');
      setSubject('');
      setHashtagsInput('');
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
      toast.error(formatUploadAxiosError(err, err.response?.data?.message || 'Upload failed'));
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
        setGenre(musicGenre || 'comedy');
        setAudioStep('upload-details');
      }
    } catch (err: any) {
      toast.error(formatUploadAxiosError(err, err.response?.data?.message || 'Upload failed'));
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
      toast.error(formatUploadAxiosError(err, err.response?.data?.message || 'Artwork upload failed'));
    } finally {
      setUploading(false);
      if (artworkInputRef.current) artworkInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!mediaUrls.length || posting) return;
    const tags = parseHashtagsInput(hashtagsInput);
    setPosting(true);
    try {
      const res = await tvAPI.createPost({
        type,
        mediaUrls,
        heading: heading.trim() || undefined,
        caption: buildMediaCaption(subject, tags),
        hashtags: tags.length ? tags : undefined,
        taggedUserIds: taggedPeople.map((p) => p._id),
        filter: filter || undefined,
        genre: genre || undefined,
        productId: productId || undefined,
        sensitive: mediaSensitive,
        songId: type === 'video' ? videoSoundSongId || undefined : undefined,
      });
      const created = res.data?.data ?? res.data;
      storeLatestPostForHome(created);
      try {
        dispatchFeedContentUpdated();
        onCreated?.(created);
      } catch (cbErr) {
        console.error('onCreated after media post failed', cbErr);
      }
      toast.success('Post created!');
      handleClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to create post');
    } finally {
      setPosting(false);
    }
  };

  if (!open) return null;

  const copyLiveField = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-w-4xl w-full max-h-[min(92dvh,90vh)] sm:max-h-[90vh] overflow-y-auto overscroll-contain touch-pan-y">
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-slate-100 bg-white/95 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create post</h2>
          <div className="flex items-center gap-2">
            <QSpinner
              size={24}
              speedMs={800}
              running={spinnerMode}
              onCompleteOnce={() => setSpinnerMode('off')}
              className={spinnerMode !== 'off' ? '' : 'q-no-motion'}
            />
            <button type="button" onClick={handleClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Close">
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
                className="w-full min-h-[128px] px-3 py-2 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 resize-y"
                rows={6}
              />
              <p className="text-xs text-slate-500">Use blank lines for paragraph breaks — they show on the wall and under photos/videos.</p>
              <input
                type="text"
                value={hashtagsInput}
                onChange={(e) => setHashtagsInput(e.target.value)}
                placeholder="#hashtags"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
              />
              <TagPeoplePicker
                selected={taggedPeople}
                onChange={setTaggedPeople}
                currentUserId={currentUserId}
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
                    <audio src={getImageUrl(mediaUrls[0]) || mediaUrls[0]} controls className="w-full mt-2 max-h-10" />
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
                        const tags = parseHashtagsInput(hashtagsInput);
                        const res = await tvAPI.createPost({
                          type: 'audio',
                          mediaUrls,
                          heading: heading.trim() || musicTitle.trim() || undefined,
                          caption: buildMediaCaption(subject, tags),
                          hashtags: tags.length ? tags : undefined,
                          taggedUserIds: taggedPeople.map((p) => p._id),
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
                  accept="video/*"
                  onChange={handleVideoOnlySelect}
                  disabled={uploading}
                  className="hidden"
                />
                {uploadingTile === 'video' ? (
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
                {uploadingTile === 'qwertz' ? (
                  <div className="h-9 w-9 flex items-center justify-center">
                    <QSpinner size={28} running="loop" speedMs={800} />
                  </div>
                ) : (
                  <Plus className="h-9 w-9 text-fuchsia-500" />
                )}
                <span className="text-sm font-medium text-slate-700 text-center">Create Qwertz</span>
              </label>
              <label
                title="JPEG, PNG, GIF (animated), WebP — up to 20 for a carousel"
                className="min-w-[120px] flex-1 flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 cursor-pointer transition-colors"
              >
                <input
                  ref={imagesInputRef}
                  type="file"
                  accept={ACCEPT_TV_IMAGES}
                  multiple
                  onChange={handleImageCarouselSelect}
                  disabled={uploading}
                  className="hidden"
                />
                <ImagePlus className="h-9 w-9 text-sky-500" />
                <span className="text-sm font-medium text-slate-700 text-center">Images &amp; GIFs</span>
              </label>
              <button
                type="button"
                disabled={liveActionBusy}
                onClick={async () => {
                  if (!currentUserId) {
                    toast.error('Sign in to go live');
                    return;
                  }
                  setLiveActionBusy(true);
                  try {
                    const cfgRes = await livekitAPI.getConfig().catch(() => null);
                    const configured = cfgRes?.data?.data?.configured === true;
                    if (!configured) {
                      toast.error('Live streaming is not configured yet. Please try again shortly.');
                      return;
                    }
                    await usersAPI.toggleLive(currentUserId);
                    handleClose();
                    router.push(`/live/${currentUserId}?host=1`);
                    toast.success('Opening your live room…');
                    onCreated?.();
                  } catch (e: any) {
                    const msg = e.response?.data?.message || e.response?.data?.error || e.message || 'Failed to go live';
                    toast.error(msg);
                  } finally {
                    setLiveActionBusy(false);
                  }
                }}
                className="min-w-[120px] flex-1 flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-red-300 hover:bg-red-50/50 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {liveActionBusy ? (
                  <Loader2 className="h-9 w-9 text-red-500 animate-spin" />
                ) : (
                  <Radio className="h-9 w-9 text-red-500" />
                )}
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
                  <audio src={getImageUrl(mediaUrls[0]) || mediaUrls[0]} controls className="w-full max-w-full" />
                </div>
              ) : type === 'video' ? (
                <video src={getImageUrl(mediaUrls[0]) || mediaUrls[0]} controls className="w-full h-full object-contain" />
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

            {type === 'video' && (
              <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                <label className="block text-sm font-medium text-slate-800 mb-1 flex items-center gap-2">
                  <Music2 className="h-4 w-4 text-violet-600" />
                  Sound (optional)
                </label>
                <p className="text-xs text-slate-600 mb-2">
                  Use an approved QwertyMusic track like short-video apps — attribution appears on your post. Artists are paid per the{' '}
                  <Link href="/policies/qwerty-music-sound-library-artist-payouts" className="text-violet-700 font-medium hover:underline">
                    Sounds & payouts policy
                  </Link>
                  .
                </p>
                <input
                  type="search"
                  value={soundQuery}
                  onChange={(e) => setSoundQuery(e.target.value)}
                  placeholder="Search sounds by title or artist…"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm mb-2 bg-white"
                />
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setVideoSoundSongId(null)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${!videoSoundSongId ? 'border-violet-500 bg-violet-100 text-violet-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    Original audio only
                  </button>
                  {soundsLoading && <Loader2 className="h-4 w-4 animate-spin text-violet-500" />}
                </div>
                <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                  {soundChoices.length === 0 && !soundsLoading ? (
                    <p className="text-xs text-slate-500 p-3">No sounds match. Try another search.</p>
                  ) : (
                    soundChoices.map((s) => (
                      <button
                        key={s._id}
                        type="button"
                        onClick={() => setVideoSoundSongId(s._id)}
                        className={`w-full flex items-center gap-2 p-2 text-left text-sm hover:bg-violet-50/80 ${videoSoundSongId === s._id ? 'bg-violet-50' : ''}`}
                      >
                        {s.artworkUrl ? (
                          <img src={getImageUrl(s.artworkUrl)} alt="" className="h-9 w-9 rounded object-cover shrink-0" />
                        ) : (
                          <Music2 className="h-9 w-9 text-violet-300 shrink-0" />
                        )}
                        <span className="truncate font-medium text-slate-800">
                          {s.title} <span className="font-normal text-slate-500">— {s.artist}</span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

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

            <div className="flex gap-3 pt-4 sticky bottom-0 bg-white pb-[max(0.5rem,env(safe-area-inset-bottom))] border-t border-slate-100 -mx-6 px-6 mt-2">
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={posting || uploading}
                className="flex-1 px-4 py-2.5 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {posting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>

    {liveObsInfo ? (
      <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/60">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
          <h3 className="text-lg font-semibold text-slate-900">You are live — connect OBS</h3>
          <p className="mt-2 text-sm text-slate-600">
            In OBS: Settings → Stream → Service: <strong className="text-slate-800">Custom</strong>. Paste the server and stream key below,
            then click <strong className="text-slate-800">Start Streaming</strong>. Viewers use the watch link (HLS may take a few seconds after you start).
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Server</p>
              <div className="mt-1 flex gap-2">
                <code className="flex-1 break-all rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-800">{liveObsInfo.obsServerUrl}</code>
                <button
                  type="button"
                  onClick={() => void copyLiveField('Server', liveObsInfo.obsServerUrl)}
                  className="shrink-0 rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
                  title="Copy server"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Stream key</p>
              <div className="mt-1 flex gap-2">
                <code className="flex-1 break-all rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-800">{liveObsInfo.streamKey}</code>
                <button
                  type="button"
                  onClick={() => void copyLiveField('Stream key', liveObsInfo.streamKey)}
                  className="shrink-0 rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
                  title="Copy stream key"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Preview playlist (HLS)</p>
              <code className="mt-1 block break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{liveObsInfo.hlsUrl}</code>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Link
              href={liveObsInfo.watchUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Open watch page <ExternalLink className="h-4 w-4" />
            </Link>
            <button
              type="button"
              disabled={liveActionBusy}
              onClick={async () => {
                setLiveActionBusy(true);
                try {
                  await liveAPI.stop();
                  toast.success('Live ended');
                  setLiveObsInfo(null);
                  handleClose();
                  onCreated?.();
                } catch (e: any) {
                  toast.error(e.response?.data?.message || 'Could not end live');
                } finally {
                  setLiveActionBusy(false);
                }
              }}
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
            >
              End broadcast
            </button>
            <button
              type="button"
              onClick={() => {
                setLiveObsInfo(null);
                handleClose();
              }}
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
