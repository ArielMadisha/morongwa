'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, Smartphone } from 'lucide-react';
import { lsGetItem, lsSetItem } from '@/lib/browserStorage';

const STORAGE_KEY = 'qm_webapp_install_hint_dismissed_v1';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * Gentle prompt for phones: install / add to home screen now that we ship a Web App Manifest.
 * Hidden when already running as installed PWA (display-mode: standalone).
 */
export function MobileWebAppHint() {
  const [open, setOpen] = useState(false);
  const [bip, setBip] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (lsGetItem(STORAGE_KEY)) return;

    const mobile =
      window.matchMedia('(max-width: 640px)').matches || 'ontouchstart' in window;
    if (!mobile) return;

    const onBip = (e: Event) => {
      try {
        if (lsGetItem(STORAGE_KEY)) return;
      } catch {
        /* ignore */
      }
      e.preventDefault();
      setBip(e as BeforeInstallPromptEvent);
      setOpen(true);
    };
    window.addEventListener('beforeinstallprompt', onBip);

    const t = window.setTimeout(() => {
      try {
        if (lsGetItem(STORAGE_KEY)) return;
      } catch {
        /* ignore */
      }
      setOpen(true);
    }, 6000);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.clearTimeout(t);
    };
  }, []);

  const dismiss = useCallback(() => {
    try {
      lsSetItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  }, []);

  const install = useCallback(async () => {
    if (!bip) return;
    try {
      await bip.prompt();
      await bip.userChoice;
    } catch {
      /* ignore */
    }
    dismiss();
  }, [bip, dismiss]);

  if (!open) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-label="Install app hint"
    >
      <div className="pointer-events-auto flex max-w-lg flex-col gap-2 rounded-2xl border border-sky-200/80 bg-white/95 px-4 py-3 shadow-xl shadow-sky-900/10 backdrop-blur sm:flex-row sm:items-center">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <Smartphone className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Use Qwertymates like an app</p>
            <p className="mt-0.5 text-xs text-slate-600">
              {bip ? (
                <>Install for a full-screen shortcut on your phone.</>
              ) : (
                <>
                  On iPhone: Share → <span className="font-medium">Add to Home Screen</span>. On Android: menu →{' '}
                  <span className="font-medium">Install app</span> or Add to Home screen.
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 sm:pl-2">
          {bip && (
            <button
              type="button"
              onClick={() => void install()}
              className="rounded-full bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700"
            >
              Install
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
