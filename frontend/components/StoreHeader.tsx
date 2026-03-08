'use client';

import { Edit3, User } from 'lucide-react';

type StoreHeaderProps = {
  title?: string;
  address?: string;
  phone?: string;
  email?: string;
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
  onEdit,
  onProfile,
  isEditing = false,
  startContent,
}: StoreHeaderProps) {
  return (
    <section className="relative isolate w-full">
      {/* Thin accent strip */}
      <div className="h-1 w-full bg-gradient-to-r from-rose-600 via-fuchsia-600 to-amber-500 rounded-b" />

      {/* Gradient panel - full width, same size as QwertyHub top pane */}
      <div className="relative overflow-hidden w-full bg-gradient-to-br from-brand-600 via-brand-500 to-brand-600 text-white">
        {/* Decorative overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-25 mix-blend-overlay"
          style={{
            background:
              'radial-gradient(60% 80% at 20% 0%, rgba(255,255,255,0.2), transparent 60%), radial-gradient(50% 50% at 100% 20%, rgba(255,255,255,0.15), transparent 60%)',
          }}
        />

        <div className="w-full px-4 sm:px-6 lg:px-8 py-3 sm:py-4 relative">
          <div className="flex items-center justify-between gap-3 sm:gap-4 min-w-0">
            {startContent && <div className="flex-shrink-0">{startContent}</div>}
            <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 min-w-0">
              <div className="text-left flex-1 min-w-0">
                <h1 className="text-base sm:text-lg font-semibold text-white truncate">
                  {title}
                </h1>
                <p className="text-white/95 text-xs sm:text-sm truncate">
                  {address}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-white/90 text-xs sm:text-sm">
                  <span>Contact: {phone}</span>
                  <span className="hidden sm:inline">|</span>
                  <span>Email: {email}</span>
                </div>
              </div>
              {(onEdit || onProfile) && (
                <div className="flex gap-2 shrink-0">
                  {onEdit && (
                    <button
                      onClick={onEdit}
                      className="inline-flex items-center gap-2 rounded-lg bg-white/20 hover:bg-white/30 px-3 py-2 text-sm font-medium backdrop-blur-md transition-colors"
                    >
                      <Edit3 className="h-4 w-4" /> {isEditing ? 'Cancel' : 'Edit'}
                    </button>
                  )}
                  {onProfile && (
                    <button
                      onClick={onProfile}
                      className="inline-flex items-center gap-2 rounded-lg bg-white/20 hover:bg-white/30 px-3 py-2 text-sm font-medium backdrop-blur-md transition-colors"
                    >
                      <User className="h-4 w-4" /> Profile
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
