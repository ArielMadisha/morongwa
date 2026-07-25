/**
 * Shared LiveKit client helpers (room options + metadata).
 * Tokens come from the API — never embed LIVEKIT_API_SECRET in the browser.
 */
import type { RoomOptions } from 'livekit-client';

export const LIVEKIT_CONNECT_DEFAULTS = {
  autoSubscribe: true,
} as const;

export function callRoomOptions(audioOnly = false): RoomOptions {
  return {
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: audioOnly
      ? undefined
      : {
          resolution: { width: 1280, height: 720, frameRate: 30 },
        },
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  };
}

export function broadcastRoomOptions(portrait = false): RoomOptions {
  return {
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: {
      resolution: portrait
        ? { width: 720, height: 1280, frameRate: 30 }
        : { width: 1280, height: 720, frameRate: 30 },
    },
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  };
}

export function audioRoomOptions(): RoomOptions {
  return {
    adaptiveStream: true,
    dynacast: true,
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  };
}

export function parseParticipantMetadata(raw?: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
