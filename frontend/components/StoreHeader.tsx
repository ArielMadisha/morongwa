'use client';

import { useState } from 'react';
import { Edit3, User, Share2, Check, MapPin, Phone, Mail, Copy } from 'lucide-react';
import toast from 'react-hot-toast';

type StoreHeaderProps = {
  title?: string;
  address?: string;
  phone?: string;
  email?: string;
  storeSlug?: string;
  onEdit?: () => void;
  onProfile?: () => void;
  isEditing?: boolean;
  startContent?: React.ReactNode;
};

export default function StoreHeader({
  title = 'My Store',
  address = 'Enter address',
  phone = '—',
  email = '—',
  storeSlug,
  onEdit,
  onProfile,
  isEditing = false,
  startContent,
}: StoreHeaderProps) {
  const [copied, setCopied] = useState(false);
  const shareUrl = typeof window !== 'undefined' && storeSlug
    ? `${window.location.origin}/store/${storeSlug}`
    : '';

  const handleCopyStoreUrl = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      toast.success('Store link copied');
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => toast.error('Failed to copy'));
  };

  return (
    <section className="relative isolate w-full">
      <div className="h-1 w-full bg-gradient-to-r from-rose-500 via-fuchsia-500 to-amber-400 rounded-b" />
      <div className="relative overflow-hidden w-full rounded-b-[22px] bg-gradient-to-br from-[#2f6cf8] via-[#2f7ff8] to-[#2a67f0] text-white shadow-lg">
        <div className="pointer-events-none absolute -right-16 -bottom-24 h-72 w-72 rounded-full bg-white/10 blur-sm" />
        <img
          src="/store-template-bags.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute right-0 bottom-0 w-[96px] sm:w-[130px] md:w-[160px] h-auto object-contain opacity-95"
        />

        <div className="w-full px-4 sm:px-8 py-4 sm:py-6 relative">
          <div className="flex items-start justify-between gap-3 min-w-0">
            <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1 pr-20 sm:pr-28 md:pr-40">
              <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-full bg-white/20 ring-1 ring-white/30 flex items-center justify-center shrink-0">
                <User className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl sm:text-3xl font-bold leading-tight truncate">{title}</h1>
                <div className="mt-2.5 space-y-1.5 text-white/95">
                  <p className="flex items-center gap-2 text-sm sm:text-lg"><MapPin className="h-4 w-4 sm:h-5 sm:w-5" /> {address}</p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
                    <p className="flex items-center gap-2 text-sm sm:text-lg"><Phone className="h-4 w-4 sm:h-5 sm:w-5" /> Contact: {phone}</p>
                    <p className="flex items-center gap-2 text-sm sm:text-lg"><Mail className="h-4 w-4 sm:h-5 sm:w-5" /> Email: {email}</p>
                  </div>
                </div>
                {storeSlug && (
                  <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
                    <button
                      onClick={handleCopyStoreUrl}
                      className="inline-flex items-center gap-2 rounded-xl bg-white/15 hover:bg-white/25 px-3 py-1.5 text-sm sm:text-base font-medium backdrop-blur-md border border-white/20"
                      title="Copy store link"
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      Store ID: <span className="font-semibold">{storeSlug}</span>
                    </button>
                    <button
                      onClick={handleCopyStoreUrl}
                      className="inline-flex items-center gap-2 rounded-xl bg-white/18 hover:bg-white/28 px-4 py-1.5 text-lg sm:text-2xl font-semibold backdrop-blur-md border border-white/25"
                    >
                      <Share2 className="h-5 w-5 sm:h-6 sm:w-6" />
                      {copied ? 'Copied' : 'Share'}
                    </button>
                    {onEdit && (
                      <button
                        onClick={onEdit}
                        className="inline-flex items-center gap-2 rounded-xl bg-white/18 hover:bg-white/28 px-4 py-1.5 text-lg sm:text-2xl font-semibold backdrop-blur-md border border-white/25"
                      >
                        <Edit3 className="h-5 w-5 sm:h-6 sm:w-6" />
                        {isEditing ? 'Cancel' : 'Edit'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            {startContent && <div className="shrink-0">{startContent}</div>}
            {onProfile && (
              <button
                onClick={onProfile}
                className="inline-flex items-center gap-2 rounded-xl bg-white/20 hover:bg-white/30 px-3 py-2 text-sm font-medium backdrop-blur-md transition-colors"
              >
                <User className="h-4 w-4" /> Profile
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
