'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { Video, Phone, PhoneOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useWebRTCCall } from '@/contexts/WebRTCCallContext';
import { getWebrtcNamespaceUrl } from '@/lib/socketUrl';
import { getSocketAuth } from '@/lib/socketAuth';
import { registerCallPresenceSocket } from '@/lib/callPresenceSocket';
import { useIncomingCallRingtone, useUnlockCallAudioOnGesture } from '@/hooks/useIncomingCallRingtone';

export type IncomingCallPayload = {
  callerId: string;
  callerName?: string;
  roomId: string;
  audioOnly?: boolean;
};

type CallPresenceContextValue = {
  incomingCall: IncomingCallPayload | null;
  clearIncomingCall: () => void;
  getPresenceSocket: () => Socket | null;
};

const CallPresenceContext = createContext<CallPresenceContextValue | undefined>(undefined);

function IncomingCallGlobalModal({
  callerName,
  audioOnly,
  onAccept,
  onDecline,
}: {
  callerName?: string;
  audioOnly?: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div
      className="rounded-2xl bg-white shadow-xl p-8 max-w-sm w-full text-center"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-20 h-20 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4 animate-pulse">
        {audioOnly ? <Phone className="h-10 w-10 text-sky-600" /> : <Video className="h-10 w-10 text-sky-600" />}
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-1">
        Incoming {audioOnly ? 'voice' : 'video'} call
      </h3>
      <p className="text-slate-600 mb-2">{callerName || 'Someone'} is calling you</p>
      <p className="text-xs text-slate-500 mb-6">Your phone should ring. If silent, tap the screen once then ask them to call again.</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDecline();
          }}
          className="flex-1 py-3 rounded-xl bg-rose-500 text-white font-semibold hover:bg-rose-600 flex items-center justify-center gap-2"
        >
          <PhoneOff className="h-5 w-5" />
          Decline
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAccept();
          }}
          className="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 flex items-center justify-center gap-2"
        >
          {audioOnly ? <Phone className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          Accept
        </button>
      </div>
    </div>
  );
}

export function CallPresenceProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const { acceptIncomingCall, callStatus, activeSession, webrtc } = useWebRTCCall();
  const socketRef = useRef<Socket | null>(null);
  const incomingCallRef = useRef<IncomingCallPayload | null>(null);
  const callStatusRef = useRef(callStatus);
  const activeSessionRef = useRef(activeSession);
  const [incomingCall, setIncomingCall] = useState<IncomingCallPayload | null>(null);

  const userId = user?._id || user?.id ? String(user._id || user.id) : '';

  incomingCallRef.current = incomingCall;
  callStatusRef.current = callStatus;
  activeSessionRef.current = activeSession;

  useUnlockCallAudioOnGesture();
  useIncomingCallRingtone(!!incomingCall && callStatus === 'idle');

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setIncomingCall(null);
      return;
    }

    const socket = io(getWebrtcNamespaceUrl(), {
      auth: getSocketAuth(),
      autoConnect: true,
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: 10,
      timeout: 20000,
    });
    socketRef.current = socket;
    registerCallPresenceSocket(socket);

    const joinPresence = () => {
      socket.emit('join-user-presence', { userId });
    };

    const onCallRequest = (data: { callerId?: string; callerName?: string; roomId?: string; audioOnly?: boolean }) => {
      if (!data?.callerId || !data?.roomId) return;
      const callerId = String(data.callerId);
      const status = callStatusRef.current;
      const outgoingPeer = activeSessionRef.current?.peerUserId;

      if (status === 'calling' && outgoingPeer && String(outgoingPeer) === callerId) {
        webrtc.cancelCall();
      } else if (status !== 'idle' && status !== 'incoming') {
        return;
      }

      const payload: IncomingCallPayload = {
        callerId,
        callerName: data.callerName,
        roomId: String(data.roomId),
        audioOnly: !!data.audioOnly,
      };
      setIncomingCall(payload);
      toast(`Incoming ${payload.audioOnly ? 'voice' : 'video'} call from ${payload.callerName || 'a user'}`, {
        icon: payload.audioOnly ? '📞' : '📹',
      });
    };

    const onCallCancel = () => {
      setIncomingCall(null);
    };

    socket.on('connect', joinPresence);
    socket.io.on('reconnect', joinPresence);
    socket.on('call-request', onCallRequest);
    socket.on('call-cancel', onCallCancel);

    const onVisible = () => {
      if (document.visibilityState === 'visible') joinPresence();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', joinPresence);

    if (socket.connected) joinPresence();

    return () => {
      socket.off('connect', joinPresence);
      socket.io.off('reconnect', joinPresence);
      socket.off('call-request', onCallRequest);
      socket.off('call-cancel', onCallCancel);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', joinPresence);
      registerCallPresenceSocket(null);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, userId]);

  const clearIncomingCall = useCallback(() => setIncomingCall(null), []);

  const declineIncoming = useCallback(() => {
    const call = incomingCallRef.current;
    if (call && socketRef.current?.connected) {
      socketRef.current.emit('call-reject', {
        roomId: call.roomId,
        calleeId: userId,
        callerId: call.callerId,
      });
    }
    setIncomingCall(null);
  }, [userId]);

  const acceptIncoming = useCallback(() => {
    const call = incomingCallRef.current;
    if (!call) return;
    const accepted = acceptIncomingCall(call, socketRef.current);
    if (!accepted) {
      toast.error('Could not accept call — refresh the page and try again');
    }
  }, [acceptIncomingCall]);

  useEffect(() => {
    if (callStatus === 'connecting' || callStatus === 'connected' || callStatus === 'calling') {
      setIncomingCall(null);
    }
  }, [callStatus]);

  const getPresenceSocket = useCallback(() => socketRef.current, []);

  const showIncomingModal = !!incomingCall && callStatus === 'idle';

  return (
    <CallPresenceContext.Provider value={{ incomingCall, clearIncomingCall, getPresenceSocket }}>
      {children}
      {showIncomingModal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <IncomingCallGlobalModal
            callerName={incomingCall.callerName}
            audioOnly={incomingCall.audioOnly}
            onAccept={acceptIncoming}
            onDecline={declineIncoming}
          />
        </div>
      ) : null}
    </CallPresenceContext.Provider>
  );
}

export function useCallPresence() {
  const ctx = useContext(CallPresenceContext);
  if (!ctx) throw new Error('useCallPresence must be used within CallPresenceProvider');
  return ctx;
}
