'use client';

/**
 * 1:1 / meeting calls: ringing over Socket.IO `/webrtc`, media over LiveKit Cloud.
 * Public surface mirrors useWebRTC so WebRTCCallContext can swap cleanly.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { Room, RoomEvent, Track, createLocalTracks } from 'livekit-client';
import toast from 'react-hot-toast';
import { getCallPresenceSocket } from '@/lib/callPresenceSocket';
import { livekitAPI } from '@/lib/api';
import { LIVEKIT_CONNECT_DEFAULTS, callRoomOptions } from '@/lib/livekit';
import type { CallStatus } from '@/hooks/useWebRTC';

export type { CallStatus };

export interface UseLiveKitCallOptions {
  roomId: string;
  userId: string;
  userName?: string;
  peerUserId: string;
  peerUserName?: string;
  audioOnly?: boolean;
  onCallEnded?: () => void;
}

const RING_TIMEOUT_MS = 60_000;
const CONNECT_TIMEOUT_MS = 45_000;
const CALL_SERVER_WAIT_MS = 20_000;

const CALL_SERVER_DOWN_MSG =
  'Call server is temporarily unavailable (often during a deploy). Wait 30 seconds, refresh the page, then try again.';

function waitForSocketReady(socket: Socket, timeoutMs = CALL_SERVER_WAIT_MS): Promise<boolean> {
  if (socket.connected) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off('connect', onConnect);
      resolve(false);
    }, timeoutMs);
    const onConnect = () => {
      clearTimeout(timer);
      resolve(true);
    };
    socket.once('connect', onConnect);
    if (!socket.connected) socket.connect();
  });
}

function collectRemoteStream(room: Room): MediaStream | null {
  const ms = new MediaStream();
  room.remoteParticipants.forEach((p) => {
    p.trackPublications.forEach((pub) => {
      if (pub.track?.mediaStreamTrack) {
        ms.addTrack(pub.track.mediaStreamTrack);
      }
    });
  });
  return ms.getTracks().length ? ms : null;
}

function collectLocalStream(room: Room): MediaStream | null {
  const ms = new MediaStream();
  room.localParticipant.trackPublications.forEach((pub) => {
    if (pub.track?.mediaStreamTrack) {
      ms.addTrack(pub.track.mediaStreamTrack);
    }
  });
  return ms.getTracks().length ? ms : null;
}

export function useLiveKitCall({
  roomId,
  userId,
  userName,
  peerUserId,
  audioOnly: defaultAudioOnly = false,
  onCallEnded,
}: UseLiveKitCallOptions) {
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [activeAudioOnly, setActiveAudioOnly] = useState(defaultAudioOnly);
  const [incomingCaller, setIncomingCaller] = useState<{
    callerId: string;
    callerName?: string;
  } | null>(null);
  const [livekitToken, setLivekitToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [livekitRoomName, setLivekitRoomName] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const roomRef = useRef<Room | null>(null);
  const callStatusRef = useRef<CallStatus>('idle');
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePeerRef = useRef('');
  const peerSocketIdRef = useRef('');
  const signalingRoomRef = useRef('');
  const audioOnlyRef = useRef(defaultAudioOnly);
  const onCallEndedRef = useRef(onCallEnded);
  const ringHandlersDetachRef = useRef<(() => void) | null>(null);
  const connectLiveKitMediaRef = useRef<
    (opts: { peerUserId?: string; signalingRoomId?: string; meetingMode?: boolean }) => Promise<void>
  >(async () => {});
  /** Bumps on each media connect / intentional teardown so stale disconnects are ignored. */
  const mediaSessionIdRef = useRef(0);
  const mediaConnectInFlightRef = useRef(false);
  const intentionalDisconnectRef = useRef(false);
  const leaveLiveKitRef = useRef<() => Promise<void>>(async () => {});

  onCallEndedRef.current = onCallEnded;

  const syncCallStatus = useCallback((status: CallStatus) => {
    callStatusRef.current = status;
    setCallStatus(status);
  }, []);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  useEffect(() => {
    audioOnlyRef.current = activeAudioOnly;
  }, [activeAudioOnly]);

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

  const disconnectRoomOnly = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    setLivekitToken(null);
    setLivekitUrl(null);
    setLivekitRoomName(null);
    setLocalStream(null);
    setRemoteStream(null);
    if (room) {
      intentionalDisconnectRef.current = true;
      try {
        await room.disconnect();
      } catch {
        /* ignore */
      } finally {
        // Allow a tick for RoomEvent.Disconnected before clearing the flag.
        setTimeout(() => {
          intentionalDisconnectRef.current = false;
        }, 0);
      }
    }
  }, []);

  const leaveLiveKit = useCallback(async () => {
    clearConnectTimer();
    mediaConnectInFlightRef.current = false;
    mediaSessionIdRef.current += 1;
    await disconnectRoomOnly();
  }, [clearConnectTimer, disconnectRoomOnly]);

  useEffect(() => {
    leaveLiveKitRef.current = leaveLiveKit;
  }, [leaveLiveKit]);

  const armConnectTimer = useCallback(() => {
    clearConnectTimer();
    connectTimerRef.current = setTimeout(() => {
      if (callStatusRef.current !== 'connecting') return;
      toast.error('Could not connect — check camera/mic permissions and try again');
      void leaveLiveKit();
      syncCallStatus('idle');
      onCallEndedRef.current?.();
    }, CONNECT_TIMEOUT_MS);
  }, [clearConnectTimer, leaveLiveKit, syncCallStatus]);

  const detachRingHandlers = useCallback(() => {
    ringHandlersDetachRef.current?.();
    ringHandlersDetachRef.current = null;
  }, []);

  const attachRingHandlers = useCallback(
    (socket: Socket, opts: { rid: string; peer: string; role: 'caller' | 'callee' }) => {
      detachRingHandlers();
      const onAccept = (data?: { socketId?: string; roomId?: string }) => {
        if (opts.role !== 'caller') return;
        const eventRoom = String(data?.roomId || '').trim();
        if (eventRoom && eventRoom !== opts.rid) return;
        // Only the first accept should start media; fan-out duplicates must not reconnect.
        if (callStatusRef.current !== 'calling') return;
        if (data?.socketId) peerSocketIdRef.current = String(data.socketId);
        clearRingTimer();
        syncCallStatus('connecting');
        void connectLiveKitMediaRef.current({
          peerUserId: opts.peer,
          signalingRoomId: opts.rid,
        });
      };
      const onReject = () => {
        if (opts.role !== 'caller') return;
        if (callStatusRef.current === 'idle' || callStatusRef.current === 'rejected') return;
        clearRingTimer();
        syncCallStatus('rejected');
        void leaveLiveKit();
        toast('Call declined', { icon: '📵' });
        setTimeout(() => {
          syncCallStatus('idle');
          onCallEndedRef.current?.();
        }, 1500);
      };
      const onCancel = () => {
        clearRingTimer();
        void leaveLiveKit();
        syncCallStatus('idle');
        onCallEndedRef.current?.();
      };
      const onHangup = () => {
        clearRingTimer();
        void leaveLiveKit();
        syncCallStatus('ended');
        setTimeout(() => {
          syncCallStatus('idle');
          onCallEndedRef.current?.();
        }, 400);
      };

      socket.on('call-accept', onAccept);
      socket.on('call-reject', onReject);
      socket.on('call-cancel', onCancel);
      socket.on('webrtc-hangup', onHangup);
      socket.on('hangup', onHangup);

      ringHandlersDetachRef.current = () => {
        socket.off('call-accept', onAccept);
        socket.off('call-reject', onReject);
        socket.off('call-cancel', onCancel);
        socket.off('webrtc-hangup', onHangup);
        socket.off('hangup', onHangup);
      };
    },
    [clearRingTimer, detachRingHandlers, leaveLiveKit, syncCallStatus]
  );

  const connectLiveKitMedia = useCallback(
    async (opts: { peerUserId?: string; signalingRoomId?: string; meetingMode?: boolean }) => {
      // Already in a LiveKit room for this call — ignore duplicate call-accept / re-entry.
      if (roomRef.current && (callStatusRef.current === 'connected' || callStatusRef.current === 'connecting')) {
        if (roomRef.current.state === 'connected') {
          clearConnectTimer();
          syncCallStatus('connected');
          return;
        }
      }
      if (mediaConnectInFlightRef.current) return;

      const peer = String(opts.peerUserId || activePeerRef.current || peerUserId || '').trim();
      const signalingRoom = String(
        opts.signalingRoomId || signalingRoomRef.current || roomId || ''
      ).trim();
      const voiceOnly = audioOnlyRef.current;
      const meetingMode = Boolean(opts.meetingMode);
      const sessionId = ++mediaSessionIdRef.current;
      mediaConnectInFlightRef.current = true;

      try {
        armConnectTimer();
        const res = await livekitAPI.getCallTokenWithRoom({
          peerUserId: peer || undefined,
          roomName: meetingMode || !peer ? signalingRoom : undefined,
        });
        if (sessionId !== mediaSessionIdRef.current) return;

        const { token, url, room: lkRoom } = res.data.data;
        if (!token || !url) throw new Error('Invalid LiveKit token response');

        await disconnectRoomOnly();
        if (sessionId !== mediaSessionIdRef.current) return;

        setLivekitToken(token);
        setLivekitUrl(url);
        setLivekitRoomName(lkRoom);

        const room = new Room(callRoomOptions(voiceOnly));
        roomRef.current = room;

        const markConnected = () => {
          if (sessionId !== mediaSessionIdRef.current) return;
          clearConnectTimer();
          syncCallStatus('connected');
        };

        room.on(RoomEvent.Connected, () => {
          // Local publish is enough to leave "Connecting…"; peer may join a moment later.
          markConnected();
        });
        room.on(RoomEvent.Disconnected, () => {
          if (intentionalDisconnectRef.current) return;
          if (sessionId !== mediaSessionIdRef.current) return;
          if (callStatusRef.current === 'idle') return;
          syncCallStatus('ended');
          setTimeout(() => {
            if (sessionId !== mediaSessionIdRef.current) return;
            syncCallStatus('idle');
            onCallEndedRef.current?.();
          }, 400);
        });
        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (sessionId !== mediaSessionIdRef.current) return;
          if (track.kind === Track.Kind.Audio || track.kind === Track.Kind.Video) {
            setRemoteStream(collectRemoteStream(room));
            markConnected();
          }
        });
        room.on(RoomEvent.TrackUnsubscribed, () => {
          if (sessionId !== mediaSessionIdRef.current) return;
          setRemoteStream(collectRemoteStream(room));
        });
        room.on(RoomEvent.ParticipantConnected, () => {
          markConnected();
        });

        await room.connect(url, token, LIVEKIT_CONNECT_DEFAULTS);
        if (sessionId !== mediaSessionIdRef.current) {
          intentionalDisconnectRef.current = true;
          try {
            await room.disconnect();
          } catch {
            /* ignore */
          }
          return;
        }

        const tracks = await createLocalTracks({
          audio: true,
          video: !voiceOnly,
        });
        if (sessionId !== mediaSessionIdRef.current) {
          for (const track of tracks) {
            try {
              track.stop();
            } catch {
              /* ignore */
            }
          }
          return;
        }
        for (const track of tracks) {
          await room.localParticipant.publishTrack(track);
        }

        setLocalStream(collectLocalStream(room));
        setRemoteStream(collectRemoteStream(room));
        setIsMuted(false);
        setIsVideoOff(voiceOnly);
        markConnected();
      } catch (err) {
        if (sessionId !== mediaSessionIdRef.current) return;
        const cancelled =
          err &&
          typeof err === 'object' &&
          'message' in err &&
          /client initiated disconnect|cancelled|aborted/i.test(String((err as Error).message || ''));
        if (cancelled) {
          // Stale connect aborted by a newer session / React effect — not a user-facing failure.
          return;
        }
        console.error('LiveKit connect failed', err);
        const msg =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
            : undefined;
        toast.error(msg || 'Could not connect call media');
        await leaveLiveKit();
        syncCallStatus('idle');
        onCallEndedRef.current?.();
      } finally {
        if (sessionId === mediaSessionIdRef.current) {
          mediaConnectInFlightRef.current = false;
        }
      }
    },
    [
      armConnectTimer,
      clearConnectTimer,
      disconnectRoomOnly,
      leaveLiveKit,
      peerUserId,
      roomId,
      syncCallStatus,
    ]
  );

  useEffect(() => {
    connectLiveKitMediaRef.current = connectLiveKitMedia;
  }, [connectLiveKitMedia]);

  const joinSignalingRooms = useCallback((socket: Socket, rid: string, uid: string) => {
    socket.emit('join-user-presence', { userId: uid });
    socket.emit('join-call-room', { roomId: rid, userId: uid });
  }, []);

  const startCall = useCallback(
    async (opts?: { audioOnly?: boolean; roomId?: string; peerUserId?: string }) => {
      const voiceOnly = opts?.audioOnly ?? defaultAudioOnly;
      setActiveAudioOnly(voiceOnly);
      audioOnlyRef.current = voiceOnly;
      const uid = String(userId || '');
      const peer = String(opts?.peerUserId || peerUserId || '');
      const rid = String(opts?.roomId || roomId || '');
      activePeerRef.current = peer;
      signalingRoomRef.current = rid;
      if (!rid || !uid || !peer) {
        toast.error('Select a conversation before starting a video call');
        return;
      }

      const socket = getCallPresenceSocket();
      if (!socket) {
        toast.error('Could not start call — refresh the page and stay signed in');
        return;
      }
      socketRef.current = socket;

      syncCallStatus('calling');
      peerSocketIdRef.current = '';
      clearRingTimer();
      ringTimerRef.current = setTimeout(() => {
        if (callStatusRef.current !== 'calling') return;
        toast.error('No answer — try again later');
        clearRingTimer();
        if (socket.connected) {
          socket.emit('call-cancel', { roomId: rid, callerId: uid, calleeId: peer });
        }
        detachRingHandlers();
        syncCallStatus('idle');
      }, RING_TIMEOUT_MS);

      const ready = await waitForSocketReady(socket);
      if (!ready) {
        toast.error(CALL_SERVER_DOWN_MSG);
        clearRingTimer();
        syncCallStatus('idle');
        return;
      }

      joinSignalingRooms(socket, rid, uid);
      attachRingHandlers(socket, { rid, peer, role: 'caller' });
      socket.emit('call-request', {
        roomId: rid,
        callerId: uid,
        callerName: userName,
        calleeId: peer,
        audioOnly: voiceOnly,
      });
    },
    [
      attachRingHandlers,
      clearRingTimer,
      defaultAudioOnly,
      detachRingHandlers,
      joinSignalingRooms,
      peerUserId,
      roomId,
      syncCallStatus,
      userId,
      userName,
    ]
  );

  const acceptCall = useCallback(
    async (
      override?: {
        callerId: string;
        roomId?: string;
        callerName?: string;
        audioOnly?: boolean;
        callerSocketId?: string;
      },
      opts?: { existingSocket?: Socket | null }
    ) => {
      const effectiveRoomId = String(override?.roomId || roomId || '');
      const callerId = String(override?.callerId || incomingCaller?.callerId || '');
      const callerSocketId = String(override?.callerSocketId || '').trim();
      const uid = String(userId || '');
      if (!callerId || !effectiveRoomId || !uid) {
        toast.error('Could not join call — sign in again or refresh the page');
        return;
      }

      const voiceOnly = override?.audioOnly ?? defaultAudioOnly;
      setActiveAudioOnly(voiceOnly);
      audioOnlyRef.current = voiceOnly;
      activePeerRef.current = callerId;
      peerSocketIdRef.current = callerSocketId;
      signalingRoomRef.current = effectiveRoomId;
      setIncomingCaller(null);
      clearRingTimer();
      syncCallStatus('connecting');
      armConnectTimer();

      const socket = opts?.existingSocket ?? getCallPresenceSocket();
      if (!socket) {
        toast.error(CALL_SERVER_DOWN_MSG);
        syncCallStatus('idle');
        return;
      }
      socketRef.current = socket;

      const ready = await waitForSocketReady(socket);
      if (!ready) {
        toast.error(CALL_SERVER_DOWN_MSG);
        syncCallStatus('idle');
        return;
      }

      joinSignalingRooms(socket, effectiveRoomId, uid);
      attachRingHandlers(socket, { rid: effectiveRoomId, peer: callerId, role: 'callee' });
      socket.emit('call-accept', {
        roomId: effectiveRoomId,
        calleeId: uid,
        calleeName: userName,
        callerId,
        ...(callerSocketId ? { callerSocketId } : {}),
      });

      await connectLiveKitMedia({ peerUserId: callerId, signalingRoomId: effectiveRoomId });
    },
    [
      armConnectTimer,
      attachRingHandlers,
      clearRingTimer,
      connectLiveKitMedia,
      defaultAudioOnly,
      incomingCaller?.callerId,
      joinSignalingRooms,
      roomId,
      syncCallStatus,
      userId,
      userName,
    ]
  );

  const joinMeetingRoom = useCallback(
    async (opts: { roomId: string; preferredPeerId?: string; title?: string }) => {
      const rid = String(opts.roomId || '').trim();
      const uid = String(userId || '');
      if (!rid || !uid) {
        toast.error('Sign in to join a meeting');
        return;
      }
      activePeerRef.current = String(opts.preferredPeerId || '').trim();
      signalingRoomRef.current = rid;
      setActiveAudioOnly(false);
      audioOnlyRef.current = false;
      syncCallStatus('connecting');
      armConnectTimer();

      const socket = getCallPresenceSocket();
      if (socket) {
        socketRef.current = socket;
        const ready = await waitForSocketReady(socket);
        if (ready) joinSignalingRooms(socket, rid, uid);
      }

      await connectLiveKitMedia({
        peerUserId: activePeerRef.current || undefined,
        signalingRoomId: rid,
        meetingMode: true,
      });
    },
    [armConnectTimer, connectLiveKitMedia, joinSignalingRooms, syncCallStatus, userId]
  );

  const endCall = useCallback(() => {
    clearRingTimer();
    const socket = socketRef.current ?? getCallPresenceSocket();
    const peer = activePeerRef.current || String(peerUserId || '') || incomingCaller?.callerId || '';
    const rid = signalingRoomRef.current || roomId;
    const uid = String(userId || '');
    if (socket?.connected && rid && peer) {
      const status = callStatusRef.current;
      if (status === 'calling') {
        socket.emit('call-cancel', { roomId: rid, callerId: uid, calleeId: peer });
      } else if (status === 'incoming') {
        socket.emit('call-reject', { roomId: rid, calleeId: uid, callerId: peer });
      } else {
        socket.emit('webrtc-hangup', { roomId: rid, toUserId: peer });
      }
    }
    detachRingHandlers();
    void leaveLiveKit();
    syncCallStatus('idle');
    onCallEndedRef.current?.();
  }, [
    clearRingTimer,
    detachRingHandlers,
    incomingCaller?.callerId,
    leaveLiveKit,
    peerUserId,
    roomId,
    syncCallStatus,
    userId,
  ]);

  const rejectCall = useCallback(() => {
    const socket = getCallPresenceSocket();
    const callerForReject = incomingCaller?.callerId;
    const rid = signalingRoomRef.current || roomId;
    const uid = String(userId || '');
    if (socket?.connected && callerForReject && rid) {
      socket.emit('call-reject', {
        roomId: rid,
        calleeId: uid,
        callerId: callerForReject,
        ...(peerSocketIdRef.current ? { callerSocketId: peerSocketIdRef.current } : {}),
      });
    }
    setIncomingCaller(null);
    clearRingTimer();
    detachRingHandlers();
    syncCallStatus('idle');
  }, [clearRingTimer, detachRingHandlers, incomingCaller?.callerId, roomId, syncCallStatus, userId]);

  const cancelCall = useCallback(() => {
    endCall();
  }, [endCall]);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !isMuted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setIsMuted(next);
  }, [isMuted]);

  const toggleVideo = useCallback(async () => {
    if (activeAudioOnly) return;
    const room = roomRef.current;
    if (!room) return;
    const next = !isVideoOff;
    await room.localParticipant.setCameraEnabled(!next);
    setIsVideoOff(next);
  }, [activeAudioOnly, isVideoOff]);

  // Unmount-only cleanup. Do NOT depend on leaveLiveKit — its identity changes when
  // roomId/peerUserId update (session attach), which was disconnecting LiveKit mid-call
  // ("Client initiated disconnect" / false "Could not connect call media" toasts).
  useEffect(() => {
    return () => {
      clearRingTimer();
      clearConnectTimer();
      detachRingHandlers();
      void leaveLiveKitRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
  }, []);

  return {
    callStatus,
    localStream,
    remoteStream,
    localVideoRef,
    remoteVideoRef,
    isMuted,
    isVideoOff,
    incomingCaller,
    startCall,
    joinMeetingRoom,
    acceptCall,
    rejectCall,
    cancelCall,
    endCall,
    joinRoomForIncoming: () => {},
    leaveRoomForIncoming: () => {},
    showIncomingFromServer: () => {},
    toggleMute,
    toggleVideo,
    activeAudioOnly,
    livekitToken,
    livekitUrl,
    livekitRoomName,
  };
}
