import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { RTCView, RTCIceCandidate, MediaStream } from "react-native-webrtc";
import { ensureCallMediaPermissions } from "../hooks/useCallMediaPermissions";
import { CallSignalingClient } from "../lib/callSignaling";
import { createPeerConnection, getLocalUserMedia, stopStream } from "../lib/webrtc";

type CallScreenProps = {
  userId: string;
  onClose: () => void;
  /** Prefill fields (e.g. from Messages → Video). */
  initialPeerUserId?: string;
  initialRoomId?: string;
  /** Connect socket and emit join-call-room on mount. */
  autoJoinRoom?: boolean;
  /** Voice-only call (no camera). */
  initialAudioOnly?: boolean;
};

type IceInit = Record<string, unknown>;
type CallPhase = "idle" | "dialing" | "connecting" | "in_call" | "ended" | "error";

export function CallScreen({
  userId,
  onClose,
  initialPeerUserId = "",
  initialRoomId = "morongwa-call-demo",
  autoJoinRoom = false,
  initialAudioOnly = false,
}: CallScreenProps) {
  const [roomId, setRoomId] = useState(initialRoomId || "morongwa-call-demo");
  const [peerUserId, setPeerUserId] = useState(initialPeerUserId);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<string>("Disconnected");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [lastError, setLastError] = useState("");
  const [reconnecting, setReconnecting] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [callDurationLabel, setCallDurationLabel] = useState("00:00");
  const [lastCallDurationLabel, setLastCallDurationLabel] = useState("00:00");

  const signaling = useRef(new CallSignalingClient());
  const pcRef = useRef<any>(null);
  const pendingIceRef = useRef<IceInit[]>([]);
  /** User id to send ICE / hangup to (other party). */
  const iceTargetRef = useRef("");
  const roomRef = useRef(roomId);
  const peerRef = useRef(peerUserId);
  roomRef.current = roomId;
  peerRef.current = peerUserId;

  const cleanupPeer = useCallback(() => {
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        /* ignore */
      }
      pcRef.current = null;
    }
    pendingIceRef.current = [];
  }, []);

  const markCallConnected = useCallback(() => {
    setPhase("in_call");
    setReconnecting(false);
    setLastError("");
    setCallStartedAt((prev) => prev ?? Date.now());
  }, []);

  const endCall = useCallback(
    (notifyPeer: boolean) => {
      const peer = (iceTargetRef.current || peerRef.current).trim();
      const room = roomRef.current.trim();
      if (notifyPeer && peer && room) {
        signaling.current.emit("webrtc-hangup", { roomId: room, toUserId: peer });
      }
      cleanupPeer();
      if (localStream) {
        stopStream(localStream);
        setLocalStream(null);
      }
      setRemoteStream(null);
      if (callStartedAt) {
        const sec = Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000));
        const mm = String(Math.floor(sec / 60)).padStart(2, "0");
        const ss = String(sec % 60).padStart(2, "0");
        setLastCallDurationLabel(`${mm}:${ss}`);
      } else {
        setLastCallDurationLabel(callDurationLabel);
      }
      setStatus("Disconnected");
      setPhase("ended");
      setReconnecting(false);
      setCallStartedAt(null);
      setCallDurationLabel("00:00");
    },
    [callDurationLabel, callStartedAt, cleanupPeer, localStream]
  );

  useEffect(() => {
    return () => {
      endCall(false);
      signaling.current.disconnect();
    };
  }, [endCall]);

  useEffect(() => {
    if (!autoJoinRoom || !initialRoomId?.trim()) return;
    const room = initialRoomId.trim();
    const s = signaling.current.connect();
    s.emit("join-call-room", { roomId: room, userId });
    setRoomId(room);
    if (initialPeerUserId) {
      setPeerUserId(initialPeerUserId);
      iceTargetRef.current = initialPeerUserId;
    }
    setStatus(`Joined room ${room}`);
    setPhase("connecting");
  }, [autoJoinRoom, initialRoomId, initialPeerUserId, userId]);

  useEffect(() => {
    if (!callStartedAt || phase !== "in_call") return;
    const id = setInterval(() => {
      const sec = Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000));
      const mm = String(Math.floor(sec / 60)).padStart(2, "0");
      const ss = String(sec % 60).padStart(2, "0");
      setCallDurationLabel(`${mm}:${ss}`);
    }, 1000);
    return () => clearInterval(id);
  }, [callStartedAt, phase]);

  const flushPendingIce = useCallback(async (pc: any) => {
    while (pendingIceRef.current.length) {
      const raw = pendingIceRef.current.shift();
      if (!raw || !(raw as { candidate?: string }).candidate) continue;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(raw as object));
      } catch {
        /* ignore */
      }
    }
  }, []);

  const attachPeerHandlers = useCallback((pc: any) => {
    pc.onicecandidate = (ev: { candidate: RTCIceCandidate | null }) => {
      const c = ev.candidate;
      if (!c) return;
      const peer = iceTargetRef.current.trim();
      const room = roomRef.current.trim();
      if (!peer || !room) return;
      const payload = c.toJSON ? c.toJSON() : { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex };
      signaling.current.emit("webrtc-ice-candidate", {
        roomId: room,
        toUserId: peer,
        candidate: payload,
      });
    };

    pc.ontrack = (ev: { streams: MediaStream[] }) => {
      const rs = ev.streams[0];
      if (rs) setRemoteStream(rs);
    };
  }, []);

  const connectSocket = useCallback(() => {
    const s = signaling.current.connect();
    setStatus(s.connected ? "Socket connected" : "Connecting…");
    s.once("connect", () => {
      setStatus("Socket connected");
      setReconnecting(false);
      setLastError("");
      if (phase === "connecting" || phase === "dialing") {
        const room = roomRef.current.trim();
        if (room) s.emit("join-call-room", { roomId: room, userId });
      }
    });
    s.on("disconnect", () => {
      setStatus("Socket disconnected");
      if (phase === "dialing" || phase === "in_call" || phase === "connecting") {
        setReconnecting(true);
      }
    });
    s.on("connect_error", (err: unknown) => {
      const message = String((err as { message?: string })?.message || err || "Socket connection failed");
      setLastError(message);
      setPhase("error");
      setStatus("Connection issue");
    });
    return s;
  }, [phase, userId]);

  const joinRoom = useCallback(() => {
    const room = roomRef.current.trim();
    if (!room) {
      Alert.alert("Room required", "Enter a call room id.");
      return;
    }
    const s = signaling.current.getSocket() ?? signaling.current.connect();
    s.emit("join-call-room", { roomId: room, userId });
    setStatus(`Joined room ${room}`);
  }, [userId]);

  const ensureLocal = useCallback(async () => {
    if (localStream) return localStream;
    const ok = await ensureCallMediaPermissions();
    if (!ok) throw new Error("permission_denied");
    setBusy(true);
    setPhase("dialing");
    setLastError("");
    try {
      const { stream } = await getLocalUserMedia({ audio: true, video: !initialAudioOnly });
      setLocalStream(stream);
      return stream;
    } finally {
      setBusy(false);
    }
  }, [localStream]);

  const startOutgoingCall = useCallback(async () => {
    const peer = peerRef.current.trim();
    const room = roomRef.current.trim();
    if (!peer || !room) {
      Alert.alert("Peer required", "Enter the other user’s Morongwa user id.");
      return;
    }
    setBusy(true);
    try {
      iceTargetRef.current = peer;
      connectSocket();
      signaling.current.connect().emit("join-call-room", { roomId: room, userId });
      const stream = await ensureLocal();
      cleanupPeer();
      const pc = await createPeerConnection();
      pcRef.current = pc;
      attachPeerHandlers(pc);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      signaling.current.emit("webrtc-offer", {
        roomId: room,
        toUserId: peer,
        offer: { type: offer.type, sdp: offer.sdp },
      });
      setStatus("Calling…");
    } catch (e) {
      if (String(e).includes("permission_denied")) return;
      setPhase("error");
      setLastError(String(e));
      Alert.alert("Call failed", String(e));
    } finally {
      setBusy(false);
    }
  }, [userId, attachPeerHandlers, cleanupPeer, connectSocket, ensureLocal]);

  useEffect(() => {
    const s = signaling.current.connect();

    const onOffer = async (payload: Record<string, unknown>) => {
      const fromUserId = String(payload.fromUserId ?? "");
      const offer = payload.offer as { type?: string; sdp?: string } | undefined;
      const room = String(payload.roomId ?? roomRef.current);
      if (!fromUserId || !offer?.sdp) return;
      if (pcRef.current) return;
      setBusy(true);
      try {
        iceTargetRef.current = fromUserId;
        setPeerUserId(fromUserId);
        cleanupPeer();
        const stream = await ensureLocal();
        const pc = await createPeerConnection();
        pcRef.current = pc;
        attachPeerHandlers(pc);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        await pc.setRemoteDescription(offer as any);
        await flushPendingIce(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signaling.current.emit("webrtc-answer", {
          roomId: room,
          toUserId: fromUserId,
          answer: { type: answer.type, sdp: answer.sdp },
        });
        setStatus("In call (answered)");
        markCallConnected();
      } catch (e) {
        if (String(e).includes("permission_denied")) return;
        setPhase("error");
        setLastError(String(e));
        Alert.alert("Answer failed", String(e));
      } finally {
        setBusy(false);
      }
    };

    const onAnswer = async (payload: Record<string, unknown>) => {
      const answer = payload.answer as { type?: string; sdp?: string } | undefined;
      const pc = pcRef.current;
      if (!pc || !answer?.sdp) return;
      try {
        await pc.setRemoteDescription(answer as any);
        await flushPendingIce(pc);
        setStatus("In call");
        markCallConnected();
      } catch (e) {
        setPhase("error");
        setLastError(String(e));
        Alert.alert("Answer error", String(e));
      }
    };

    const onIce = async (payload: Record<string, unknown>) => {
      const candidate = payload.candidate as IceInit | undefined;
      const pc = pcRef.current;
      if (!candidate || !pc) {
        if (candidate) pendingIceRef.current.push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate as object));
      } catch {
        pendingIceRef.current.push(candidate);
      }
    };

    const onHangup = () => {
      endCall(false);
      setStatus("Peer hung up");
      setPhase("ended");
    };

    s.on("webrtc-offer", onOffer);
    s.on("webrtc-answer", onAnswer);
    s.on("webrtc-ice-candidate", onIce);
    s.on("webrtc-hangup", onHangup);

    return () => {
      s.off("webrtc-offer", onOffer);
      s.off("webrtc-answer", onAnswer);
      s.off("webrtc-ice-candidate", onIce);
      s.off("webrtc-hangup", onHangup);
    };
  }, [attachPeerHandlers, cleanupPeer, endCall, ensureLocal, flushPendingIce]);

  return (
    <View style={styles.wrap}>
      <View style={styles.topBar}>
        <Pressable onPress={() => { endCall(true); onClose(); }} style={styles.backBtn}>
          <Text style={styles.backText}>← Close</Text>
        </Pressable>
        <Text style={styles.title}>{initialAudioOnly ? "Voice call" : "Video call"}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Room id</Text>
        <TextInput
          value={roomId}
          onChangeText={setRoomId}
          style={styles.input}
          placeholder="Shared room name"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
        />
        <Text style={styles.label}>Peer user id (Mongo _id)</Text>
        <TextInput
          value={peerUserId}
          onChangeText={setPeerUserId}
          style={styles.input}
          placeholder="Other user's id"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
        />
        <Text style={styles.hint}>You: {userId}</Text>
        <Text style={styles.status}>{status}</Text>
        {phase === "in_call" ? <Text style={styles.duration}>Call duration: {callDurationLabel}</Text> : null}
        {reconnecting ? <Text style={styles.reconnecting}>Reconnecting to call signaling...</Text> : null}
        {lastError ? <Text style={styles.error}>Last error: {lastError}</Text> : null}
        {phase === "ended" || phase === "error" ? (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Call summary</Text>
            <Text style={styles.summaryText}>
              {phase === "error" ? "Call ended with an error." : "Call ended."}
            </Text>
            <Text style={styles.summaryText}>Duration: {lastCallDurationLabel}</Text>
            <View style={styles.summaryActions}>
              <Pressable onPress={startOutgoingCall} style={styles.summaryRetryBtn} disabled={busy}>
                <Text style={styles.summaryRetryText}>Call again</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onClose();
                }}
                style={styles.summaryCloseBtn}
              >
                <Text style={styles.summaryCloseText}>Back to app</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.videoRow}>
          <View style={styles.vidBox}>
            <Text style={styles.vidLabel}>You</Text>
            {initialAudioOnly ? (
              <View style={styles.vidPlaceholder}>
                <Text style={styles.vidPhText}>Audio only</Text>
              </View>
            ) : localStream ? (
              <RTCView streamURL={localStream.toURL()} style={styles.vid} objectFit="cover" />
            ) : (
              <View style={styles.vidPlaceholder}>
                <Text style={styles.vidPhText}>No preview</Text>
              </View>
            )}
          </View>
          <View style={styles.vidBox}>
            <Text style={styles.vidLabel}>Peer</Text>
            {initialAudioOnly ? (
              <View style={styles.vidPlaceholder}>
                <Text style={styles.vidPhText}>Voice connected</Text>
              </View>
            ) : remoteStream ? (
              <RTCView streamURL={remoteStream.toURL()} style={styles.vid} objectFit="cover" />
            ) : (
              <View style={styles.vidPlaceholder}>
                <Text style={styles.vidPhText}>Waiting…</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable onPress={connectSocket} style={styles.btn}>
            <Text style={styles.btnText}>Connect socket</Text>
          </Pressable>
          <Pressable onPress={joinRoom} style={styles.btn}>
            <Text style={styles.btnText}>Join room</Text>
          </Pressable>
          <Pressable onPress={startOutgoingCall} style={styles.btnPrimary} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Start call (offer)</Text>}
          </Pressable>
          <Pressable
            onPress={() => {
              endCall(true);
            }}
            style={styles.btnDanger}
          >
            <Text style={styles.btnDangerText}>Hang up</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0f172a",
    zIndex: 50,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  backBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  backText: { color: "#93c5fd", fontWeight: "600" },
  title: { color: "#f8fafc", fontSize: 18, fontWeight: "700" },
  scroll: { padding: 16, gap: 10, paddingBottom: 32 },
  label: { color: "#94a3b8", fontSize: 12, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#e2e8f0",
    backgroundColor: "#111827",
  },
  hint: { color: "#64748b", fontSize: 11 },
  status: { color: "#86efac", fontSize: 12 },
  duration: { color: "#93c5fd", fontSize: 12, fontWeight: "700" },
  reconnecting: { color: "#facc15", fontSize: 12, fontWeight: "700" },
  error: { color: "#fca5a5", fontSize: 12 },
  summaryCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    backgroundColor: "#111827",
    padding: 12,
    gap: 8
  },
  summaryTitle: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "700"
  },
  summaryText: {
    color: "#cbd5e1",
    fontSize: 12
  },
  summaryActions: {
    flexDirection: "row",
    gap: 8
  },
  summaryRetryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1d4ed8",
    backgroundColor: "#1e3a8a",
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center"
  },
  summaryRetryText: {
    color: "#dbeafe",
    fontWeight: "700",
    fontSize: 12
  },
  summaryCloseBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0f172a",
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center"
  },
  summaryCloseText: {
    color: "#cbd5e1",
    fontWeight: "700",
    fontSize: 12
  },
  videoRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  vidBox: { flex: 1, gap: 6 },
  vidLabel: { color: "#cbd5e1", fontSize: 11, fontWeight: "600" },
  vid: { width: "100%", aspectRatio: 3 / 4, borderRadius: 12, backgroundColor: "#000" },
  vidPlaceholder: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 12,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
  },
  vidPhText: { color: "#64748b", fontSize: 12 },
  actions: { gap: 10, marginTop: 16 },
  btn: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#1e293b",
  },
  btnText: { color: "#e2e8f0", fontWeight: "700" },
  btnPrimary: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#2563eb",
  },
  btnPrimaryText: { color: "#fff", fontWeight: "800" },
  btnDanger: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#450a0a",
    borderWidth: 1,
    borderColor: "#7f1d1d",
  },
  btnDangerText: { color: "#fecaca", fontWeight: "700" },
});
