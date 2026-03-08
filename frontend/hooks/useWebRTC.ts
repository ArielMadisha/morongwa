'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '@/lib/api';

export type CallStatus = 'idle' | 'calling' | 'incoming' | 'connecting' | 'connected' | 'ended' | 'rejected';

export interface UseWebRTCOptions {
  roomId: string;
  userId: string;
  userName?: string;
  peerUserId: string;
  peerUserName?: string;
  onCallEnded?: () => void;
}

export function useWebRTC({
  roomId,
  userId,
  userName,
  peerUserId,
  peerUserName,
  onCallEnded,
}: UseWebRTCOptions) {
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [incomingCaller, setIncomingCaller] = useState<{ callerId: string; callerName?: string } | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }
    setRemoteStream(null);
    if (socketRef.current) {
      socketRef.current.emit('leave-call-room');
    }
  }, [localStream]);

  const endCall = useCallback(() => {
    cleanup();
    setCallStatus('idle');
    setIncomingCaller(null);
    onCallEnded?.();
  }, [cleanup, onCallEnded]);

  const createPeerConnection = useCallback((targetUserId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef.current) {
        socketRef.current.emit('webrtc-ice-candidate', {
          roomId,
          toUserId: targetUserId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (e) => {
      if (e.streams[0]) setRemoteStream(e.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        endCall();
      }
    };

    return pc;
  }, [roomId, peerUserId, endCall]);

  const startCall = useCallback(async () => {
    if (!roomId || !userId || !peerUserId) return;
    setCallStatus('calling');

    const socket = io(`${SOCKET_URL}/webrtc`, { autoConnect: true });
    socketRef.current = socket;

    socket.on('connect', async () => {
      socket.emit('join-call-room', { roomId, userId });
      socket.emit('call-request', { roomId, callerId: userId, callerName: userName });

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const pc = createPeerConnection(peerUserId);
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      } catch (err) {
        console.error('Failed to get media', err);
        setCallStatus('idle');
        socket.disconnect();
      }
    });

    socket.on('call-reject', () => {
      setCallStatus('rejected');
      cleanup();
      socket.disconnect();
    });

    socket.on('call-accept', async (data: { calleeId: string }) => {
      setCallStatus('connecting');
      if (!pcRef.current) return;
      try {
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        socket.emit('webrtc-offer', { roomId, toUserId: data.calleeId, offer });
      } catch (e) {
        console.error('Failed to create offer', e);
      }
    });

    socket.on('webrtc-answer', async (data: { fromUserId: string; answer: RTCSessionDescriptionInit }) => {
      if (data.fromUserId !== peerUserId || !pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        setCallStatus('connected');
      } catch (e) {
        console.error('Failed to set remote description', e);
      }
    });

    socket.on('webrtc-ice-candidate', async (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
      if (data.fromUserId !== peerUserId || !pcRef.current) return;
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.error('Failed to add ICE candidate', e);
      }
    });

    socket.on('peer-left', () => {
      endCall();
    });
  }, [roomId, userId, userName, peerUserId, createPeerConnection, cleanup, endCall]);

  const acceptCall = useCallback(async () => {
    if (!incomingCaller || !roomId || !userId) return;
    const callerId = incomingCaller.callerId;
    setCallStatus('connecting');
    setIncomingCaller(null);

    socketRef.current?.disconnect();
    const socket = io(`${SOCKET_URL}/webrtc`, { autoConnect: true });
    socketRef.current = socket;

    socket.on('connect', async () => {
      socket.emit('join-call-room', { roomId, userId });
      socket.emit('call-accept', { roomId, calleeId: userId, calleeName: userName });

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const pc = createPeerConnection(callerId);
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      } catch (err) {
        console.error('Failed to get media', err);
        setCallStatus('idle');
        socket.disconnect();
      }
    });

    socket.on('webrtc-offer', async (data: { fromUserId: string; offer: RTCSessionDescriptionInit }) => {
      if (data.fromUserId !== callerId || !pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        socket.emit('webrtc-answer', { roomId, toUserId: callerId, answer });
        setCallStatus('connected');
      } catch (e) {
        console.error('Failed to handle offer', e);
      }
    });

    socket.on('webrtc-ice-candidate', async (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
      if (data.fromUserId !== callerId || !pcRef.current) return;
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.error('Failed to add ICE candidate', e);
      }
    });

    socket.on('peer-left', () => {
      endCall();
    });
  }, [roomId, userId, userName, incomingCaller, createPeerConnection, endCall]);

  const rejectCall = useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      socket.emit('call-reject', { roomId, calleeId: userId });
      socket.disconnect();
    }
    setCallStatus('idle');
    setIncomingCaller(null);
  }, [roomId, userId]);

  const cancelCall = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('call-cancel', { roomId, callerId: userId });
      socketRef.current.disconnect();
    }
    cleanup();
    setCallStatus('idle');
  }, [roomId, userId, cleanup]);

  const joinRoomForIncoming = useCallback(() => {
    if (!roomId || !userId) return;
    socketRef.current?.disconnect();
    const socket = io(`${SOCKET_URL}/webrtc`, { autoConnect: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-call-room', { roomId, userId });
    });

    socket.on('call-request', (data: { callerId: string; callerName?: string }) => {
      setIncomingCaller({ callerId: data.callerId, callerName: data.callerName });
      setCallStatus('incoming');
    });

    socket.on('call-cancel', () => {
      setIncomingCaller(null);
      setCallStatus('idle');
    });
  }, [roomId, userId]);

  const leaveRoomForIncoming = useCallback(() => {
    if (socketRef.current && callStatus === 'idle') {
      socketRef.current.emit('leave-call-room');
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, [callStatus]);

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
      socketRef.current?.disconnect();
    };
  }, [cleanup]);

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
    toggleMute,
    toggleVideo,
  };
}
