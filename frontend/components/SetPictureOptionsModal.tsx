'use client';

import { useEffect, useState } from 'react';
import { User, Image } from 'lucide-react';
import { getImageUrl } from '@/lib/api';

interface SetPictureOptionsModalProps {
  open: boolean;
  onClose: () => void;
  imagePreview?: string | File; // URL for preview or File from upload
  onSetProfilePic: () => void;
  onSetStripBackground: () => void;
}

export function SetPictureOptionsModal({
  open,
  onClose,
  imagePreview,
  onSetProfilePic,
  onSetStripBackground,
}: SetPictureOptionsModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imagePreview) {
      setPreviewUrl(null);
      return;
    }
    if (typeof imagePreview === 'string') {
      setPreviewUrl(getImageUrl(imagePreview));
      return () => {};
    }
    const url = URL.createObjectURL(imagePreview);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imagePreview]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Use this picture for</h3>

        {previewUrl && (
          <div className="rounded-xl overflow-hidden border border-slate-200 mb-6">
            <img src={previewUrl} alt="Preview" className="w-full h-64 object-cover" />
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => { onSetProfilePic(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:bg-brand-50 hover:border-brand-200 transition text-left"
          >
            <User className="h-5 w-5 text-brand-600" />
            <span className="font-medium text-slate-800">Set as profile picture</span>
          </button>
          <button
            onClick={() => { onSetStripBackground(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:bg-brand-50 hover:border-brand-200 transition text-left"
          >
            <Image className="h-5 w-5 text-brand-600" />
            <span className="font-medium text-slate-800">Set as strip background</span>
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-3 text-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
