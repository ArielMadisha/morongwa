'use client';

import { useState, useRef } from 'react';
import { X, Upload, ImagePlus, Video, Loader2 } from 'lucide-react';
import { tvAPI, getImageUrl } from '@/lib/api';
import type { Product } from '@/lib/types';
import toast from 'react-hot-toast';

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
  onCreated: () => void;
  featuredProducts?: (Product & { _id: string })[];
}

export function CreatePostModal({
  open,
  onClose,
  onCreated,
  featuredProducts = [],
}: CreatePostModalProps) {
  const [step, setStep] = useState<'upload' | 'details'>('upload');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [type, setType] = useState<'video' | 'image' | 'carousel'>('image');
  const [caption, setCaption] = useState('');
  const [filter, setFilter] = useState<string>('');
  const [productId, setProductId] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setMediaUrls([]);
    setType('image');
    setCaption('');
    setFilter('');
    setProductId('');
    setUploading(false);
    setPosting(false);
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
        const res = await tvAPI.uploadImages(imageFiles.slice(0, 10));
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

  const handleSubmit = async () => {
    if (!mediaUrls.length) return;
    setPosting(true);
    try {
      await tvAPI.createPost({
        type,
        mediaUrls,
        caption: caption.trim() || undefined,
        filter: filter || undefined,
        productId: productId || undefined,
      });
      toast.success('Post created!');
      handleClose();
      onCreated();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create post');
    } finally {
      setPosting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Create post</h2>
          <button onClick={handleClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === 'upload' ? (
          <div className="p-6 space-y-4">
            <p className="text-slate-600">Upload a video or image(s) to share.</p>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 cursor-pointer transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,image/*"
                  onChange={handleFileSelect}
                  disabled={uploading}
                  className="hidden"
                />
                {uploading ? (
                  <Loader2 className="h-10 w-10 text-sky-500 animate-spin" />
                ) : (
                  <Video className="h-10 w-10 text-sky-500" />
                )}
                <span className="text-sm font-medium text-slate-700">Video or image</span>
              </label>
              <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 cursor-pointer transition-colors">
                <input
                  ref={imagesInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  disabled={uploading}
                  className="hidden"
                />
                <ImagePlus className="h-10 w-10 text-sky-500" />
                <span className="text-sm font-medium text-slate-700">Carousel (up to 10)</span>
              </label>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {/* Preview */}
            <div className="aspect-square max-h-48 rounded-xl overflow-hidden bg-slate-100 relative">
              {type === 'video' ? (
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Caption</label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="What's on your mind?"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                rows={3}
              />
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
