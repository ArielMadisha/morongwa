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

function expandTurnIceServers(turn: {
  urls: string[] | string;
  username: string;
  credential: string;
}): RTCIceServer[] {
  const raw = Array.isArray(turn.urls) ? turn.urls : String(turn.urls || "").split(",");
  const urls = raw.map((u) => String(u || "").trim()).filter(Boolean);
  if (!urls.length || !turn.username || !turn.credential) return [];
  return urls.map((url) => ({
    urls: url,
    username: turn.username,
    credential: turn.credential,
  }));
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
    if (turn?.username && turn.credential) {
      iceServers.push(...expandTurnIceServers(turn));
    } else if (MOBILE_TURN_URLS.length) {
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
    bundlePolicy: "max-bundle",
  });
}

export function stopStream(stream?: RNMediaStream | null) {
  if (!stream) return;
  for (const t of stream.getTracks()) t.stop();
}
