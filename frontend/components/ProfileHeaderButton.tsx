'use client';

import { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getImageUrl, usersAPI } from '@/lib/api';
import { User, LogOut, Camera } from 'lucide-react';
import toast from 'react-hot-toast';

/** Profile avatar button for headers - hover/click shows Profile & Logout dropdown. Click avatar or "Change photo" to upload new picture. */
export function ProfileHeaderButton({ className = '' }: { className?: string }) {
  const { user, isAuthenticated, logout, refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputId = useId();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number } | null>(null);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        clearCloseTimeout();
      };
    }
  }, [open]);

  useEffect(() => {
    if (open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownRect({ top: rect.bottom + 6, left: rect.right - 160 });
    } else {
      setDropdownRect(null);
    }
  }, [open]);

  if (!isAuthenticated || !user) return null;

  const profileHref = user._id ? `/user/${user._id}` : '/profile';
  const userId = user._id || (user as { id?: string }).id;

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/') || !userId) return;
    try {
      await usersAPI.uploadAvatar(userId, file);
      toast.success('Profile picture updated');
      await refreshUser?.();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to update profile picture');
    }
  };

  const dropdown = open && dropdownRect && typeof document !== 'undefined' ? createPortal(
    <div
      ref={(el) => { dropdownRef.current = el; }}
      className="fixed py-1.5 min-w-[160px] rounded-xl bg-white border border-slate-200 shadow-xl z-[9999]"
      style={{ top: dropdownRect.top, left: dropdownRect.left }}
      role="menu"
      onMouseEnter={() => { clearCloseTimeout(); setOpen(true) }}
      onMouseLeave={scheduleClose}
    >
      <Link
        href={profileHref}
        className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
        role="menuitem"
        onClick={() => setOpen(false)}
      >
        <User className="h-4 w-4 text-slate-500" />
        Profile
      </Link>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          logout();
        }}
        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors text-left"
        role="menuitem"
      >
        <LogOut className="h-4 w-4 text-slate-500" />
        Logout
      </button>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <input
        id={avatarInputId}
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarFileChange}
        aria-hidden
      />
      <div
        ref={containerRef}
        className={`relative ${className}`}
        onMouseEnter={() => { clearCloseTimeout(); setOpen(true) }}
        onMouseLeave={scheduleClose}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center justify-center p-1 rounded-full text-slate-700 hover:bg-slate-100 shrink-0 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 relative group"
          aria-label="Profile menu"
          aria-expanded={open}
          aria-haspopup="true"
        >
          <label
            htmlFor={avatarInputId}
            onClick={(e) => e.stopPropagation()}
            className="relative w-9 h-9 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-xs font-bold ring-1 ring-slate-200 shadow-sm overflow-hidden cursor-pointer block"
          >
            {(user as { avatar?: string }).avatar ? (
              <img
                src={getImageUrl((user as { avatar?: string }).avatar)}
                alt={user.name || 'Profile'}
                className="h-full w-full object-cover"
              />
            ) : (
              user.name?.charAt(0)?.toUpperCase() || 'U'
            )}
            <span className="absolute inset-0 rounded-full bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="h-3.5 w-3.5 text-white shrink-0" />
            </span>
          </label>
        </button>
      </div>
      {dropdown}
    </>
  );
}
