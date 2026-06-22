'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useWebRTC, type CallStatus } from '@/hooks/useWebRTC';
import { VideoCallView } from '@/components/VideoCallView';
import { getCallPresenceSocket } from '@/lib/callPresenceSocket';
import type { Socket } from 'socket.io-client';

export type ActiveCallSession = {
  roomId: string;
  peerUserId: string;
  peerUserName?: string;
  audioOnly?: boolean;
};

type PendingAccept = {
  callerId: string;
  roomId: string;
  callerName?: string;
  audioOnly?: boolean;
};

type WebRTCCallContextValue = {
  callStatus: CallStatus;
  activeSession: ActiveCallSession | null;
  beginSession: (session: ActiveCallSession) => void;
  clearSession: () => void;
  webrtc: ReturnType<typeof useWebRTC>;
  acceptIncomingCall: (payload: PendingAccept, presenceSocket?: Socket | null) => boolean;
  startOutgoingCall: (session: ActiveCallSession) => boolean;
};

const WebRTCCallContext = createContext<WebRTCCallContextValue | null>(null);

function canStartNewCall(status: CallStatus): boolean {
  return status === 'idle' || status === 'incoming' || status === 'ended' || status === 'rejected';
}

export function WebRTCCallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const uid = user?._id || user?.id ? String(user._id || user.id) : '';
  const [session, setSession] = useState<ActiveCallSession | null>(null);

  const webrtc = useWebRTC({
    roomId: session?.roomId ?? '',
    userId: uid,
    userName: user?.name,
    peerUserId: session?.peerUserId ?? '',
    peerUserName: session?.peerUserName,
    audioOnly: session?.audioOnly ?? false,
    onCallEnded: () => {
      setSession(null);
    },
  });

  const beginSession = useCallback((next: ActiveCallSession) => {
    setSession(next);
  }, []);

  const clearSession = useCallback(() => {
    setSession(null);
  }, []);

  const acceptIncomingCall = useCallback(
    (payload: PendingAccept, presenceSocket?: Socket | null): boolean => {
      if (!uid) {
        toast.error('Sign in to accept calls');
        return false;
      }
      if (!canStartNewCall(webrtc.callStatus)) {
        toast.error('End your current call before accepting another');
        return false;
      }
      if (!payload.callerId || !payload.roomId) {
        toast.error('Invalid incoming call');
        return false;
      }

      // Accept immediately with explicit overrides — do not wait for setSession re-render.
      const sharedSocket = presenceSocket?.connected ? presenceSocket : getCallPresenceSocket();
      void webrtc.acceptCall(
        {
          callerId: payload.callerId,
          roomId: payload.roomId,
          callerName: payload.callerName,
          audioOnly: payload.audioOnly,
        },
        { existingSocket: sharedSocket }
      );

      setSession({
        roomId: payload.roomId,
        peerUserId: payload.callerId,
        peerUserName: payload.callerName,
        audioOnly: payload.audioOnly,
      });
      return true;
    },
    [uid, webrtc.callStatus, webrtc.acceptCall]
  );

  const startOutgoingCall = useCallback(
    (next: ActiveCallSession): boolean => {
      if (!canStartNewCall(webrtc.callStatus)) {
        toast.error('You are already in a call');
        return false;
      }
      if (!next.roomId || !next.peerUserId) {
        toast.error('Select a contact before starting a call');
        return false;
      }
      setSession(next);
      void webrtc.startCall({
        audioOnly: next.audioOnly,
        roomId: next.roomId,
        peerUserId: next.peerUserId,
      });
      return true;
    },
    [webrtc.callStatus, webrtc.startCall]
  );

  useEffect(() => {
    if (!uid) {
      clearSession();
      webrtc.endCall();
    }
  }, [uid, clearSession, webrtc.endCall]);

  const peerLabel = session?.peerUserName || webrtc.incomingCaller?.callerName;
  const showCallUi = webrtc.callStatus !== 'idle';

  return (
    <WebRTCCallContext.Provider
      value={{
        callStatus: webrtc.callStatus,
        activeSession: session,
        beginSession,
        clearSession,
        webrtc,
        acceptIncomingCall,
        startOutgoingCall,
      }}
    >
      {children}
      {showCallUi ? (
        <VideoCallView
            callStatus={webrtc.callStatus}
            localVideoRef={webrtc.localVideoRef}
            remoteVideoRef={webrtc.remoteVideoRef}
            localStream={webrtc.localStream}
            remoteStream={webrtc.remoteStream}
            peerName={peerLabel}
            incomingCaller={webrtc.incomingCaller}
            isMuted={webrtc.isMuted}
            isVideoOff={webrtc.isVideoOff}
            onStartCall={() =>
              webrtc.startCall({
                audioOnly: webrtc.activeAudioOnly,
                roomId: session?.roomId,
                peerUserId: session?.peerUserId,
              })
            }
            onAcceptCall={() => {
              const callerId = webrtc.incomingCaller?.callerId;
              if (!callerId) return;
              void webrtc.acceptCall(
                {
                  callerId,
                  callerName: webrtc.incomingCaller?.callerName,
                  audioOnly: webrtc.activeAudioOnly,
                },
                { existingSocket: getCallPresenceSocket() }
              );
            }}
            onRejectCall={webrtc.rejectCall}
            onCancelCall={webrtc.cancelCall}
            onEndCall={webrtc.endCall}
            onToggleMute={webrtc.toggleMute}
            onToggleVideo={webrtc.toggleVideo}
            audioOnly={webrtc.activeAudioOnly}
          />
      ) : null}
    </WebRTCCallContext.Provider>
  );
}

export function useWebRTCCall() {
  const ctx = useContext(WebRTCCallContext);
  if (!ctx) throw new Error('useWebRTCCall must be used within WebRTCCallProvider');
  return ctx;
}
