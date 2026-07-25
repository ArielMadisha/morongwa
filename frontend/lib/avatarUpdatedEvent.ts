/** Notify wall/status strip that the signed-in user's avatar or feed post changed. */
export type AvatarUpdatedDetail = {
  avatar?: string;
  feedPost?: Record<string, unknown>;
};

export function dispatchAvatarUpdated(detail?: AvatarUpdatedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('qwertymates:avatar-updated', { detail }));
  window.dispatchEvent(new CustomEvent('qwertymates:status-strip-refresh'));
}

export function dispatchFeedContentUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('qwertymates:status-strip-refresh'));
}
