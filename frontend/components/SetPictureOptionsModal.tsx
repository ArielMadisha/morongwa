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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Use this picture for</h2>
        </div>
        {previewUrl && (
          <div className="p-4 flex justify-center">
            <div className="w-32 h-32 rounded-xl overflow-hidden bg-slate-100">
              <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
            </div>
          </div>
        )}
        <div className="p-4 space-y-2">
          <button
            onClick={async () => {
              onSetProfilePic();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:bg-sky-50 hover:border-sky-200 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center">
              <User className="h-5 w-5 text-sky-600" />
            </div>
            <span className="font-medium text-slate-800">Set as profile picture</span>
          </button>
          <button
            onClick={() => {
              onSetStripBackground();
              onClose();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:bg-sky-50 hover:border-sky-200 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center">
              <Image className="h-5 w-5 text-sky-600" />
            </div>
            <span className="font-medium text-slate-800">Set as strip background</span>
          </button>
        </div>
        <div className="p-4 pt-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
