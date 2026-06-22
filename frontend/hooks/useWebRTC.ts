'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocketAuth } from '@/lib/socketAuth';
import toast from 'react-hot-toast';
import { getCallPresenceSocket } from '@/lib/callPresenceSocket';
import { getWebrtcNamespaceUrl } from '@/lib/socketUrl';
import { fetchWebRtcIceServers } from '@/lib/webrtcIce';

export type CallStatus = 'idle' | 'calling' | 'incoming' | 'connecting' | 'connected' | 'ended' | 'rejected';

export interface UseWebRTCOptions {
  roomId: string;
  userId: string;
  userName?: string;
  peerUserId: string;
  peerUserName?: string;
  /** Default call mode when startCall() is invoked without override. */
  audioOnly?: boolean;
  onCallEnded?: () => void;
}

const RING_TIMEOUT_MS = 60_000;
const CONNECT_TIMEOUT_MS = 45_000;

async function flushIceQueue(pc: RTCPeerConnection, queue: RTCIceCandidateInit[]) {
  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate) continue;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Failed to add queued ICE candidate', e);
    }
  }
}

function attachCallSocketHandlers(
  socket: Socket,
  opts: {
    roomId: string;
    userId: string;
    peerUserId: string;
    pcRef: React.MutableRefObject<RTCPeerConnection | null>;
    setCallStatus: (s: CallStatus) => void;
    setRemoteStream: (s: MediaStream | null) => void;
    cleanup: () => void;
    endCall: () => void;
    role: 'caller' | 'callee';
    calleeCallerId?: string;
    signalingRoomId?: string;
    pendingOfferRef?: React.MutableRefObject<RTCSessionDescriptionInit | null>;
    pendingAnswerRef?: React.MutableRefObject<RTCSessionDescriptionInit | null>;
    pendingAcceptRef?: React.MutableRefObject<boolean>;
    iceQueueRef?: React.MutableRefObject<RTCIceCandidateInit[]>;
    sendOffer?: () => Promise<void>;
    applyAnswer?: (answer: RTCSessionDescriptionInit) => Promise<void>;
    onConnected?: () => void;
    clearRingTimer?: () => void;
  }
) {
  const rid = opts.signalingRoomId ?? opts.roomId;
  const peer = opts.role === 'caller' ? opts.peerUserId : opts.calleeCallerId || opts.peerUserId;
  const iceQueue = opts.iceQueueRef?.current ?? [];

  const handleCalleeOffer = async (offer: RTCSessionDescriptionInit) => {
    const pc = opts.pcRef.current;
    if (!pc) {
      if (opts.pendingOfferRef) opts.pendingOfferRef.current = offer;
      return;
    }
    if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer') {
      if (opts.pendingOfferRef) opts.pendingOfferRef.current = offer;
      return;
    }
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', { roomId: rid, toUserId: peer, answer });
      if (opts.iceQueueRef) await flushIceQueue(pc, opts.iceQueueRef.current);
    } catch (e) {
      console.error('Failed to handle offer', e);
      toast.error('Could not connect video');
      opts.endCall();
    }
  };

  const onCallReject = () => {
    opts.setCallStatus('rejected');
    opts.cleanup();
  };

  const onCallAccept = async () => {
    opts.setCallStatus('connecting');
    opts.clearRingTimer?.();
    if (opts.sendOffer) {
      await opts.sendOffer();
    } else if (opts.pendingAcceptRef) {
      opts.pendingAcceptRef.current = true;
    }
  };

  const onWebrtcAnswer = async (data: { fromUserId: string; answer: RTCSessionDescriptionInit }) => {
    if (String(data.fromUserId) !== String(opts.peerUserId)) return;
    if (opts.applyAnswer) {
      await opts.applyAnswer(data.answer);
      return;
    }
    if (!opts.pcRef.current) {
      if (opts.pendingAnswerRef) opts.pendingAnswerRef.current = data.answer;
      return;
    }
    const pc = opts.pcRef.current;
    if (pc.signalingState === 'stable' && pc.remoteDescription?.type === 'answer') {
      return;
    }
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      if (opts.iceQueueRef) await flushIceQueue(pc, opts.iceQueueRef.current);
    } catch (e) {
      console.error('Failed to set remote description', e);
      toast.error('Could not complete video connection');
      opts.endCall();
    }
  };

  const onWebrtcOffer = async (data: { fromUserId: string; offer: RTCSessionDescriptionInit }) => {
    if (String(data.fromUserId) !== String(peer)) return;
    await handleCalleeOffer(data.offer);
  };

  const onIceCandidate = async (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
    if (String(data.fromUserId) !== String(peer)) return;
    if (!opts.pcRef.current) {
      if (opts.iceQueueRef) opts.iceQueueRef.current.push(data.candidate);
      return;
    }
    const pc = opts.pcRef.current;
    if (!pc.remoteDescription) {
      if (opts.iceQueueRef) opts.iceQueueRef.current.push(data.candidate);
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) {
      console.error('Failed to add ICE candidate', e);
    }
  };

  const onPeerLeft = () => {
    opts.endCall();
  };

  const onHangup = (data: { fromUserId?: string }) => {
    if (data?.fromUserId && String(data.fromUserId) !== String(peer)) return;
    opts.endCall();
  };

  if (opts.role === 'caller') {
    socket.on('call-reject', onCallReject);
    socket.on('call-accept', onCallAccept);
    socket.on('webrtc-answer', onWebrtcAnswer);
  } else {
    socket.on('webrtc-offer', onWebrtcOffer);
  }

  socket.on('webrtc-ice-candidate', onIceCandidate);
  socket.on('peer-left', onPeerLeft);
  socket.on('webrtc-hangup', onHangup);

  const detach = () => {
    if (opts.role === 'caller') {
      socket.off('call-reject', onCallReject);
      socket.off('call-accept', onCallAccept);
      socket.off('webrtc-answer', onWebrtcAnswer);
    } else {
      socket.off('webrtc-offer', onWebrtcOffer);
    }
    socket.off('webrtc-ice-candidate', onIceCandidate);
    socket.off('peer-left', onPeerLeft);
    socket.off('webrtc-hangup', onHangup);
  };

  return { handleCalleeOffer, detach };
}

