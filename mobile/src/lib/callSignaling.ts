import { io, Socket } from "socket.io-client";
import { MOBILE_SOCKET_URL } from "../config";
import { getAuthToken } from "./api";

export function getWebrtcSocketUrl(): string {
  return `${MOBILE_SOCKET_URL.replace(/\/$/, "")}/webrtc`;
}

type SignalPayload = Record<string, unknown>;

export class CallSignalingClient {
  private socket: Socket | null = null;

  /** Connect to the `/webrtc` namespace (Morongwa calls). */
  connect(): Socket {
    if (this.socket?.connected) return this.socket;
    const token = getAuthToken();
    this.socket = io(getWebrtcSocketUrl(), {
      transports: ["websocket", "polling"],
      auth: token ? { token } : {},
    });
    return this.socket;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  disconnect() {
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
