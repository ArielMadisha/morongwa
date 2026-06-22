import { io, Socket } from "socket.io-client";
import { MOBILE_SOCKET_URL } from "../config";
import { getAuthToken } from "./api";

export function getWebrtcSocketUrl(): string {
  return `${MOBILE_SOCKET_URL.replace(/\/$/, "")}/webrtc`;
}

type SignalPayload = Record<string, unknown>;

let sharedClient: CallSignalingClient | null = null;

/** One socket for presence + active call (avoids duplicate connections dropping presence). */
export function getSharedCallSignalingClient(): CallSignalingClient {
  if (!sharedClient) sharedClient = new CallSignalingClient();
  return sharedClient;
}

export class CallSignalingClient {
  private socket: Socket | null = null;
  private refCount = 0;

  /** Connect to the `/webrtc` namespace (Qwertymates calls). */
  connect(): Socket {
    this.refCount = Math.max(0, this.refCount) + 1;
    if (this.socket?.connected) return this.socket;
    const token = getAuthToken();
    this.socket = io(getWebrtcSocketUrl(), {
      transports: ["polling", "websocket"],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: 12,
      timeout: 20000,
      auth: token ? { token } : {},
    });
    return this.socket;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  disconnect(force = false) {
    if (!force) {
      this.refCount = Math.max(0, this.refCount - 1);
      if (this.refCount > 0) return;
    }
    this.refCount = 0;
    this.socket?.disconnect();
    this.socket = null;
  }

  on(event: string, cb: (payload: SignalPayload) => void) {
    this.socket?.on(event, cb);
  }

  off(event: string, cb?: (payload: SignalPayload) => void) {
    if (!this.socket) return;
    if (cb) this.socket.off(event, cb);
    else this.socket.off(event);
  }

  emit(event: string, payload: SignalPayload) {
    this.socket?.emit(event, payload);
  }
}
