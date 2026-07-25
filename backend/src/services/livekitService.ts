/**
 * LiveKit Cloud — JWT minting + room helpers.
 * Media (ICE/TURN/SFU) stays on LiveKit; this API never proxies media.
 */
import {
  AccessToken,
  RoomServiceClient,
  WebhookReceiver,
  type VideoGrant,
} from "livekit-server-sdk";
import { logger } from "./monitoring";

export type LiveKitRole = "call" | "host" | "speaker" | "viewer" | "listener";

function env(name: string): string {
  return String(process.env[name] || "").trim();
}

export function getLiveKitUrl(): string {
  return env("LIVEKIT_URL");
}

export function getLiveKitApiKey(): string {
  return env("LIVEKIT_API_KEY");
}

export function getLiveKitApiSecret(): string {
  return env("LIVEKIT_API_SECRET");
}

export function isLiveKitConfigured(): boolean {
  return Boolean(getLiveKitUrl() && getLiveKitApiKey() && getLiveKitApiSecret());
}

export function getTokenTtlSeconds(): number {
  const n = Number.parseInt(env("LIVEKIT_TOKEN_TTL_SECONDS") || "3600", 10);
  return Number.isFinite(n) && n >= 60 ? n : 3600;
}

/** Deterministic 1:1 call room (same for both users). */
export function callRoomName(userIdA: string, userIdB: string): string {
  const [a, b] = [String(userIdA), String(userIdB)].sort();
  return `call-${a}-${b}`;
}

export function liveRoomName(hostUserId: string): string {
  return `live-${String(hostUserId)}`;
}

export function audioRoomName(roomId: string): string {
  const id = String(roomId || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 96);
  return `audio-${id || "room"}`;
}

export function qwertzRoomName(hostUserId: string): string {
  return `qwertz-${String(hostUserId)}`;
}

function grantsForRole(role: LiveKitRole, roomName: string): VideoGrant {
  const base: VideoGrant = {
    roomJoin: true,
    room: roomName,
    canSubscribe: true,
    canPublishData: true,
  };
  switch (role) {
    case "call":
    case "speaker":
      return { ...base, canPublish: true };
    case "host":
      return { ...base, canPublish: true, roomAdmin: true };
    case "viewer":
    case "listener":
      return { ...base, canPublish: false };
    default:
      return { ...base, canPublish: false };
  }
}

export async function mintAccessToken(opts: {
  identity: string;
  name?: string;
  roomName: string;
  role: LiveKitRole;
  metadata?: Record<string, unknown>;
}): Promise<{ token: string; url: string; room: string; role: LiveKitRole; ttlSec: number }> {
  if (!isLiveKitConfigured()) {
    throw new Error("Live media is not configured");
  }
  const identity = String(opts.identity || "").trim();
  if (!identity) throw new Error("identity required");
  const roomName = String(opts.roomName || "").trim();
  if (!roomName) throw new Error("roomName required");

  const ttlSec = getTokenTtlSeconds();
  const at = new AccessToken(getLiveKitApiKey(), getLiveKitApiSecret(), {
    identity,
    name: opts.name || identity,
    ttl: ttlSec,
    metadata: opts.metadata ? JSON.stringify(opts.metadata) : undefined,
  });
  at.addGrant(grantsForRole(opts.role, roomName));
  const token = await at.toJwt();
  return {
    token,
    url: getLiveKitUrl(),
    room: roomName,
    role: opts.role,
    ttlSec,
  };
}

let roomService: RoomServiceClient | null = null;

export function getRoomServiceClient(): RoomServiceClient | null {
  if (!isLiveKitConfigured()) return null;
  if (!roomService) {
    // LiveKit HTTP API is the same host with https (wss → https).
    const httpHost = getLiveKitUrl().replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
    roomService = new RoomServiceClient(httpHost, getLiveKitApiKey(), getLiveKitApiSecret());
  }
  return roomService;
}

export function getWebhookReceiver(): WebhookReceiver | null {
  if (!isLiveKitConfigured()) return null;
  return new WebhookReceiver(getLiveKitApiKey(), getLiveKitApiSecret());
}

export function logLiveKitStartup(): void {
  if (isLiveKitConfigured()) {
    logger.info("LiveKit configured", { url: getLiveKitUrl() });
  } else {
    logger.warn("LiveKit not configured (LIVEKIT_URL / API_KEY / API_SECRET missing)");
  }
}
