'use client';

import { useState, useEffect } from 'react';
import { X, ShoppingBag } from 'lucide-react';
import { usersAPI } from '@/lib/api';

const STORAGE_KEY = 'content_preferences';
const ASKED_AT_KEY = 'content_preferences_asked_at';
const REASK_DAYS = 30;

export interface ContentPreferences {
  showProducts: boolean;
}

function getGuestPreferences(): ContentPreferences | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { showProducts: parsed?.showProducts !== false };
  } catch {
    return null;
  }
}

function setGuestPreferences(prefs: ContentPreferences) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (_) {}
}

function getLastAskedAt(): number | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ASKED_AT_KEY);
    if (!raw) return null;
    return parseInt(raw, 10);
  } catch {
    return null;
  }
}

function setLastAskedAt() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ASKED_AT_KEY, String(Date.now()));
  } catch (_) {}
}

export function shouldShowPreferencesModal(
  user: { _id?: string; id?: string; contentPreferences?: { showProducts?: boolean; preferencesSetAt?: string; preferencesAskedAt?: string } } | null
): boolean {
  if (user) {
    const prefs = user.contentPreferences;
    if (prefs?.preferencesSetAt) return false; // User has explicitly set preferences
    const askedAt = prefs?.preferencesAskedAt ? new Date(prefs.preferencesAskedAt).getTime() : null;
    if (askedAt && Date.now() - askedAt < REASK_DAYS * 24 * 60 * 60 * 1000) return false;
    return true;
  }
  // Guest
  const guestPrefs = getGuestPreferences();
  if (guestPrefs !== null) return false; // Guest has set preferences
  const lastAsked = getLastAskedAt();
  if (lastAsked && Date.now() - lastAsked < REASK_DAYS * 24 * 60 * 60 * 1000) return false;
  return true;
}

export function getHideProducts(
  user: { _id?: string; id?: string; contentPreferences?: { showProducts?: boolean } } | null
): boolean {
  if (user?.contentPreferences?.showProducts === false) return true;
  const guest = getGuestPreferences();
  if (guest && guest.showProducts === false) return true;
  return false;
}

interface ContentPreferencesModalProps {
  open: boolean;
  onClose: () => void;
  user: { _id?: string; id?: string; contentPreferences?: { showProducts?: boolean; preferencesSetAt?: string; preferencesAskedAt?: string } } | null;
  onSaved?: (prefs: ContentPreferences) => void;
}

export function ContentPreferencesModal({
  open,
  onClose,
  user,
  onSaved,
}: ContentPreferencesModalProps) {
  const [showProducts, setShowProducts] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (user?.contentPreferences?.showProducts !== undefined) {
        setShowProducts(user.contentPreferences.showProducts !== false);
      } else {
        const guest = getGuestPreferences();
        setShowProducts(guest?.showProducts !== false);
      }
    }
  }, [open, user?.contentPreferences?.showProducts]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const prefs: ContentPreferences = { showProducts };
      if (user?._id || user?.id) {
        await usersAPI.updateContentPreferences(user._id || user.id!, {
          showProducts,
          preferencesAskedAt: new Date().toISOString(),
        });
      } else {
        setGuestPreferences(prefs);
      }
      setLastAskedAt();
      onSaved?.(prefs);
      onClose();
    } catch (_) {
      setGuestPreferences({ showProducts });
      setLastAskedAt();
      onSaved?.({ showProducts });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleMaybeLater = () => {
    const now = new Date().toISOString();
    if (user?._id || user?.id) {
      usersAPI.updateContentPreferences(user._id || user.id!, { preferencesAskedAt: now }).catch(() => {});
    }
    setLastAskedAt();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Customize your feed</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-slate-600 text-sm">
            We want to show you content you&apos;ll enjoy. You can change this anytime in settings.
          </p>
          <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-sky-200 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={showProducts}
              onChange={(e) => setShowProducts(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-500"
            />
            <ShoppingBag className="h-5 w-5 text-slate-500 shrink-0" />
            <span className="text-slate-700">Show products for sale in my feed</span>
          </label>
        </div>
        <div className="flex gap-3 p-4 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={handleMaybeLater}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-100"
          >
            Maybe later
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-sky-500 text-white font-medium hover:bg-sky-600 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
