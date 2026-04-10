import {
  MOBILE_TURN_URLS,
} from "../config";
import { webrtcAPI } from "./api";

type RNW = typeof import("react-native-webrtc");
type RNMediaStream = import("react-native-webrtc").MediaStream;
type RNConstraints = import("react-native-webrtc/lib/typescript/getUserMedia").Constraints;

export type CallMedia = {
  stream: RNMediaStream;
  audioTrackCount: number;
  videoTrackCount: number;
};

async function loadWebRTC(): Promise<RNW> {
  return import("react-native-webrtc");
}

export async function getLocalUserMedia(
  constraints: RNConstraints = { audio: true, video: true }
): Promise<CallMedia> {
  const { mediaDevices } = await loadWebRTC();
  const stream = (await mediaDevices.getUserMedia(constraints)) as RNMediaStream;
  return {
    stream,
    audioTrackCount: stream.getAudioTracks().length,
    videoTrackCount: stream.getVideoTracks().length,
  };
}

export async function createPeerConnection() {
  const { RTCPeerConnection } = await loadWebRTC();
  const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

  try {
    const res = await webrtcAPI.getTurnCredentials();
    const turn = res.data?.data;
    if (Array.isArray(turn?.urls) && turn.urls.length && turn.username && turn.credential) {
      iceServers.push({
        urls: turn.urls,
        username: turn.username,
        credential: turn.credential,
      });
    } else if (MOBILE_TURN_URLS.length) {
      // URL fallback only; credentials are expected from backend.
      iceServers.push({ urls: MOBILE_TURN_URLS });
    }
  } catch {
    if (MOBILE_TURN_URLS.length) {
      iceServers.push({ urls: MOBILE_TURN_URLS });
    }
  }

  return new RTCPeerConnection({
    iceServers,
    iceCandidatePoolSize: 8,
  });
}

export function stopStream(stream?: RNMediaStream | null) {
  if (!stream) return;
  for (const t of stream.getTracks()) t.stop();
}

