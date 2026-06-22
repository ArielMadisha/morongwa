'use client';

import { useEffect, useRef, useCallback } from 'react';
import { liveAPI } from '@/lib/api';

type Props = {
  src: string;
  className?: string;
  poster?: string;
  /** When set with streamKey + sessionId, sends anonymised playback metrics to the API. */
  broadcasterUserId?: string;
  streamKey?: string | null;
  sessionId?: string | null;
};

function safeReport(
  broadcasterUserId: string | undefined,
  streamKey: string | null | undefined,
  sessionId: string | null | undefined,
  eventType: 'play_start' | 'heartbeat' | 'buffer_stall' | 'error' | 'fatal_error' | 'ended',
  message?: string
) {
  if (!broadcasterUserId || !streamKey || !sessionId) return;
  void liveAPI
    .reportMetric({
      broadcasterUserId,
      streamKey,
      sessionId,
      eventType,
      message: message?.slice(0, 500),
    })
    .catch(() => {});
}

/**
 * HLS playback (Safari native; Chrome/Firefox via hls.js).
 * Ensure `src` is reachable from the browser (HTTPS if the page is HTTPS).
 * Optional telemetry for admin monitoring (buffering, errors, viewer heartbeats).
 */
export function LiveHlsPlayer({ src, className = '', poster, broadcasterUserId, streamKey, sessionId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastBufferReportRef = useRef(0);

  const report = useCallback(
    (eventType: 'play_start' | 'heartbeat' | 'buffer_stall' | 'error' | 'fatal_error' | 'ended', message?: string) => {
      safeReport(broadcasterUserId, streamKey ?? undefined, sessionId ?? undefined, eventType, message);
    },
    [broadcasterUserId, streamKey, sessionId]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    const startHeartbeat = () => {
      if (heartbeatTimer || !broadcasterUserId || !streamKey || !sessionId) return;
      heartbeatTimer = setInterval(() => {
        if (!video.paused) report('heartbeat');
      }, 45_000);
    };
    const stopHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const onWaiting = () => {
      const now = Date.now();
      if (now - lastBufferReportRef.current < 15_000) return;
      lastBufferReportRef.current = now;
      report('buffer_stall');
    };

    const onEnded = () => {
      stopHeartbeat();
      report('ended');
    };

    const onPlay = () => {
      startHeartbeat();
    };

    const onPause = () => {
      /* keep heartbeat stopped only when paused long — simple: clear on pause */
      stopHeartbeat();
    };

    video.addEventListener('waiting', onWaiting);
    video.addEventListener('ended', onEnded);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      const onLoaded = () => {
        report('play_start', 'native_hls');
        video.removeEventListener('loadedmetadata', onLoaded);
      };
      video.addEventListener('loadedmetadata', onLoaded);
      return () => {
        stopHeartbeat();
        video.removeEventListener('waiting', onWaiting);
        video.removeEventListener('ended', onEnded);
        video.removeEventListener('play', onPlay);
        video.removeEventListener('pause', onPause);
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeAttribute('src');
        video.load();
      };
    }

    let destroyed = false;
    let hls: import('hls.js').default | null = null;

    import('hls.js').then(({ default: Hls }) => {
      if (destroyed || !video) return;
      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        let reportedStart = false;
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!reportedStart) {
            reportedStart = true;
            report('play_start', 'hls.js_manifest');
            startHeartbeat();
          }
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          const detail = `${data.type || ''}/${data.details || ''}`.slice(0, 240);
          if (data.fatal) {
            report('fatal_error', detail);
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls?.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls?.recoverMediaError();
                break;
              default:
                hls?.destroy();
                hls = null;
                break;
            }
          } else {
            report('error', detail);
          }
        });
      }
    });

    return () => {
      destroyed = true;
      stopHeartbeat();
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      if (hls) {
        hls.destroy();
        hls = null;
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [src, broadcasterUserId, streamKey, sessionId, report]);

  return (
    <video
      ref={videoRef}
      className={className}
      poster={poster}
      controls
      playsInline
      autoPlay
      muted
    />
  );
}
