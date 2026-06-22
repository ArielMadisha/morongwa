import { API_BASE } from '@/lib/api';
import { isProdQwertymatesHostname, PROD_API_BASE } from '@/lib/productionConfig';

/**
 * Socket.IO base URL (no namespace).
 * Production browsers must use api.qwertymates.com: Next.js rewrites on www do not
 * proxy Engine.IO/WebSocket correctly (www returns 308 + "route not found").
 */
export function getSocketBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (isProdQwertymatesHostname(host)) {
      return PROD_API_BASE;
    }
    const env = (process.env.NEXT_PUBLIC_SOCKET_URL || '').trim();
    if (env) return env.replace(/\/$/, '');
    return API_BASE.replace(/\/$/, '');
  }
  return (
    process.env.NEXT_PUBLIC_SOCKET_URL?.replace(/\/$/, '') ||
    API_BASE.replace(/\/$/, '') ||
    'http://localhost:4000'
  );
}

export function getWebrtcNamespaceUrl(): string {
  return `${getSocketBaseUrl()}/webrtc`;
}
