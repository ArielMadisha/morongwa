'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { ProfileLocationMapModal } from '@/components/ProfileLocationMapModal';
import {
  hasPublicProfileMapCoords,
  type PublicProfileLocation,
} from '@/lib/publicProfileLocation';

type Props = {
  profileName: string;
  location: PublicProfileLocation;
  compact?: boolean;
  className?: string;
};

export function ProfileLocationButton({ profileName, location, compact, className = '' }: Props) {
  const [open, setOpen] = useState(false);

  if (!hasPublicProfileMapCoords(location)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 shadow-sm transition-colors ${
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm'
        } ${className}`}
      >
        <MapPin className={compact ? 'h-3.5 w-3.5 text-sky-600' : 'h-4 w-4 text-sky-600'} />
        Location
      </button>
      <ProfileLocationMapModal
        open={open}
        onClose={() => setOpen(false)}
        profileName={profileName}
        location={location}
      />
    </>
  );
}
