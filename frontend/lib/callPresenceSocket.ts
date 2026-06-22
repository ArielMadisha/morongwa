import type { Socket } from 'socket.io-client';

/** Shared CallPresence socket — avoids a second /webrtc connection on accept. */
let presenceSocket: Socket | null = null;

export function registerCallPresenceSocket(socket: Socket | null) {
  presenceSocket = socket;
}

export function getCallPresenceSocket(): Socket | null {
  return presenceSocket?.connected ? presenceSocket : null;
}
