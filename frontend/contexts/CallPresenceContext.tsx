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
import { morongwaAPI } from '@/lib/api';

export type IncomingMeetingInvite = {
  meetingId: string;
  title: string;
  roomId: string;
  hostUserId: string;
  hostName: string;
  joinUrl: string;
};

export type IncomingCallPayload = {
  callerId: string;
  callerName?: string;
  roomId: string;
  audioOnly?: boolean;
  /** Caller's signaling socket id from call-request (direct delivery). */
  callerSocketId?: string;
};

type CallPresenceContextValue = {
  incomingCall: IncomingCallPayload | null;
  clearIncomingCall: () => void;
  getPresenceSocket: () => Socket | null;
};

const CallPresenceContext = createContext<CallPresenceContextValue | undefined>(undefined);

function IncomingMeetingInviteModal({
  invite,
  onJoin,
  onDismiss,
}: {
  invite: IncomingMeetingInvite;
  onJoin: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="rounded-2xl bg-white shadow-xl p-8 max-w-sm w-full text-center"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-20 h-20 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-4">
        <Video className="h-10 w-10 text-violet-600" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-1">Meeting invite</h3>
      <p className="text-slate-600 mb-1">{invite.hostName} invited you to</p>
      <p className="text-slate-900 font-medium mb-4">{invite.title || 'a meeting'}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onDismiss}
          className="flex-1 py-3 rounded-xl bg-slate-200 text-slate-800 font-semibold hover:bg-slate-300"
        >
          Later
        </button>
        <button
          type="button"
          onClick={onJoin}
          className="flex-1 py-3 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700"
        >
          Join
        </button>
      </div>
    </div>
  );
}

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
  const { acceptIncomingCall, callStatus, webrtc, joinMeetingCall } = useWebRTCCall();
  const socketRef = useRef<Socket | null>(null);
  const incomingCallRef = useRef<IncomingCallPayload | null>(null);
  const callStatusRef = useRef(callStatus);
  const [incomingCall, setIncomingCall] = useState<IncomingCallPayload | null>(null);
  const [incomingMeetingInvite, setIncomingMeetingInvite] = useState<IncomingMeetingInvite | null>(null);
  const [joiningMeeting, setJoiningMeeting] = useState(false);

  const userId = user?._id || user?.id ? String(user._id || user.id) : '';

  incomingCallRef.current = incomingCall;
  callStatusRef.current = callStatus;

  useUnlockCallAudioOnGesture();
  useIncomingCallRingtone(!!incomingCall);

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
      reconnectionAttempts: 25,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });
    socketRef.current = socket;
    registerCallPresenceSocket(socket);

    const joinPresence = () => {
      socket.emit('join-user-presence', { userId });
    };

    const onCallRequest = (data: {
      callerId?: string;
      callerName?: string;
      roomId?: string;
      audioOnly?: boolean;
      socketId?: string;
    }) => {
      if (!data?.callerId || !data?.roomId) return;
      if (callStatusRef.current === 'connected') return;

      const callerId = String(data.callerId);
      const payload: IncomingCallPayload = {
        callerId,
        callerName: data.callerName,
        roomId: String(data.roomId),
        audioOnly: !!data.audioOnly,
        callerSocketId: data.socketId ? String(data.socketId) : undefined,
      };
      setIncomingCall(payload);
      toast(`Incoming ${payload.audioOnly ? 'voice' : 'video'} call from ${payload.callerName || 'a user'}`, {
        icon: payload.audioOnly ? '📞' : '📹',
        duration: 8000,
      });
    };

    const onCallCancel = () => {
      setIncomingCall(null);
    };

    const onMeetingInvite = (data: IncomingMeetingInvite) => {
      if (!data?.meetingId || !data?.roomId) return;
      if (callStatusRef.current === 'connected') return;
      setIncomingMeetingInvite({
        meetingId: String(data.meetingId),
        title: String(data.title || 'Meeting'),
        roomId: String(data.roomId),
        hostUserId: String(data.hostUserId || ''),
        hostName: String(data.hostName || 'Someone'),
        joinUrl: String(data.joinUrl || ''),
      });
      toast(`${data.hostName || 'Someone'} invited you to a meeting`, { icon: '📹', duration: 8000 });
    };

    socket.on('connect', joinPresence);
    socket.io.on('reconnect', joinPresence);
    socket.on('call-request', onCallRequest);
    socket.on('call-cancel', onCallCancel);
    socket.on('meeting-invite', onMeetingInvite);

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
      socket.off('meeting-invite', onMeetingInvite);
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
        ...(call.callerSocketId ? { callerSocketId: call.callerSocketId } : {}),
      });
    }
    setIncomingCall(null);
  }, [userId]);

  const acceptIncoming = useCallback(() => {
    const call = incomingCallRef.current;
    if (!call) return;
    if (callStatusRef.current === 'calling' || callStatusRef.current === 'connecting') {
      webrtc.endCall();
    }
    setIncomingCall(null);
    const accepted = acceptIncomingCall(call, socketRef.current);
    if (!accepted) {
      toast.error('Could not accept call — refresh the page and try again');
    }
  }, [acceptIncomingCall, webrtc]);

  useEffect(() => {
    if (callStatus === 'connected') {
      setIncomingCall(null);
      setIncomingMeetingInvite(null);
    }
  }, [callStatus]);

  const acceptMeetingInvite = useCallback(async () => {
    const invite = incomingMeetingInvite;
    if (!invite || joiningMeeting) return;
    if (callStatusRef.current === 'connected') {
      toast.error('End your current call before joining a meeting');
      return;
    }
    setJoiningMeeting(true);
    try {
      const res = await morongwaAPI.joinMeeting({ meetingId: invite.meetingId });
      const m = res.data.data;
      const hostId = String(m.hostUserId || invite.hostUserId || '');
      const preferredPeer = hostId && hostId !== userId ? hostId : '';
      const joined = joinMeetingCall({
        roomId: m.roomId,
        meetingId: m.meetingId,
        peerUserId: preferredPeer,
        peerUserName: m.hostName || invite.hostName,
        meetingMode: true,
        meetingTitle: m.title || invite.title,
        audioOnly: false,
      });
      if (joined) {
        setIncomingMeetingInvite(null);
        toast.success(`Joined ${m.title || invite.title}`);
      } else {
        toast.error('Could not join meeting');
      }
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Could not join meeting');
    } finally {
      setJoiningMeeting(false);
    }
  }, [incomingMeetingInvite, joiningMeeting, joinMeetingCall, userId]);

  const getPresenceSocket = useCallback(() => socketRef.current, []);

  const showIncomingModal = !!incomingCall;
  const showMeetingInviteModal = !!incomingMeetingInvite && !showIncomingModal;

  return (
    <CallPresenceContext.Provider value={{ incomingCall, clearIncomingCall, getPresenceSocket }}>
      {children}
      {showIncomingModal ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
          <IncomingCallGlobalModal
            callerName={incomingCall.callerName}
            audioOnly={incomingCall.audioOnly}
            onAccept={acceptIncoming}
            onDecline={declineIncoming}
          />
        </div>
      ) : null}
      {showMeetingInviteModal && incomingMeetingInvite ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
          <IncomingMeetingInviteModal
            invite={incomingMeetingInvite}
            onJoin={() => void acceptMeetingInvite()}
            onDismiss={() => setIncomingMeetingInvite(null)}
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
