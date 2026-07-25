'use client';

import { LiveKitRoom, VideoConference, RoomAudioRenderer, useParticipants } from '@livekit/components-react';
import '@livekit/components-styles';
import { broadcastRoomOptions, LIVEKIT_CONNECT_DEFAULTS } from '@/lib/livekit';

type LiveStageProps = {
  token: string;
  serverUrl: string;
  /** Host publishes camera/mic; viewers subscribe only (token grants). */
  asHost: boolean;
  portrait?: boolean;
  onDisconnected?: () => void;
  className?: string;
};

function ViewerCountBadge() {
  const participants = useParticipants();
  const viewers = Math.max(0, participants.length - 1);
  return (
    <div className="absolute top-3 left-3 z-20 rounded-full bg-black/60 text-white text-xs font-semibold px-3 py-1.5">
      {viewers} watching
    </div>
  );
}

export function LiveStage({
  token,
  serverUrl,
  asHost,
  portrait = false,
  onDisconnected,
  className = '',
}: LiveStageProps) {
  return (
    <div
      className={`relative overflow-hidden bg-black ${
        portrait ? 'aspect-[9/16] max-h-[90vh] mx-auto' : 'aspect-video w-full'
      } ${className}`}
    >
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        audio={asHost}
        video={asHost}
        options={broadcastRoomOptions(portrait)}
        connectOptions={LIVEKIT_CONNECT_DEFAULTS}
        data-lk-theme="default"
        className="h-full w-full"
        onDisconnected={onDisconnected}
      >
        <ViewerCountBadge />
        {asHost ? (
          <div className="absolute top-3 right-3 z-20 rounded-full bg-rose-600 text-white text-xs font-bold px-3 py-1.5">
            LIVE
          </div>
        ) : null}
        <VideoConference />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}
