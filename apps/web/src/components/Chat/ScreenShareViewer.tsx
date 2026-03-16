/**
 * ScreenShareViewer — Renders the remote (or local preview) screen share
 * stream as a floating overlay inside the chat area.
 *
 * Features:
 *   - Fullscreen toggle (native Fullscreen API)
 *   - Picture-in-Picture (if browser supports)
 *   - Dismiss / collapse
 *   - Robust audio: retries play() on failure, handles autoplay policy
 *   - Resilient to ICE disruptions: handles track mute/unmute, stream changes
 *   - Stats overlay (resolution, fps, bitrate) — dev-only
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';

interface ScreenShareViewerProps {
  /** The MediaStream to display */
  stream: MediaStream;
  /** Label shown in the header ("You" for local, partner name for remote) */
  label: string;
  /** Called when the viewer is closed / dismissed */
  onClose?: () => void;
  /** Whether this is a local preview (mirrored, muted) */
  isLocal?: boolean;
  /** Optional RTCPeerConnection for receiver-side debug stats */
  pc?: RTCPeerConnection | null;
  isMobile?: boolean;
  layout?: 'overlay' | 'theater';
  adaptiveBitrateEnabled?: boolean;
  onToggleAdaptiveBitrate?: () => void;
  adaptiveBitrateStats?: {
    targetBitrate: number | null;
    lossRate: number | null;
    rttMs: number | null;
  };
}

