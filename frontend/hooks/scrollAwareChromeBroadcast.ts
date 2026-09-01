'use client';

/** Module-level bridge so layout-level FABs (Morongwa chat) can follow page scroll-aware chrome. */

export type ScrollAwareChromeBroadcast = {
  hidden: boolean;
  progress: number;
};

let state: ScrollAwareChromeBroadcast = { hidden: false, progress: 1 };
const listeners = new Set<() => void>();

export function getScrollAwareChromeBroadcast(): ScrollAwareChromeBroadcast {
  return state;
}

export function setScrollAwareChromeBroadcast(next: ScrollAwareChromeBroadcast): void {
  if (state.hidden === next.hidden && state.progress === next.progress) return;
  state = next;
  listeners.forEach((l) => l());
}

export function subscribeScrollAwareChromeBroadcast(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
