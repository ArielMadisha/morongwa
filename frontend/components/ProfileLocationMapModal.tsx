'use client';

import { X, ExternalLink, MapPin } from 'lucide-react';
import {
  googleMapsEmbedUrl,
  googleMapsOpenUrl,
  type PublicProfileLocation,
} from '@/lib/publicProfileLocation';

type Props = {
  open: boolean;
  onClose: () => void;
  profileName: string;
  location: PublicProfileLocation;
};

export function ProfileLocationMapModal({ open, onClose, profileName, location }: Props) {
  if (!open || !location.lat || !location.lng) return null;

  const embedUrl = googleMapsEmbedUrl(location.lat, location.lng, location.label);
  const openUrl = googleMapsOpenUrl(location.lat, location.lng, location.label);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Location map"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-sky-600 shrink-0" />
              Location
            </h2>
            <p className="text-sm text-slate-600 truncate">{profileName}</p>
            {location.label ? (
              <p className="text-xs text-slate-500 mt-0.5 break-words">{location.label}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="aspect-[4/3] w-full bg-slate-100">
          <iframe
            title={`Map for ${profileName}`}
            src={embedUrl}
            className="w-full h-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
        <div className="px-4 py-3 flex justify-end">
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:text-sky-800"
          >
            Open in Google Maps
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
