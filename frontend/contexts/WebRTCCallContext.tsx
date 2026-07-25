'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useLiveKitCall } from '@/hooks/useLiveKitCall';
import type { CallStatus } from '@/hooks/useWebRTC';
import { LiveKitCallView } from '@/components/LiveKitCallView';
import { getCallPresenceSocket } from '@/lib/callPresenceSocket';
import type { Socket } from 'socket.io-client';

export type ActiveCallSession = {
  roomId: string;
  peerUserId: string;
  peerUserName?: string;
  audioOnly?: boolean;
  /** Morongwa Meet — join room lobby without ringing a peer. */
  meetingMode?: boolean;
  meetingTitle?: string;
  meetingId?: string;
};

type PendingAccept = {
  callerId: string;
  roomId: string;
  callerName?: string;
  audioOnly?: boolean;
  callerSocketId?: string;
};

type WebRTCCallContextValue = {
  callStatus: CallStatus;
  activeSession: ActiveCallSession | null;
  beginSession: (session: ActiveCallSession) => void;
  clearSession: () => void;
  /** LiveKit-backed call controls (same surface as legacy useWebRTC). */
  webrtc: ReturnType<typeof useLiveKitCall>;
  acceptIncomingCall: (payload: PendingAccept, presenceSocket?: Socket | null) => boolean;
  startOutgoingCall: (session: ActiveCallSession) => boolean;
  joinMeetingCall: (session: ActiveCallSession) => boolean;
};

const WebRTCCallContext = createContext<WebRTCCallContextValue | null>(null);

export function WebRTCCallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const uid = user?._id || user?.id ? String(user._id || user.id) : '';
  const [session, setSession] = useState<ActiveCallSession | null>(null);

  const webrtc = useLiveKitCall({
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
      if (webrtc.callStatus === 'connected') {
        toast.error('End your current call before accepting another');
        return false;
      }
      if (!payload.callerId || !payload.roomId) {
        toast.error('Invalid incoming call');
        return false;
      }

      // Attach session first so roomId/peer props match the accept — avoid mid-connect
      // prop churn that previously tore down LiveKit ("Client initiated disconnect").
      setSession({
        roomId: payload.roomId,
        peerUserId: payload.callerId,
        peerUserName: payload.callerName,
        audioOnly: payload.audioOnly,
      });

      const sharedSocket = presenceSocket ?? getCallPresenceSocket();
      void webrtc.acceptCall(
        {
          callerId: payload.callerId,
          roomId: payload.roomId,
          callerName: payload.callerName,
          audioOnly: payload.audioOnly,
          callerSocketId: payload.callerSocketId,
        },
        { existingSocket: sharedSocket }
      );
      return true;
    },
    [uid, webrtc.callStatus, webrtc.acceptCall]
  );

  const startOutgoingCall = useCallback(
    (next: ActiveCallSession): boolean => {
      if (webrtc.callStatus === 'connected') {
        toast.error('You are already in a call');
        return false;
      }
      // Do not call a shared helper here — prior builds threw ReferenceError when the
      // helper name was referenced without a resolved binding in the client chunk.
      if (webrtc.callStatus === 'calling' || webrtc.callStatus === 'connecting') {
        webrtc.endCall();
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
    [webrtc.callStatus, webrtc.startCall, webrtc.endCall]
  );

  const joinMeetingCall = useCallback(
    (next: ActiveCallSession): boolean => {
      if (webrtc.callStatus === 'connected') {
        toast.error('You are already in a call');
        return false;
      }
      if (webrtc.callStatus === 'calling' || webrtc.callStatus === 'connecting') {
        webrtc.endCall();
      }
      if (!next.roomId) {
        toast.error('Meeting room is not available');
        return false;
      }
      setSession({ ...next, meetingMode: true });
      void webrtc.joinMeetingRoom({
        roomId: next.roomId,
        preferredPeerId: next.peerUserId,
        title: next.meetingTitle,
      });
      return true;
    },
    [webrtc.callStatus, webrtc.joinMeetingRoom, webrtc.endCall]
  );

  useEffect(() => {
    if (!uid) {
      clearSession();
      webrtc.endCall();
    }
  }, [uid, clearSession, webrtc.endCall]);

  const peerLabel = session?.peerUserName || webrtc.incomingCaller?.callerName;
  const showCallUi = webrtc.callStatus !== 'idle' && webrtc.callStatus !== 'incoming';

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
        joinMeetingCall,
      }}
    >
      {children}
      {showCallUi ? (
        <LiveKitCallView
          callStatus={webrtc.callStatus}
          livekitToken={webrtc.livekitToken}
          livekitUrl={webrtc.livekitUrl}
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
          meetingLobby={session?.meetingMode && !webrtc.remoteStream}
          meetingTitle={session?.meetingTitle}
          meetingId={session?.meetingId}
          meetingRoomId={session?.roomId}
          currentUserId={uid || undefined}
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
