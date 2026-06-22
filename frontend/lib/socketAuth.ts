import { lsGetItem } from '@/lib/browserStorage';

/** JWT for Socket.IO handshake (`auth.token`). */
export function getSocketAuth(): { token?: string } {
  if (typeof window === 'undefined') return {};
  const token = lsGetItem('token');
  return token ? { token } : {};
}
