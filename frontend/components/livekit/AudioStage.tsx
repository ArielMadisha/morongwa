'use client';

import { useEffect, useState } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Mic, MicOff, Users } from 'lucide-react';
import { audioRoomOptions, LIVEKIT_CONNECT_DEFAULTS, parseParticipantMetadata } from '@/lib/livekit';

type AudioStageProps = {
  token: string;
  serverUrl: string;
  canSpeak: boolean;
  onDisconnected?: () => void;
};

function SpeakerGrid({ canSpeak }: { canSpeak: boolean }) {
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const room = useRoomContext();
  const [muted, setMuted] = useState(!isMicrophoneEnabled);

  useEffect(() => {
    setMuted(!isMicrophoneEnabled);
  }, [isMicrophoneEnabled]);

  const toggleMic = async () => {
    if (!canSpeak) return;
    const next = !muted;
    await localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-2 text-slate-600 text-sm">
        <Users className="h-4 w-4" />
        {participants.length} in room
        {room.name ? <span className="text-slate-400">· {room.name}</span> : null}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {participants.map((p) => {
          const meta = parseParticipantMetadata(p.metadata);
          const speaking = p.isSpeaking;
          const label = p.name || p.identity;
          return (
            <div
              key={p.identity}
              className={`rounded-2xl border p-4 text-center transition ${
                speaking ? 'border-emerald-400 ring-2 ring-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'
              }`}
            >
              <div
                className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white ${
                  speaking ? 'bg-emerald-500' : 'bg-sky-600'
                }`}
              >
                {String(label).slice(0, 1).toUpperCase()}
              </div>
              <p className="font-medium text-slate-900 truncate">{label}</p>
              <p className="text-xs text-slate-500 mt-1">
                {p.isLocal ? (canSpeak ? 'You' : 'You (listening)') : String(meta.kind || 'guest')}
              </p>
            </div>
          );
        })}
      </div>
      {canSpeak ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void toggleMic()}
            className={`p-4 rounded-full text-white ${muted ? 'bg-rose-500' : 'bg-sky-600'}`}
          >
            {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-slate-500">You are listening — ask the host to speak next time.</p>
      )}
      <RoomAudioRenderer />
    </div>
  );
}

export function AudioStage({ token, serverUrl, canSpeak, onDisconnected }: AudioStageProps) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect
      audio={canSpeak}
      video={false}
      options={audioRoomOptions()}
      connectOptions={LIVEKIT_CONNECT_DEFAULTS}
      data-lk-theme="default"
      onDisconnected={onDisconnected}
      className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden"
    >
      <SpeakerGrid canSpeak={canSpeak} />
    </LiveKitRoom>
  );
}
