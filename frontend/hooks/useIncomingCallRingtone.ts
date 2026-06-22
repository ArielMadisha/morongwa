'use client';

import { useEffect } from 'react';
import {
  startIncomingCallRingtone,
  stopIncomingCallRingtone,
  unlockIncomingCallAudio,
} from '@/lib/incomingCallRingtone';

/** Unlock Web Audio on first tap (required on iOS / mobile Chrome before ring can play). */
export function useUnlockCallAudioOnGesture(): void {
  useEffect(() => {
    const unlock = () => unlockIncomingCallAudio();
    document.addEventListener('pointerdown', unlock, { once: true, passive: true });
    document.addEventListener('touchstart', unlock, { once: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, []);
}

/** Ring + vibrate while `active` (incoming call showing). */
export function useIncomingCallRingtone(active: boolean): void {
  useEffect(() => {
    if (!active) {
      stopIncomingCallRingtone();
      return;
    }
    const stop = startIncomingCallRingtone();
    return () => stop();
  }, [active]);
}
