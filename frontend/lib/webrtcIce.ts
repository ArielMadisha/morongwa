import { webrtcAPI } from '@/lib/api';

const STUN: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

let cachedIce: RTCIceServer[] | null = null;
let cacheAt = 0;
const CACHE_MS = 4 * 60 * 1000;

function expandTurnServers(turn: {
  urls: string[] | string;
  username: string;
  credential: string;
}): RTCIceServer[] {
  const raw = Array.isArray(turn.urls) ? turn.urls : String(turn.urls || '').split(',');
  const urls = raw.map((u) => String(u || '').trim()).filter(Boolean);
  if (!urls.length || !turn.username || !turn.credential) return [];
  return urls.map((url) => ({
    urls: url,
    username: turn.username,
    credential: turn.credential,
  }));
}

/** ICE servers for Morongwa video — STUN + VPS TURN from /api/webrtc/turn-credentials. */
export async function fetchWebRtcIceServers(): Promise<RTCIceServer[]> {
  const now = Date.now();
  if (cachedIce && now - cacheAt < CACHE_MS) return cachedIce;

  const servers: RTCIceServer[] = [...STUN];
  try {
    const res = await webrtcAPI.getTurnCredentials();
    const turn = res.data?.data;
    if (turn?.username && turn.credential) {
      servers.push(...expandTurnServers(turn));
    } else {
      console.warn('TURN credentials response missing username/credential');
    }
  } catch (e) {
    console.warn('TURN credentials unavailable, using STUN only', e);
  }

  if (servers.length <= STUN.length) {
    console.warn('No TURN servers configured — calls may fail across different networks');
  }

  cachedIce = servers;
  cacheAt = now;
  return servers;
}

/** Clear cached ICE (e.g. after auth refresh). */
export function clearWebRtcIceCache(): void {
  cachedIce = null;
  cacheAt = 0;
}
