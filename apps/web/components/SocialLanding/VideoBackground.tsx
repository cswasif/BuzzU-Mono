import React, { useState, useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';

export type VideoSegment = {
  videoId: string;
  start: number;
  end: number;
  aspectRatio?: '16:9' | '4:3' | '21:9' | '1:1' | '9:16';
  filter?: 'grayscale' | 'sepia' | 'none';
};

const getAspectRatioStyles = (aspectRatio?: string) => {
  switch (aspectRatio) {
    case '4:3':
      return {
        transform: 'translate(-50%, -50%) scale(1.2)',
        clipPath: 'inset(5px 0 5px 0)'
      };
    case '21:9':
      return {
        transform: 'translate(-50%, -50%) scale(1.45)',
        clipPath: 'inset(8px 0 8px 0)'
      };
    case '1:1':
      return {
        transform: 'translate(-50%, -50%) scale(1.3)',
        clipPath: 'inset(0 10px 0 10px)'
      };
    case '9:16':
      return {
        transform: 'translate(-50%, -50%) scale(1.35)',
        clipPath: 'inset(0 5px 0 5px)'
      };
    case '16:9':
    default:
      return {
        transform: 'translate(-50%, -50%) scale(1.3)',
        clipPath: 'inset(1px 0 1px 0)'
      };
  }
};

interface VideoBackgroundProps {
  videos: VideoSegment[];
  currentIndex: number;
  isMuted: boolean;
  onVideoEnd: () => void;
  onReady?: () => void;
  mirrored?: boolean;
  fallbackImage?: string;
  cropBlackBars?: boolean;
  filterSide?: 'left' | 'right' | 'full' | 'none';
  forceFallback?: boolean;
}

export const VideoBackground = memo(({
  videos,
  currentIndex,
  isMuted,
  onVideoEnd,
  onReady,
  mirrored = false,
  fallbackImage = '/assets/buzzu_fallback_background.png',
  cropBlackBars = true,
  filterSide = 'none',
  forceFallback = false
}: VideoBackgroundProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hasAppliedMuteRef = useRef(false);
  const hasStartedPlayingRef = useRef(false);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const currentVideo = videos[currentIndex];

  useEffect(() => {
    // Reset our tracker when the video switches so we re-apply the correct mute setting
    hasAppliedMuteRef.current = false;
    hasStartedPlayingRef.current = false;
    setPlaybackFailed(false);
  }, [currentIndex]);

  // Handle real-time mute/unmute toggle from props
  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      const command = isMuted ? 'mute' : 'unMute';
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: command, args: [] }),
        '*'
      );

      // Mirrored instance always stays at 0 volume as a fail-safe
      if (mirrored) {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'setVolume', args: [0] }),
          '*'
        );
      }
    }
  }, [isMuted, mirrored]);

  // Poll for time and enforce loop bounds manually because YouTube loop=1 resets to 0
  useEffect(() => {
    if (!currentVideo) return;
    const { start, end } = currentVideo;
    if (!end || end <= start) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.source === iframeRef.current?.contentWindow) {
        try {
          const data = JSON.parse(event.data);

          if (data.event === 'infoDelivery' && data.info && data.info.currentTime) {
            // Apply volume/mute setting on first heartbeat of a new video
            if (!hasAppliedMuteRef.current) {
              const command = isMuted ? 'mute' : 'unMute';
              iframeRef.current.contentWindow.postMessage(
                JSON.stringify({ event: 'command', func: command, args: [] }),
                '*'
              );

              // Extra safety for mirrored instance: force volume to 0
              if (mirrored) {
                iframeRef.current.contentWindow.postMessage(
                  JSON.stringify({ event: 'command', func: 'setVolume', args: [0] }),
                  '*'
                );
              }
              hasAppliedMuteRef.current = true;
              // Signal readiness on first heartbeat
              if (onReady) onReady();
            }

            const currentTime = data.info.currentTime;
            const playerState = data.info.playerState;

            // Mark as started once we see it's actually playing
            if (playerState === 1) {
              hasStartedPlayingRef.current = true;
            }

            // Trigger the NEXT video BEFORE this one actually ends to prevent YouTube recommendation walls.
            // We skip 1.5s early as a buffer for network and render delay.
            if (!mirrored && (playerState === 0 || currentTime >= end - 1.5 || currentTime < start - 1)) {
              onVideoEnd();
            }
          }
        } catch (e) {
          // ignore parse errors
        }
      }
    };

    window.addEventListener('message', handleMessage);

    const setupInterval = setInterval(() => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'listening', id: 1 }),
          '*'
        );
      }
    }, 1000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(setupInterval);
    };
  }, [currentVideo, isMuted, mirrored, onVideoEnd, onReady]);

  // Watchdog timer to detect if YouTube is blocked (e.g. "not a bot" prompt)
  useEffect(() => {
    if (playbackFailed || !currentVideo) return;

    const timer = setTimeout(() => {
      // If after 8 seconds we still haven't seen the video move to a "Playing" state,
      // something is likely blocking it (like a "not a bot" check or network error).
      if (!hasStartedPlayingRef.current) {
        console.warn('YouTube playback failed to reach "Playing" state within timeout. Switching to fallback.');
        setPlaybackFailed(true);
        if (onReadyRef.current) onReadyRef.current(); // Use ref to avoid identity-based resets
      }
    }, 8000); // Increased to 8s for reliability during transitions

    return () => clearTimeout(timer);
  }, [currentVideo, playbackFailed]); // Removed onReady from dependencies

  if (!currentVideo) return null;

  const aspectRatioClass = cropBlackBars && currentVideo.aspectRatio
    ? ` aspect-${currentVideo.aspectRatio.replace(':', '-')}`
    : '';

  return (
    <div className={`video-background-wrapper ${mirrored ? 'mirrored' : ''} filter-${filterSide}`}>
      <div className="video-background-overlay"></div>
      {(playbackFailed || forceFallback) ? (
        <div
          className="video-fallback-image"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundImage: `url("${fallbackImage}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            zIndex: 10
          }}
        />
      ) : (
        <iframe
          key={currentVideo.videoId + currentIndex + (mirrored ? '-mirror' : '')}
          ref={iframeRef}
          className={`video-background-iframe${cropBlackBars ? ' crop-black-bars' : ''}${aspectRatioClass}`}
          src={`https://www.youtube.com/embed/${currentVideo.videoId}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&enablejsapi=1&disablekb=1&modestbranding=1&start=${currentVideo.start}&end=${currentVideo.end}`}
          title="YouTube video player"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>
      )}
      {filterSide !== 'none' && (
        <div className={`side-filter-overlay ${filterSide}`}></div>
      )}
      <div className="cinematic-grain"></div>
    </div>
  );
});

VideoBackground.displayName = 'VideoBackground';
