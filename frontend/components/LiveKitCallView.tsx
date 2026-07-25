'use client';

import { useEffect, useState } from 'react';
import { Video, VideoOff, Mic, MicOff, PhoneOff, Loader2, Phone } from 'lucide-react';
import type { CallStatus } from '@/hooks/useWebRTC';
import { MeetingInvitePanel } from '@/components/morongwa/MeetingInvitePanel';

interface LiveKitCallViewProps {
  callStatus: CallStatus;
  /** Reserved for future LiveKitRoom-driven UI; media is owned by useLiveKitCall. */
  livekitToken?: string | null;
  livekitUrl?: string | null;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  peerName?: string;
  incomingCaller?: { callerId: string; callerName?: string } | null;
  isMuted: boolean;
  isVideoOff: boolean;
  onStartCall: () => void;
  onAcceptCall: () => void;
  onRejectCall: () => void;
  onCancelCall: () => void;
  onEndCall: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  audioOnly?: boolean;
  meetingLobby?: boolean;
  meetingTitle?: string;
  meetingId?: string;
  meetingRoomId?: string;
  currentUserId?: string;
}

export function LiveKitCallView({
  callStatus,
  localVideoRef,
  remoteVideoRef,
  localStream,
  remoteStream,
  peerName,
  incomingCaller,
  isMuted,
  isVideoOff,
  onAcceptCall,
  onRejectCall,
  onCancelCall,
  onEndCall,
  onToggleMute,
  onToggleVideo,
  audioOnly = false,
  meetingLobby = false,
  meetingTitle,
  meetingId,
  meetingRoomId,
  currentUserId,
}: LiveKitCallViewProps) {
  const [showInvitePanel, setShowInvitePanel] = useState(false);

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
      void localVideoRef.current.play().catch(() => {});
    }
  }, [localStream, callStatus, localVideoRef]);

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      void remoteVideoRef.current.play().catch(() => {});
    }
  }, [remoteStream, callStatus, remoteVideoRef]);

  if (callStatus === 'incoming') {
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
        <div className="rounded-2xl bg-white shadow-xl p-8 max-w-sm w-full text-center">
          <div className="w-20 h-20 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
            {audioOnly ? <Phone className="h-10 w-10 text-sky-600" /> : <Video className="h-10 w-10 text-sky-600" />}
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">
            Incoming {audioOnly ? 'voice' : 'video'} call
          </h3>
          <p className="text-slate-600 mb-6">
            {incomingCaller?.callerName || 'Someone'} is calling you
          </p>
          <div className="flex gap-3">
            <button
              onClick={onRejectCall}
              className="flex-1 py-3 rounded-xl bg-rose-500 text-white font-semibold hover:bg-rose-600 flex items-center justify-center gap-2"
            >
              <PhoneOff className="h-5 w-5" />
              Decline
            </button>
            <button
              onClick={onAcceptCall}
              className="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 flex items-center justify-center gap-2"
            >
              <Video className="h-5 w-5" />
              Accept
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (callStatus === 'calling' || callStatus === 'connecting') {
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
        <div className="rounded-2xl bg-white shadow-xl p-8 max-w-sm w-full text-center">
          <div className="w-20 h-20 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4 animate-pulse">
            {audioOnly ? <Phone className="h-10 w-10 text-sky-600" /> : <Video className="h-10 w-10 text-sky-600" />}
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">
            {callStatus === 'calling' ? 'Calling' : 'Connecting'}…
          </h3>
          <p className="text-slate-600 mb-6">{peerName || 'Peer'}</p>
          <div className="flex justify-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
          </div>
          <button
            onClick={onCancelCall}
            className="mt-6 w-full py-3 rounded-xl bg-rose-500 text-white font-semibold hover:bg-rose-600 flex items-center justify-center gap-2"
          >
            <PhoneOff className="h-5 w-5" />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (callStatus === 'rejected') {
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
        <div className="rounded-2xl bg-white shadow-xl p-8 max-w-sm w-full text-center">
          <p className="text-slate-600 mb-4">Call was declined</p>
          <button
            onClick={onEndCall}
            className="px-4 py-2 rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  if (callStatus === 'connected') {
    return (
      <div className="fixed inset-0 z-[110] flex flex-col bg-slate-900">
        <div className="flex-1 relative min-h-0">
          {audioOnly ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <video ref={remoteVideoRef} autoPlay playsInline className="sr-only w-0 h-0" aria-hidden />
              <div className="w-28 h-28 rounded-full bg-sky-600/30 flex items-center justify-center">
                <Phone className="h-14 w-14 text-sky-200" />
              </div>
              <p className="text-white text-lg font-semibold">{peerName || 'Connected'}</p>
              <p className="text-sky-200 text-sm">Voice call in progress</p>
            </div>
          ) : meetingLobby && !remoteStream ? (
            <>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 px-6 text-center">
                <p className="text-white text-xl font-semibold mb-2">{meetingTitle || 'Meeting'}</p>
                <p className="text-sky-100 text-sm">You&apos;re in the meeting — waiting for others to join</p>
                {meetingId ? (
                  <p className="text-sky-200/80 text-xs mt-2">Meeting ID: {meetingId}</p>
                ) : meetingRoomId ? (
                  <p className="text-sky-200/80 text-xs mt-2">Room: {meetingRoomId}</p>
                ) : null}
                {meetingId && currentUserId ? (
                  <div className="mt-4 flex flex-col items-center gap-2 w-full max-w-md">
                    <button
                      type="button"
                      onClick={() => setShowInvitePanel((v) => !v)}
                      className="px-4 py-2 rounded-lg bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600 transition"
                    >
                      Invite users
                    </button>
                    {showInvitePanel ? (
                      <MeetingInvitePanel
                        meetingId={meetingId}
                        meetingTitle={meetingTitle}
                        currentUserId={currentUserId}
                        onClose={() => setShowInvitePanel(false)}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute bottom-4 right-4 w-40 h-32 rounded-xl overflow-hidden border-2 border-white/30 shadow-xl">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>
            </>
          )}
        </div>

        <div className="p-4 bg-black/50 flex items-center justify-center gap-4">
          <button
            onClick={onToggleMute}
            className={`p-4 rounded-full transition ${
              isMuted ? 'bg-rose-500 text-white' : 'bg-white/20 text-white hover:bg-white/30'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </button>
          {!audioOnly ? (
            <button
              onClick={onToggleVideo}
              className={`p-4 rounded-full transition ${
                isVideoOff ? 'bg-rose-500 text-white' : 'bg-white/20 text-white hover:bg-white/30'
              }`}
              title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
            >
              {isVideoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
            </button>
          ) : null}
          <button
            onClick={onEndCall}
            className="p-4 rounded-full bg-rose-500 text-white hover:bg-rose-600 transition"
            title="End call"
          >
            <PhoneOff className="h-6 w-6" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