export function useWebRTC({
  roomId,
  userId,
  userName,
  peerUserId,
  peerUserName,
  audioOnly: defaultAudioOnly = false,
  onCallEnded,
}: UseWebRTCOptions) {
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [activeAudioOnly, setActiveAudioOnly] = useState(defaultAudioOnly);
  const [incomingCaller, setIncomingCaller] = useState<{ callerId: string; callerName?: string } | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const incomingCallRoomRef = useRef<string | null>(null);
  const incomingAudioOnlyRef = useRef<boolean>(defaultAudioOnly);
  const activePeerRef = useRef<string>('');
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingAnswerRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingAcceptRef = useRef(false);
  const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const callStatusRef = useRef<CallStatus>('idle');
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When true, endCall must not disconnect (shared CallPresence socket). */
  const keepPresenceSocketRef = useRef(false);
  const detachSignalingHandlersRef = useRef<(() => void) | null>(null);
  const signalingRoomRef = useRef('');
  const signalingUserRef = useRef('');
  const sendOfferRef = useRef<(() => Promise<void>) | null>(null);
  const onSignalingReconnectRef = useRef<(() => void) | null>(null);
  const iceRestartAttemptedRef = useRef(false);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  const detachCallSocket = useCallback((socket: Socket | null) => {
    detachSignalingHandlersRef.current?.();
    detachSignalingHandlersRef.current = null;
    const rejoin = onSignalingReconnectRef.current;
    if (socket && rejoin) {
      socket.off('connect', rejoin);
      socket.io.off('reconnect', rejoin);
    }
    onSignalingReconnectRef.current = null;
    sendOfferRef.current = null;
    if (!socket) return;
    if (keepPresenceSocketRef.current) {
      if (socket.connected) socket.emit('leave-call-room');
      keepPresenceSocketRef.current = false;
      return;
    }
    socket.disconnect();
  }, []);

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

  const cleanup = useCallback(() => {
    clearRingTimer();
    clearConnectTimer();
    pendingOfferRef.current = null;
    pendingAnswerRef.current = null;
    pendingAcceptRef.current = false;
    iceQueueRef.current = [];
    iceRestartAttemptedRef.current = false;
    detachSignalingHandlersRef.current?.();
    detachSignalingHandlersRef.current = null;
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }
    setRemoteStream(null);
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave-call-room');
    }
  }, [localStream, clearRingTimer, clearConnectTimer]);

  const endCall = useCallback(() => {
    const socket = socketRef.current;
    const rid = signalingRoomRef.current || incomingCallRoomRef.current || roomId;
    const peer = activePeerRef.current || String(peerUserId || '') || incomingCaller?.callerId || '';
    if (socket?.connected && rid && peer) {
      socket.emit('webrtc-hangup', { roomId: rid, toUserId: peer });
    }
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
    activePeerRef.current = '';
    incomingCallRoomRef.current = null;
    incomingAudioOnlyRef.current = defaultAudioOnly;
    if (socket?.connected && keepPresenceSocketRef.current) {
      socket.emit('leave-call-room');
      keepPresenceSocketRef.current = false;
    }
    cleanup();
    setCallStatus('idle');
    setIncomingCaller(null);
    onCallEnded?.();
  }, [cleanup, onCallEnded, roomId, peerUserId, incomingCaller?.callerId, defaultAudioOnly]);

  const armConnectTimer = useCallback(() => {
    clearConnectTimer();
    connectTimerRef.current = setTimeout(() => {
      if (callStatusRef.current !== 'connecting') return;
      toast.error('Video connection timed out. Try again on Wi‑Fi or another network.');
      endCall();
    }, CONNECT_TIMEOUT_MS);
  }, [clearConnectTimer, endCall]);

  const markConnected = useCallback(() => {
    clearConnectTimer();
    setCallStatus('connected');
  }, [clearConnectTimer]);

  const joinSignalingRooms = useCallback((socket: Socket, rid: string, uid: string) => {
    socket.emit('join-user-presence', { userId: uid });
    socket.emit('join-call-room', { roomId: rid, userId: uid });
  }, []);

  const wireSignalingReconnect = useCallback(
    (socket: Socket, rid: string, uid: string) => {
      const prev = onSignalingReconnectRef.current;
      if (prev) {
        socket.off('connect', prev);
        socket.io.off('reconnect', prev);
      }
      const rejoin = () => {
        joinSignalingRooms(socket, rid, uid);
        if (callStatusRef.current === 'connecting' && sendOfferRef.current) {
          void sendOfferRef.current();
        }
      };
      onSignalingReconnectRef.current = rejoin;
      socket.on('connect', rejoin);
      socket.io.on('reconnect', rejoin);
    },
    [joinSignalingRooms]
  );

  const createPeerConnection = useCallback(async (targetUserId: string, signalingRoomId?: string) => {
    const rid = signalingRoomId ?? roomId;
    const iceServers = await fetchWebRtcIceServers();
    const pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 8,
      bundlePolicy: 'max-bundle',
    });

    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef.current?.connected) {
        socketRef.current.emit('webrtc-ice-candidate', {
          roomId: rid,
          toUserId: targetUserId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (e) => {
      if (e.streams[0]) {
        setRemoteStream(e.streams[0]);
        markConnected();
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }
        markConnected();
        return;
      }
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        endCall();
        return;
      }
      if (pc.connectionState === 'disconnected') {
        if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = setTimeout(() => {
          if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            endCall();
          }
        }, 8000);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const ice = pc.iceConnectionState;
      if (ice === 'connected' || ice === 'completed') {
        markConnected();
      } else if (ice === 'failed') {
        if (!iceRestartAttemptedRef.current && sendOfferRef.current) {
          iceRestartAttemptedRef.current = true;
          try {
            pc.restartIce();
            void sendOfferRef.current();
          } catch (e) {
            console.error('ICE restart failed', e);
            endCall();
          }
        } else {
          endCall();
        }
      }
    };

    return pc;
  }, [roomId, endCall, markConnected]);

  const connectCallSocket = useCallback(() => {
    keepPresenceSocketRef.current = false;
    const socket = io(getWebrtcNamespaceUrl(), {
      auth: getSocketAuth(),
      autoConnect: true,
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: 8,
      timeout: 20000,
    });
    socketRef.current = socket;
    return socket;
  }, []);

  const startCall = useCallback(async (opts?: { audioOnly?: boolean; roomId?: string; peerUserId?: string }) => {
    const voiceOnly = opts?.audioOnly ?? defaultAudioOnly;
    setActiveAudioOnly(voiceOnly);
    const uid = String(userId || '');
    const peer = String(opts?.peerUserId || peerUserId || '');
    const rid = String(opts?.roomId || roomId || '');
    activePeerRef.current = peer;
    if (!rid || !uid || !peer) {
      toast.error('Select a conversation before starting a video call');
      return;
    }

    setCallStatus('calling');
    clearRingTimer();
    ringTimerRef.current = setTimeout(() => {
      if (callStatusRef.current !== 'calling') return;
      toast.error('No answer — try again later');
      clearRingTimer();
      if (socketRef.current?.connected) {
        socketRef.current.emit('call-cancel', {
          roomId: rid,
          callerId: uid,
          calleeId: peer,
        });
      }
      detachCallSocket(socketRef.current);
      cleanup();
      setCallStatus('idle');
    }, RING_TIMEOUT_MS);

    const presenceSocket = getCallPresenceSocket();
    let socket: Socket;
    if (presenceSocket?.connected) {
      keepPresenceSocketRef.current = true;
      socket = presenceSocket;
    } else {
      detachCallSocket(socketRef.current);
      socket = connectCallSocket();
    }
    socketRef.current = socket;
    signalingRoomRef.current = rid;
    signalingUserRef.current = uid;

    const onConnectError = (err: Error) => {
      console.error('WebRTC socket connect_error', err);
      toast.error('Could not connect for video call. Check your network and try again.');
      clearRingTimer();
      setCallStatus('idle');
      detachCallSocket(socket);
    };

    const runCallerSetup = async () => {
      pendingAcceptRef.current = false;
      pendingAnswerRef.current = null;
      iceQueueRef.current = [];

      joinSignalingRooms(socket, rid, uid);
      wireSignalingReconnect(socket, rid, uid);

      const sendOffer = async () => {
        if (!pcRef.current || !socket.connected) {
          pendingAcceptRef.current = true;
          return;
        }
        const pc = pcRef.current;
        pendingAcceptRef.current = false;
        armConnectTimer();
        try {
          if (pc.signalingState === 'have-local-offer' && pc.localDescription && !pc.remoteDescription) {
            socket.emit('webrtc-offer', { roomId: rid, toUserId: peer, offer: pc.localDescription });
            return;
          }
          if (pc.signalingState !== 'stable') return;
          const offer = await pc.createOffer({ iceRestart: iceRestartAttemptedRef.current });
          await pc.setLocalDescription(offer);
          socket.emit('webrtc-offer', { roomId: rid, toUserId: peer, offer });
        } catch (e) {
          console.error('Failed to create offer', e);
          toast.error('Could not start video call');
          endCall();
        }
      };
      sendOfferRef.current = sendOffer;

      const applyAnswer = async (answer: RTCSessionDescriptionInit) => {
        if (!pcRef.current) {
          pendingAnswerRef.current = answer;
          return;
        }
        const pc = pcRef.current;
        if (pc.signalingState === 'stable' && pc.remoteDescription?.type === 'answer') {
          pendingAnswerRef.current = null;
          return;
        }
        pendingAnswerRef.current = null;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          await flushIceQueue(pc, iceQueueRef.current);
        } catch (e) {
          console.error('Failed to set remote description', e);
          toast.error('Could not complete video connection');
          endCall();
        }
      };

      detachSignalingHandlersRef.current?.();
      const attached = attachCallSocketHandlers(socket, {
        roomId: rid,
        userId: uid,
        peerUserId: peer,
        pcRef,
        setCallStatus,
        setRemoteStream,
        cleanup,
        endCall,
        role: 'caller',
        iceQueueRef,
        pendingAnswerRef,
        pendingAcceptRef,
        sendOffer,
        applyAnswer,
        onConnected: markConnected,
        clearRingTimer,
      });
      detachSignalingHandlersRef.current = attached.detach;

      const onCallUnavailable = (data: { calleeId?: string; roomId?: string; reason?: string }) => {
        if (data?.roomId && data.roomId !== rid) return;
        if (data?.calleeId && String(data.calleeId) !== String(peer)) return;
        toast.error('Contact is offline — ask them to open Qwertymates and try again');
        clearRingTimer();
        if (socket.connected) {
          socket.emit('call-cancel', { roomId: rid, callerId: uid, calleeId: peer });
        }
        detachCallSocket(socket);
        cleanup();
        setCallStatus('idle');
      };

      socket.on('call-unavailable', onCallUnavailable);
      const prevDetach = detachSignalingHandlersRef.current;
      detachSignalingHandlersRef.current = () => {
        socket.off('call-unavailable', onCallUnavailable);
        prevDetach?.();
      };

      socket.emit('call-request', {
        roomId: rid,
        callerId: uid,
        callerName: userName,
        calleeId: peer,
        audioOnly: voiceOnly,
      });

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: !voiceOnly, audio: true });
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const pc = await createPeerConnection(peer, rid);
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        if (pendingAcceptRef.current) await sendOffer();
        if (pendingAnswerRef.current) await applyAnswer(pendingAnswerRef.current);
      } catch (err) {
        console.error('Failed to get media', err);
        toast.error(
          voiceOnly
            ? 'Microphone permission is required for voice calls'
            : 'Camera/microphone permission is required for video calls'
        );
        clearRingTimer();
        setCallStatus('idle');
        detachCallSocket(socket);
      }
    };

    socket.off('connect_error', onConnectError);
    socket.on('connect_error', onConnectError);

    if (socket.connected) {
      void runCallerSetup();
    } else {
      socket.once('connect', () => {
        void runCallerSetup();
      });
      if (!socket.connected) socket.connect();
    }
  }, [
    roomId,
    userId,
    userName,
    peerUserId,
    defaultAudioOnly,
    createPeerConnection,
    cleanup,
    endCall,
    connectCallSocket,
    detachCallSocket,
    clearRingTimer,
    armConnectTimer,
    markConnected,
    joinSignalingRooms,
    wireSignalingReconnect,
  ]);

  const acceptCall = useCallback(
    async (
      override?: { callerId: string; roomId?: string; callerName?: string; audioOnly?: boolean },
      opts?: { existingSocket?: Socket | null }
    ) => {
      const effectiveRoomId = String(override?.roomId || incomingCallRoomRef.current || roomId || '');
      const callerId = String(override?.callerId || incomingCaller?.callerId || '');
      const uid = String(userId || '');
      if (!callerId || !effectiveRoomId || !uid) {
        toast.error('Could not join call — sign in again or refresh the page');
        return;
      }

      if (override?.audioOnly !== undefined) {
        incomingAudioOnlyRef.current = override.audioOnly;
      }
      const voiceOnly = incomingAudioOnlyRef.current;
      setActiveAudioOnly(voiceOnly);
      activePeerRef.current = callerId;

      setCallStatus('connecting');
      armConnectTimer();
      setIncomingCaller(null);
      incomingCallRoomRef.current = null;
      clearRingTimer();

      const reuseSocket = opts?.existingSocket?.connected ? opts.existingSocket : null;
      let socket: Socket;
      if (reuseSocket) {
        keepPresenceSocketRef.current = true;
        socket = reuseSocket;
        socketRef.current = socket;
      } else {
        detachCallSocket(socketRef.current);
        socket = connectCallSocket();
      }

      const runCalleeAccept = async () => {
        pendingOfferRef.current = null;
        iceQueueRef.current = [];

        joinSignalingRooms(socket, effectiveRoomId, uid);
        wireSignalingReconnect(socket, effectiveRoomId, uid);
        signalingRoomRef.current = effectiveRoomId;
        signalingUserRef.current = uid;

        detachSignalingHandlersRef.current?.();
        const attached = attachCallSocketHandlers(socket, {
          roomId: effectiveRoomId,
          userId: uid,
          peerUserId: callerId,
          pcRef,
          setCallStatus,
          setRemoteStream,
          cleanup,
          endCall,
          role: 'callee',
          calleeCallerId: callerId,
          signalingRoomId: effectiveRoomId,
          pendingOfferRef,
          iceQueueRef,
          onConnected: markConnected,
        });
        detachSignalingHandlersRef.current = attached.detach;
        const handleCalleeOffer = attached.handleCalleeOffer;

        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: !voiceOnly, audio: true });
          setLocalStream(stream);
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;

          const pc = await createPeerConnection(callerId, effectiveRoomId);
          pcRef.current = pc;
          stream.getTracks().forEach((t) => pc.addTrack(t, stream));

          if (pendingOfferRef.current && handleCalleeOffer) {
            await handleCalleeOffer(pendingOfferRef.current);
            pendingOfferRef.current = null;
          }

          socket.emit('call-accept', {
            roomId: effectiveRoomId,
            calleeId: uid,
            calleeName: userName,
            callerId,
          });
        } catch (err) {
          console.error('Failed to get media', err);
          toast.error(voiceOnly ? 'Microphone permission is required' : 'Camera/microphone permission is required');
          setCallStatus('idle');
          detachCallSocket(socket);
        }
      };

      socket.off('connect_error');
      socket.on('connect_error', (err) => {
        console.error('WebRTC socket connect_error', err);
        toast.error('Could not connect for video call');
        setCallStatus('idle');
        detachCallSocket(socket);
      });

      if (socket.connected) {
        void runCalleeAccept();
      } else {
        socket.once('connect', () => {
          void runCalleeAccept();
        });
        if (!socket.connected) socket.connect();
      }
    },
    [
      roomId,
      userId,
      userName,
      incomingCaller,
      peerUserId,
      createPeerConnection,
      cleanup,
      endCall,
      connectCallSocket,
      clearRingTimer,
      armConnectTimer,
      markConnected,
      detachCallSocket,
      joinSignalingRooms,
      wireSignalingReconnect,
    ]
  );

  const rejectCall = useCallback(() => {
    const socket = socketRef.current;
    const callerForReject = incomingCaller?.callerId;
    const rjid = incomingCallRoomRef.current || roomId;
    if (socket?.connected && rjid) {
      socket.emit('call-reject', {
        roomId: rjid,
        calleeId: String(userId),
        callerId: callerForReject,
      });
      detachCallSocket(socket);
    }
    incomingCallRoomRef.current = null;
    setCallStatus('idle');
    setIncomingCaller(null);
  }, [roomId, userId, incomingCaller?.callerId, detachCallSocket]);

  const cancelCall = useCallback(() => {
    clearRingTimer();
    const socket = socketRef.current;
    const rid = signalingRoomRef.current || roomId;
    const peer = activePeerRef.current || String(peerUserId);
    if (socket?.connected && rid) {
      socket.emit('call-cancel', {
        roomId: rid,
        callerId: String(userId),
        calleeId: peer,
      });
      detachCallSocket(socket);
    }
    cleanup();
    setCallStatus('idle');
  }, [roomId, userId, peerUserId, cleanup, clearRingTimer, detachCallSocket]);

  /** Join call room for incoming when a thread is open (global presence handles ring). */
  const joinRoomForIncoming = useCallback(() => {
    if (!userId || !roomId) return;
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit('join-call-room', { roomId, userId: String(userId) });
    }
  }, [roomId, userId]);

  const leaveRoomForIncoming = useCallback(() => {
    /* Active calls use dedicated socket; idle cleanup handled on unmount */
  }, []);

  const showIncomingFromServer = useCallback(
    (data: { callerId: string; callerName?: string; roomId?: string; audioOnly?: boolean }) => {
      if (data.roomId) incomingCallRoomRef.current = data.roomId;
      incomingAudioOnlyRef.current = !!data.audioOnly;
      setActiveAudioOnly(!!data.audioOnly);
      setIncomingCaller({ callerId: String(data.callerId), callerName: data.callerName });
      setCallStatus('incoming');
    },
    []
  );

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setIsMuted(next);
  }, [localStream, isMuted]);

  const toggleVideo = useCallback(() => {
    const next = !isVideoOff;
    localStream?.getVideoTracks().forEach((t) => {
      t.enabled = !next;
    });
    setIsVideoOff(next);
  }, [localStream, isVideoOff]);

  useEffect(() => {
    return () => {
      cleanup();
      detachCallSocket(socketRef.current);
      socketRef.current = null;
    };
  }, [cleanup, detachCallSocket]);

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
    acceptCall,
    rejectCall,
    cancelCall,
    endCall,
    joinRoomForIncoming,
    leaveRoomForIncoming,
    showIncomingFromServer,
    toggleMute,
    toggleVideo,
    activeAudioOnly,
  };
}