export const ScreenShareViewer: React.FC<ScreenShareViewerProps> = ({
  stream,
  label,
  onClose,
  isLocal = false,
  pc = null,
  isMobile = false,
  layout = 'overlay',
  adaptiveBitrateEnabled,
  onToggleAdaptiveBitrate,
  adaptiveBitrateStats,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const [isStreamUnavailable, setIsStreamUnavailable] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState(16 / 9);
  const playRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Robust stream attachment with play() retry for audio autoplay policy
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    // Clean up previous retry timer
    if (playRetryTimerRef.current) {
      clearTimeout(playRetryTimerRef.current);
      playRetryTimerRef.current = null;
    }

    // Force re-attachment by clearing srcObject first
    video.srcObject = null;
    video.load(); // Reset the video element state

    // Attach the new stream
    video.srcObject = stream;
    if (bgVideoRef.current) {
      bgVideoRef.current.srcObject = stream;
    }
    const updateAspectRatio = () => {
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      if (width > 0 && height > 0) {
        setVideoAspectRatio(width / height);
      }
    };
    video.addEventListener('loadedmetadata', updateAspectRatio);
    video.addEventListener('resize', updateAspectRatio);
    updateAspectRatio();
    setNeedsAudioUnlock(false);

    const attemptPlay = (attempt = 0, maxAttempts = 5) => {
      // Check if the stream has active tracks before attempting play
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack || videoTrack.readyState !== 'live') {
        console.warn('[ScreenShareViewer] Video track not ready, retrying...', {
          hasTrack: !!videoTrack,
          readyState: videoTrack?.readyState,
          muted: videoTrack?.muted,
          enabled: videoTrack?.enabled
        });

        if (attempt < maxAttempts - 1) {
          const delay = 200 * Math.pow(1.5, attempt);
          playRetryTimerRef.current = setTimeout(() => attemptPlay(attempt + 1, maxAttempts), delay);
          return;
        }
      }

      video.play()
        .then(() => {
          if (import.meta.env.DEV) {
            console.log('[ScreenShareViewer] play() succeeded');
          }
          setNeedsAudioUnlock(false);
          bgVideoRef.current?.play().catch(() => { });
        })
        .catch(err => {
          if (err.name === 'AbortError') {
            if (attempt < maxAttempts - 1) {
              const delay = 120;
              playRetryTimerRef.current = setTimeout(() => attemptPlay(attempt + 1, maxAttempts), delay);
            }
            return;
          }
          console.warn(`[ScreenShareViewer] play() failed (attempt ${attempt + 1}):`, err.name, err.message);
          if (err.name === 'NotAllowedError') {
            // Autoplay policy blocked — show "click to play" overlay
            setNeedsAudioUnlock(true);
          } else if (attempt < maxAttempts - 1) {
            // Other error (e.g., no data yet) — retry with backoff
            const delay = 500 * Math.pow(2, attempt);
            playRetryTimerRef.current = setTimeout(() => attemptPlay(attempt + 1, maxAttempts), delay);
          }
        });
    };
    attemptPlay();

    // ── Track event listeners for ICE disruption resilience ────────
    // During ICE disconnection, tracks get muted. When ICE recovers,
    // they unmute — but the video element might not resume automatically.
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== 'live') {
      setIsStreamUnavailable(true);
    } else {
      setIsStreamUnavailable(false);
    }

    const handleTrackEnded = () => setIsStreamUnavailable(true);
    const handleTrackAlive = () => setIsStreamUnavailable(false);
    videoTrack?.addEventListener('ended', handleTrackEnded);
    videoTrack?.addEventListener('unmute', handleTrackAlive);

    const audioTrack = stream.getAudioTracks()[0];

    const handleUnmute = () => {
      if (import.meta.env.DEV) {
        console.log('[ScreenShareViewer] Track unmuted (ICE recovered) — retrying play()');
      }
      attemptPlay(0, 2);
    };

    videoTrack?.addEventListener('unmute', handleUnmute);
    audioTrack?.addEventListener('unmute', handleUnmute);

    return () => {
      if (playRetryTimerRef.current) {
        clearTimeout(playRetryTimerRef.current);
        playRetryTimerRef.current = null;
      }
      videoTrack?.removeEventListener('unmute', handleUnmute);
      videoTrack?.removeEventListener('ended', handleTrackEnded);
      videoTrack?.removeEventListener('unmute', handleTrackAlive);
      audioTrack?.removeEventListener('unmute', handleUnmute);
      video.removeEventListener('loadedmetadata', updateAspectRatio);
      video.removeEventListener('resize', updateAspectRatio);
      if (video) video.srcObject = null;
      if (bgVideoRef.current) bgVideoRef.current.srcObject = null;
    };
  }, [stream, isMinimized]);

  // ── Receiver-side debug stats ──────────────────────────────────
  useEffect(() => {
    if (!pc || isLocal || !stream) return;
    let prevBytes = 0;
    let prevFrames = 0;
    let prevTs = performance.now();
    const trackId = stream.getVideoTracks()[0]?.id;

    const interval = setInterval(async () => {
      if (pc.connectionState === 'closed') { clearInterval(interval); return; }
      try {
        const stats = await pc.getStats();
        const now = performance.now();
        let inboundVideo: any = null;
        let candidatePair: any = null;
        let codec: any = null;
        let localCandidate: any = null;
        let remoteCandidate: any = null;

        stats.forEach((report: any) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            // Match by trackIdentifier or pick the one with most bytes
            if (trackId && report.trackIdentifier === trackId) {
              inboundVideo = report;
            } else if (!inboundVideo || report.bytesReceived > (inboundVideo?.bytesReceived ?? 0)) {
              inboundVideo = report;
            }
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            candidatePair = report;
          }
        });

        if (inboundVideo?.codecId) {
          stats.forEach((r: any) => { if (r.id === inboundVideo.codecId) codec = r; });
        }
        if (candidatePair) {
          stats.forEach((r: any) => {
            if (r.id === candidatePair.localCandidateId) localCandidate = r;
            if (r.id === candidatePair.remoteCandidateId) remoteCandidate = r;
          });
        }

        const elapsed = (now - prevTs) / 1000;
        const bitrateKbps = elapsed > 0
          ? ((inboundVideo?.bytesReceived ?? 0) - prevBytes) * 8 / 1000 / elapsed
          : 0;
        const fpsReceived = elapsed > 0
          ? ((inboundVideo?.framesReceived ?? 0) - prevFrames) / elapsed
          : 0;

        prevBytes = inboundVideo?.bytesReceived ?? 0;
        prevFrames = inboundVideo?.framesReceived ?? 0;
        prevTs = now;

        // Video element stats
        const video = videoRef.current;
        const videoElStats = video ? {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          paused: video.paused,
          readyState: video.readyState,
          buffered: video.buffered.length > 0 ? video.buffered.end(0).toFixed(2) + 's' : '0s',
        } : null;

        if (import.meta.env.DEV) {
          console.log(
            '%c[ScreenShare RECEIVER Stats]',
            'color: #ff8800; font-weight: bold',
            {
              decoded: inboundVideo ? `${inboundVideo.frameWidth ?? '?'}x${inboundVideo.frameHeight ?? '?'}` : 'N/A',
              codec: codec ? `${codec.mimeType} (${codec.clockRate}Hz)` : 'unknown',
              bitrate: `${bitrateKbps.toFixed(0)} kbps`,
              fpsReceived: fpsReceived.toFixed(1),
              fpsDecoded: inboundVideo?.framesPerSecond?.toFixed(1) ?? 'N/A',
              framesDecoded: inboundVideo?.framesDecoded,
              framesDropped: inboundVideo?.framesDropped,
              framesReceived: inboundVideo?.framesReceived,
              keyFramesDecoded: inboundVideo?.keyFramesDecoded,
              totalDecodeTime: inboundVideo?.totalDecodeTime?.toFixed(2) + 's',
              avgDecodeMs: inboundVideo?.framesDecoded
                ? ((inboundVideo.totalDecodeTime / inboundVideo.framesDecoded) * 1000).toFixed(1) + 'ms'
                : 'N/A',
              totalProcessingDelay: inboundVideo?.totalProcessingDelay?.toFixed(2) + 's',
              jitterBufferDelay: inboundVideo?.jitterBufferDelay?.toFixed(2) + 's',
              jitterBufferEmitted: inboundVideo?.jitterBufferEmittedCount,
              avgJitterMs: inboundVideo?.jitterBufferEmittedCount
                ? ((inboundVideo.jitterBufferDelay / inboundVideo.jitterBufferEmittedCount) * 1000).toFixed(1) + 'ms'
                : 'N/A',
              packetsLost: inboundVideo?.packetsLost,
              packetsReceived: inboundVideo?.packetsReceived,
              nackCount: inboundVideo?.nackCount,
              pliCount: inboundVideo?.pliCount,
              firCount: inboundVideo?.firCount,
              rtt: candidatePair ? `${(candidatePair.currentRoundTripTime * 1000).toFixed(0)}ms` : 'N/A',
              transport: localCandidate
                ? `${localCandidate.candidateType}(${localCandidate.protocol}) → ${remoteCandidate?.candidateType}(${remoteCandidate?.protocol})`
                : 'N/A',
              videoElement: videoElStats,
            }
          );
        }
      } catch (e) {
        console.warn('[ScreenShare RECEIVER Stats] Error:', e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [pc, stream, isLocal]);

  // Click handler to unlock audio (autoplay policy workaround)
  const handleAudioUnlock = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.play()
      .then(() => {
        console.log('[ScreenShareViewer] Audio unlocked via user gesture');
        setNeedsAudioUnlock(false);
      })
      .catch(err => console.warn('[ScreenShareViewer] Audio unlock failed:', err));
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const activeElement = document.fullscreenElement;
      setIsFullscreen(!!activeElement && activeElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      const activeElement = document.fullscreenElement;
      if (activeElement && activeElement === containerRef.current) {
        await document.exitFullscreen();
        return;
      }

      if (containerRef.current) {
        await containerRef.current.requestFullscreen();
      }
    } catch (err) {
      console.warn('[ScreenShareViewer] Fullscreen toggle failed:', err);
    }
  }, []);

  const togglePiP = useCallback(async () => {
    try {
      const video = videoRef.current;
      if (!video) return;

      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('[ScreenShareViewer] PiP toggle failed:', err);
    }
  }, []);

  const formatBitrate = (bps: number | null) => {
    if (!bps || !Number.isFinite(bps)) return 'N/A';
    if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
    return `${Math.round(bps / 1000)} kbps`;
  };

  const formatLoss = (loss: number | null) => {
    if (loss === null || !Number.isFinite(loss)) return 'N/A';
    return `${(loss * 100).toFixed(2)}%`;
  };

  const formatRtt = (ms: number | null) => {
    if (ms === null || !Number.isFinite(ms)) return 'N/A';
    return `${Math.round(ms)}ms`;
  };

  const showAdaptiveStats =
    adaptiveBitrateStats &&
    (adaptiveBitrateStats.targetBitrate !== null ||
      adaptiveBitrateStats.lossRate !== null ||
      adaptiveBitrateStats.rttMs !== null);

  // ── LOCAL PREVIEW — small floating card in bottom-right ──
  if (isLocal) {
    return (
      <div className="absolute bottom-4 right-4 z-30 w-80 rounded-lg overflow-hidden shadow-2xl border border-white/10 bg-black">
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            disablePictureInPicture
            className="w-full aspect-video object-contain bg-black"
          />
          <div className="absolute top-0 inset-x-0 flex items-center justify-between px-2.5 py-1.5 bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-white text-[11px] font-medium">Your screen</span>
            </div>
            <div className="flex items-center gap-2">
              {onToggleAdaptiveBitrate && (
                <div className="flex items-center gap-1.5 text-white/80">
                  <span className="text-[10px] font-medium">Adaptive</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!adaptiveBitrateEnabled}
                    aria-label="Toggle adaptive bitrate"
                    data-state={adaptiveBitrateEnabled ? "checked" : "unchecked"}
                    className="ss-control-btn inline-flex h-[18px] w-[34px] shrink-0 cursor-pointer items-center rounded-full border border-white/10 transition-colors"
                    style={{
                      backgroundColor: adaptiveBitrateEnabled
                        ? "hsl(var(--primary))"
                        : "rgba(255,255,255,0.2)",
                    }}
                    onClick={onToggleAdaptiveBitrate}
                  >
                    <span
                      data-state={adaptiveBitrateEnabled ? "checked" : "unchecked"}
                      className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform"
                      style={{
                        transform: adaptiveBitrateEnabled
                          ? "translateX(16px)"
                          : "translateX(0px)",
                      }}
                    />
                  </button>
                </div>
              )}
              {onClose && (
                <button
                  onClick={onClose}
                  className="ss-control-btn p-1 rounded hover:bg-red-500/80 text-white/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                  title="Stop sharing"
                  aria-label="Stop local screen sharing"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          {showAdaptiveStats && (
            <div className="absolute bottom-2 left-2 px-2 py-1 rounded-md bg-black/70 text-white text-[10px] font-medium flex items-center gap-2">
              <span>Target {formatBitrate(adaptiveBitrateStats?.targetBitrate ?? null)}</span>
              <span>Loss {formatLoss(adaptiveBitrateStats?.lossRate ?? null)}</span>
              <span>RTT {formatRtt(adaptiveBitrateStats?.rttMs ?? null)}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── REMOTE VIEWER ──

  if (isMinimized) {
    return (
      <div className="absolute bottom-4 right-4 z-30">
        <button
          onClick={() => setIsMinimized(false)}
          className="ss-control-btn flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-white text-xs font-medium shadow-lg hover:bg-emerald-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          title="Expand screen share"
          aria-label={`Expand ${label}'s screen share`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3" />
            <polyline points="8 21 12 17 16 21" />
            <line x1="18" y1="3" x2="18" y2="11" />
            <line x1="14" y1="7" x2="22" y2="7" />
          </svg>
          <span>{label}'s screen</span>
        </button>
      </div>
    );
  }

  const isTheater = layout === 'theater';
  const useOverlayHeader = isMobile && !isFullscreen;
  const remoteVideoFitClass = isTheater
    ? 'relative z-10 w-full h-full object-contain'
    : 'max-w-full max-h-full object-contain';

  return (
    <div
      ref={containerRef}
      className={`${isFullscreen
        ? 'fixed inset-0 z-[9999] bg-black'
        : isTheater
          ? 'ss-theater-root relative w-full h-full bg-[#0b0d12] z-20 shadow-[0_30px_120px_rgba(0,0,0,0.7)] overflow-hidden sm:rounded-2xl'
          : 'relative w-full flex-none bg-black z-20 shadow-lg border-b border-border/20'
        } flex flex-col`}
      style={!isFullscreen && !isTheater ? { maxHeight: 'clamp(200px, 45vh, 600px)', aspectRatio: '16/9' } : {}}
    >
      {/* Header bar — always visible */}
      <div className={`ss-theater-header flex items-center justify-between px-3 sm:px-4 ${useOverlayHeader ? 'absolute inset-x-0 top-0 z-20 py-1.5 bg-gradient-to-b from-black/45 to-transparent' : isTheater ? 'py-1.5 sm:py-2.5 bg-black/70 backdrop-blur border-b border-transparent' : 'py-2.5 bg-gradient-to-b from-black/90 to-black/60 border-b border-border/40'} ${useOverlayHeader ? '' : 'flex-shrink-0'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className={`ss-theater-label text-white font-medium truncate ${useOverlayHeader ? 'text-[11px] max-w-[52vw]' : 'text-xs'}`}>{label}'s screen</span>
        </div>
        <div className={`flex items-center ${useOverlayHeader ? 'gap-0.5' : 'gap-1'}`}>
          {/* PiP button */}
          {!useOverlayHeader && document.pictureInPictureEnabled && (
            <button
              onClick={togglePiP}
              className={`ss-control-btn ${useOverlayHeader ? 'p-1' : 'p-1.5'} rounded hover:bg-white/20 text-white/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80`}
              title="Picture-in-Picture"
              aria-label="Open picture in picture"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <rect x="12" y="9" width="8" height="6" rx="1" />
              </svg>
            </button>
          )}

          {/* Minimize */}
          {!useOverlayHeader && (
            <button
              onClick={() => setIsMinimized(true)}
              className={`ss-control-btn ${useOverlayHeader ? 'p-1' : 'p-1.5'} rounded hover:bg-white/20 text-white/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80`}
              title="Minimize"
              aria-label="Minimize screen share"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          )}

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className={`ss-control-btn ${useOverlayHeader ? 'p-1' : 'p-1.5'} rounded hover:bg-white/20 text-white/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80`}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
          </button>

          {/* Close */}
          {onClose && (
            <button
              onClick={onClose}
              className={`ss-control-btn ${useOverlayHeader ? 'p-1' : 'p-1.5'} rounded hover:bg-red-500/80 text-white/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80`}
              title="Stop viewing"
              aria-label="Stop viewing screen share"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Video element */}
      <div
        className={`ss-theater-viewport relative flex items-center justify-center min-h-0 overflow-hidden ${isTheater ? 'w-full p-0 sm:p-2 lg:p-3' : 'flex-grow p-1'}`}
        style={isTheater ? { aspectRatio: `${videoAspectRatio}` } : {}}
      >
        {isTheater && (
          <video
            ref={bgVideoRef}
            autoPlay
            playsInline
            muted
            disablePictureInPicture
            className={`absolute inset-0 w-full h-full object-cover ${isMobile ? 'scale-125 blur-3xl opacity-65' : 'scale-110 blur-2xl opacity-40'}`}
          />
        )}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`${remoteVideoFitClass} ${isTheater ? 'rounded-none sm:rounded-2xl bg-transparent' : 'rounded-2xl bg-black'}`}
        />
        {isStreamUnavailable && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70">
            <div className="flex flex-col items-center gap-3 px-4 text-center text-white">
              <span className="text-sm font-semibold">Screen share unavailable</span>
              <button
                type="button"
                onClick={handleAudioUnlock}
                className="ss-control-btn rounded-md bg-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                Retry playback
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Audio unlock overlay — shown when autoplay policy blocks playback */}
      {needsAudioUnlock && !isLocal && (
        <div
          onClick={handleAudioUnlock}
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 cursor-pointer"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleAudioUnlock();
            }
          }}
          aria-label="Enable screen share audio"
        >
          <div className="flex flex-col items-center gap-2 text-white">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
            <span className="text-sm font-medium">Click to enable audio</span>
          </div>
        </div>
      )}
    </div>
  );
};
