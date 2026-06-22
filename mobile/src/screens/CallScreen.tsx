import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { getSharedCallSignalingClient } from "../lib/callSignaling";
import { createPeerConnection, getLocalUserMedia, stopStream } from "../lib/webrtc";

type CallScreenProps = {
  userId: string;
  onClose: () => void;
  /** Prefill fields (e.g. from Messages → Video). */
  initialPeerUserId?: string;
  initialPeerName?: string;
  initialRoomId?: string;
  /** Connect socket and emit join-call-room on mount. */
  autoJoinRoom?: boolean;
  /** Auto-dial peer after joining (outgoing). */
  autoStartCall?: boolean;
  /** Voice-only call (no camera). */
  initialAudioOnly?: boolean;
  /** Incoming call from web — emit call-accept after media is ready. */
  answerIncoming?: boolean;
  incomingCallerId?: string;
  /** Group call — ring additional participants. */
  invitedUserIds?: string[];
};

type IceInit = Record<string, unknown>;
type CallPhase = "idle" | "dialing" | "connecting" | "in_call" | "ended" | "error";

const RING_TIMEOUT_MS = 60_000;
const CONNECT_TIMEOUT_MS = 45_000;

export function CallScreen({
  userId,
  onClose,
  initialPeerUserId = "",
  initialPeerName = "",
  initialRoomId = "",
  autoJoinRoom = false,
  autoStartCall = false,
  initialAudioOnly = false,
  answerIncoming = false,
  incomingCallerId = "",
  invitedUserIds = [],
}: CallScreenProps) {
  const [roomId, setRoomId] = useState(initialRoomId || "");
  const [peerUserId, setPeerUserId] = useState(initialPeerUserId);
  const [peerName] = useState(initialPeerName || "Contact");
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

  const signaling = useRef(getSharedCallSignalingClient());
  const pcRef = useRef<any>(null);
  const pendingIceRef = useRef<IceInit[]>([]);
  const pendingAcceptRef = useRef(false);
  const pendingOfferRef = useRef<{ type?: string; sdp?: string } | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** User id to send ICE / hangup to (other party). */
  const iceTargetRef = useRef("");
  const roomRef = useRef(roomId);
  const peerRef = useRef(peerUserId);
  roomRef.current = roomId;
  peerRef.current = peerUserId;

  const clearRingTimer = useCallback(() => {
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
  }, []);

  const clearConnectTimer = useCallback(() => {
    if (connectTimerRef.current) {
      clearTimeout(connectTimerRef.current);
      connectTimerRef.current = null;
    }
  }, []);

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
    pendingAcceptRef.current = false;
    pendingOfferRef.current = null;
  }, []);

  const markCallConnected = useCallback(() => {
    clearRingTimer();
    clearConnectTimer();
    setPhase("in_call");
    setReconnecting(false);
    setLastError("");
    setCallStartedAt((prev) => prev ?? Date.now());
  }, [clearConnectTimer, clearRingTimer]);

  const endCall = useCallback(
    (notifyPeer: boolean) => {
      clearRingTimer();
      clearConnectTimer();
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
    [callDurationLabel, callStartedAt, cleanupPeer, clearConnectTimer, clearRingTimer, localStream]
  );

  const armConnectTimer = useCallback(() => {
    clearConnectTimer();
    connectTimerRef.current = setTimeout(() => {
      setLastError("Connection timed out — try again on Wi‑Fi");
      setPhase("error");
      endCall(true);
    }, CONNECT_TIMEOUT_MS);
  }, [clearConnectTimer, endCall]);

  const armRingTimer = useCallback(() => {
    clearRingTimer();
    ringTimerRef.current = setTimeout(() => {
      setStatus("No answer");
      setPhase("ended");
      const peer = iceTargetRef.current.trim() || peerRef.current.trim();
      const room = roomRef.current.trim();
      if (peer && room) {
        signaling.current.emit("call-cancel", { roomId: room, callerId: userId, calleeId: peer });
      }
      endCall(false);
    }, RING_TIMEOUT_MS);
  }, [clearRingTimer, endCall, userId]);

  useEffect(() => {
    return () => {
      endCall(false);
      signaling.current.disconnect(true);
    };
  }, [endCall]);

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
    const onSocketConnect = () => {
      setStatus("Socket connected");
      setReconnecting(false);
      setLastError("");
      s.emit("join-user-presence", { userId });
      if (phase === "connecting" || phase === "dialing") {
        const room = roomRef.current.trim();
        if (room) s.emit("join-call-room", { roomId: room, userId });
      }
    };
    s.off("connect");
    s.on("connect", onSocketConnect);
    if (s.connected) onSocketConnect();
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

  const sendOfferToPeer = useCallback(async () => {
    const peer = iceTargetRef.current.trim() || peerRef.current.trim();
    const room = roomRef.current.trim();
    const pc = pcRef.current;
    if (!peer || !room) return;
    if (!pc) {
      pendingAcceptRef.current = true;
      return;
    }
    if (pc.signalingState === "have-local-offer") {
      pendingAcceptRef.current = false;
      return;
    }
    pendingAcceptRef.current = false;
    clearRingTimer();
    armConnectTimer();
    const offer = await pc.createOffer({});
    await pc.setLocalDescription(offer);
    signaling.current.emit("webrtc-offer", {
      roomId: room,
      toUserId: peer,
      offer: { type: offer.type, sdp: offer.sdp },
    });
    setStatus("Connecting…");
    setPhase("connecting");
  }, [armConnectTimer, clearRingTimer]);

  const applyRemoteOffer = useCallback(
    async (
      fromUserId: string,
      room: string,
      offer: { type?: string; sdp?: string },
      pc: any
    ) => {
      await pc.setRemoteDescription(offer as any);
      await flushPendingIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signaling.current.emit("webrtc-answer", {
        roomId: room,
        toUserId: fromUserId,
        answer: { type: answer.type, sdp: answer.sdp },
      });
      setStatus("In call");
      markCallConnected();
    },
    [flushPendingIce, markCallConnected]
  );

  const startOutgoingCall = useCallback(async () => {
    const peer = peerRef.current.trim();
    const room = roomRef.current.trim();
    if (!peer || !room) {
      Alert.alert("Contact required", "Pick someone to call from the call menu.");
      return;
    }
    setBusy(true);
    try {
      iceTargetRef.current = peer;
      connectSocket();
      const s = signaling.current.connect();
      s.emit("join-user-presence", { userId });
      s.emit("join-call-room", { roomId: room, userId });
      const stream = await ensureLocal();
      cleanupPeer();
      const pc = await createPeerConnection();
      pcRef.current = pc;
      attachPeerHandlers(pc);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const ring = (calleeId: string) => {
        s.emit("call-request", {
          roomId: room,
          callerId: userId,
          callerName: peerName,
          calleeId,
          audioOnly: initialAudioOnly,
        });
      };
      ring(peer);
      for (const id of invitedUserIds) {
        const cid = String(id || "").trim();
        if (cid && cid !== peer) ring(cid);
      }
      setStatus(`Calling ${peerName}…`);
      setPhase("dialing");
      armRingTimer();
      if (pendingAcceptRef.current) await sendOfferToPeer();
    } catch (e) {
      if (String(e).includes("permission_denied")) return;
      setPhase("error");
      setLastError(String(e));
      Alert.alert("Call failed", String(e));
    } finally {
      setBusy(false);
    }
  }, [userId, attachPeerHandlers, cleanupPeer, connectSocket, ensureLocal, invitedUserIds, peerName, armRingTimer, sendOfferToPeer, initialAudioOnly]);

  useEffect(() => {
    if (!autoJoinRoom || !initialRoomId?.trim()) return;
    const room = initialRoomId.trim();
    const callerId = String(incomingCallerId || initialPeerUserId || "").trim();

    const run = async () => {
      connectSocket();
      const s = signaling.current.connect();
      s.emit("join-user-presence", { userId });
      s.emit("join-call-room", { roomId: room, userId });
      setRoomId(room);
      if (initialPeerUserId) {
        setPeerUserId(initialPeerUserId);
        iceTargetRef.current = initialPeerUserId;
      }
      setStatus(answerIncoming ? "Answering…" : `Joined room ${room}`);
      setPhase("connecting");

      if (!answerIncoming || !callerId) return;

      try {
        iceTargetRef.current = callerId;
        setPeerUserId(callerId);
        const stream = await ensureLocal();
        cleanupPeer();
        const pc = await createPeerConnection();
        pcRef.current = pc;
        attachPeerHandlers(pc);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        s.emit("call-accept", {
          roomId: room,
          calleeId: userId,
          calleeName: peerName,
          callerId,
        });
        setStatus("Connecting…");
        armConnectTimer();
        const queued = pendingOfferRef.current;
        if (queued?.sdp && pcRef.current) {
          pendingOfferRef.current = null;
          await applyRemoteOffer(callerId, room, queued, pcRef.current);
        }
      } catch (e) {
        if (String(e).includes("permission_denied")) return;
        setPhase("error");
        setLastError(String(e));
      }
    };

    void run();
  }, [
    autoJoinRoom,
    initialRoomId,
    initialPeerUserId,
    userId,
    answerIncoming,
    incomingCallerId,
    connectSocket,
    ensureLocal,
    cleanupPeer,
    attachPeerHandlers,
    armConnectTimer,
    applyRemoteOffer,
    peerName,
  ]);

  const shouldAutoStart =
    autoStartCall || (autoJoinRoom && Boolean(initialPeerUserId?.trim()) && !answerIncoming);

  useEffect(() => {
    if (!shouldAutoStart || !initialRoomId?.trim() || !initialPeerUserId?.trim()) return;
    if (phase !== "idle" && phase !== "connecting") return;
    const t = setTimeout(() => {
      void startOutgoingCall();
    }, 400);
    return () => clearTimeout(t);
  }, [shouldAutoStart, initialRoomId, initialPeerUserId, startOutgoingCall]);

  const showDevControls = __DEV__ && !initialPeerUserId?.trim();

  useLayoutEffect(() => {
    const s = signaling.current.connect();

    const onOffer = async (payload: Record<string, unknown>) => {
      const fromUserId = String(payload.fromUserId ?? "");
      const offer = payload.offer as { type?: string; sdp?: string } | undefined;
      const room = String(payload.roomId ?? roomRef.current);
      if (!fromUserId || !offer?.sdp) return;

      iceTargetRef.current = fromUserId;
      setPeerUserId(fromUserId);

      const existingPc = pcRef.current;
      if (existingPc) {
        setBusy(true);
        try {
          await applyRemoteOffer(fromUserId, room, offer, existingPc);
        } catch (e) {
          if (String(e).includes("permission_denied")) return;
          setPhase("error");
          setLastError(String(e));
          Alert.alert("Answer failed", String(e));
        } finally {
          setBusy(false);
        }
        return;
      }

      pendingOfferRef.current = offer;
      if (answerIncoming || autoJoinRoom) return;

      setBusy(true);
      try {
        cleanupPeer();
        const stream = await ensureLocal();
        const pc = await createPeerConnection();
        pcRef.current = pc;
        attachPeerHandlers(pc);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        await applyRemoteOffer(fromUserId, room, offer, pc);
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

    const onCallAccept = async () => {
      try {
        await sendOfferToPeer();
      } catch (e) {
        setPhase("error");
        setLastError(String(e));
        Alert.alert("Call failed", String(e));
      }
    };

    const onCallReject = () => {
      setStatus("Call declined");
      setPhase("ended");
    };

    s.on("webrtc-offer", onOffer);
    s.on("webrtc-answer", onAnswer);
    s.on("webrtc-ice-candidate", onIce);
    s.on("webrtc-hangup", onHangup);
    s.on("call-accept", onCallAccept);
    s.on("call-reject", onCallReject);

    return () => {
      s.off("webrtc-offer", onOffer);
      s.off("webrtc-answer", onAnswer);
      s.off("webrtc-ice-candidate", onIce);
      s.off("webrtc-hangup", onHangup);
      s.off("call-accept", onCallAccept);
      s.off("call-reject", onCallReject);
    };
  }, [attachPeerHandlers, applyRemoteOffer, autoJoinRoom, answerIncoming, cleanupPeer, endCall, ensureLocal, flushPendingIce, sendOfferToPeer]);

  return (
    <View style={styles.wrap}>
      <View style={styles.topBar}>
        <Pressable onPress={() => { endCall(true); onClose(); }} style={styles.backBtn}>
          <Text style={styles.backText}>← Close</Text>
        </Pressable>
        <Text style={styles.title}>{initialAudioOnly ? "Voice call" : "Video call"}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {initialPeerUserId ? (
          <View style={styles.peerCard}>
            <Text style={styles.peerLabel}>{initialAudioOnly ? "Voice call with" : "Video call with"}</Text>
            <Text style={styles.peerName}>{peerName}</Text>
            {invitedUserIds.length > 1 ? (
              <Text style={styles.hint}>{invitedUserIds.length} people invited to this room</Text>
            ) : null}
          </View>
        ) : null}

        {showDevControls ? (
          <>
            <Text style={styles.label}>Room id (dev only)</Text>
            <TextInput
              value={roomId}
              onChangeText={setRoomId}
              style={styles.input}
              placeholder="Shared room name"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
            />
            <Text style={styles.label}>Peer user id (dev only)</Text>
            <TextInput
              value={peerUserId}
              onChangeText={setPeerUserId}
              style={styles.input}
              placeholder="Other user's id"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
            />
          </>
        ) : null}
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
          {showDevControls ? (
            <>
              <Pressable onPress={connectSocket} style={styles.btn}>
                <Text style={styles.btnText}>Connect socket</Text>
              </Pressable>
              <Pressable onPress={joinRoom} style={styles.btn}>
                <Text style={styles.btnText}>Join room</Text>
              </Pressable>
            </>
          ) : null}
          {phase === "idle" || phase === "ended" || phase === "error" ? (
            <Pressable onPress={startOutgoingCall} style={styles.btnPrimary} disabled={busy || !peerUserId}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Call again</Text>}
            </Pressable>
          ) : null}
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
  peerCard: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    padding: 14,
    backgroundColor: "#111827",
    marginBottom: 8,
  },
  peerLabel: { color: "#94a3b8", fontSize: 12, fontWeight: "600" },
  peerName: { color: "#f8fafc", fontSize: 20, fontWeight: "700", marginTop: 4 },
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
