'use client';

import { useRef } from 'react';
import { Camera } from 'lucide-react';
import { prepareMacGyverImage } from '@/lib/macgyverPendingImage';

const MAX_BYTES = 8 * 1024 * 1024;

type MacGyverImagePickerProps = {
  onPick: (file: File) => void;
  disabled?: boolean;
  className?: string;
  iconClassName?: string;
  /** Shown if the file is too large or not an image. */
  onError?: (message: string) => void;
};

/** Camera glyph that opens the OS photo/file picker (phone camera + gallery). Not the Q logo. */
export function MacGyverImagePicker({
  onPick,
  disabled,
  className = '',
  iconClassName = 'h-4 w-4',
  onError,
}: MacGyverImagePickerProps) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          if (!file.type.startsWith('image/')) {
            onError?.('Please choose a photo (JPEG, PNG, GIF, or WebP).');
            return;
          }
          void prepareMacGyverImage(file).then((prepared) => {
            if (prepared.size > MAX_BYTES) {
              onError?.('Please choose an image under 8 MB.');
              return;
            }
            onPick(prepared);
          });
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          ref.current?.click();
        }}
        className={className}
        aria-label="Search by image"
        title="Search by image — take a photo or upload"
      >
        <Camera className={iconClassName} aria-hidden />
      </button>
    </>
  );
}
