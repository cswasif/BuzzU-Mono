/**
 * useConnectionResilience — Keeps WebRTC + signaling alive across
 * browser backgrounding, tab switching, minimization, and screen sleep.
 *
 * Patterns sourced from:
 *   - Abyss (msuddaby/Abyss) — visibility-change ICE recovery, audio keepalive
 *   - Umbra (InfamousVague/Umbra) — intentional disconnect flag, app state handler
 *   - Screen Wake Lock API — W3C spec for preventing screen sleep
 *   - Page Lifecycle API — freeze/resume events for aggressive mobile browsers
 *   - Web Locks API — prevents browser from discarding the tab
 *
 * Features:
 *   1. Screen Wake Lock — prevents screen from sleeping during active chat
 *   2. visibilitychange handler — on tab visible:
 *      a. Immediate signaling WS reconnect check
 *      b. Sweep all PCs for stuck ICE states (failed/disconnected/checking)
 *      c. Resume paused audio/video elements
 *   3. Page Lifecycle (freeze/resume) — handles aggressive mobile browser freezing
 *   4. Web Locks API — holds a "web lock" to discourage tab discarding
 *   5. Silent audio keepalive — inaudible oscillator prevents AudioContext suspension
 *   6. Audio keep-alive — periodic check to resume suspended media elements
 *   7. pagehide cleanup — graceful matchmaker disconnect on mobile navigation
 */

import { useEffect, useRef, useCallback } from 'react';
import { useSignalingContext } from '../context/SignalingContext';
import { sendMatchmakerDisconnect, useSessionStore } from '../stores/sessionStore';
import { useScreenShareStore } from '../stores/screenShareStore';

interface UseConnectionResilienceOptions {
  /** Map of peer connections (from useWebRTC) */
  getPeerConnections: () => Map<string, RTCPeerConnection>;
  /** Trigger ICE restart for a specific peer */
  applyTurnFallback: (peerId: string) => void;
  /** Check if a TURN fallback is in progress for a peer */
  isFallbackActive: (peerId: string) => boolean;
  /** Get the current rich connection state for a peer */
  getConnectionState: (peerId: string) => any;
  /** Whether the user is currently in an active chat */
  isInChat: boolean;
}

export function useConnectionResilience({
  getPeerConnections,
  applyTurnFallback,
  isFallbackActive,
  getConnectionState,
  isInChat,
}: UseConnectionResilienceOptions) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const audioKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silentAudioRef = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);
  const webLockAbortRef = useRef<AbortController | null>(null);
  const frozenTimestampRef = useRef<number | null>(null);
  const screenShareKeepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { isConnected: signalingConnected } = useSignalingContext();
  const context = useSignalingContext();

  // ── Screen Wake Lock ──────────────────────────────────────────────
  // Prevents the screen from turning off during an active chat session.
  // Automatically released when the tab becomes hidden, and re-acquired
  // when it becomes visible again.
  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      // Only acquire if we don't already have one
      if (wakeLockRef.current) return;
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      console.log('[Resilience] Screen Wake Lock acquired');

      // Wake locks are automatically released on visibility change.
      // Re-acquire when the tab becomes visible.
      wakeLockRef.current.addEventListener('release', () => {
        console.log('[Resilience] Screen Wake Lock released');
        wakeLockRef.current = null;
      });
    } catch (err) {
      // Wake Lock request can fail (e.g., low battery)
      console.warn('[Resilience] Wake Lock request failed:', err);
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => { });
      wakeLockRef.current = null;
    }
  }, []);

  // Acquire/release wake lock based on chat state
  useEffect(() => {
    if (isInChat) {
      acquireWakeLock();
    } else {
      releaseWakeLock();
    }
    return () => releaseWakeLock();
  }, [isInChat, acquireWakeLock, releaseWakeLock]);

  // ── Recovery sweep (shared by visibility + freeze/resume) ─────────
  const runRecoverySweep = useCallback((source: string) => {
    console.log(`[Resilience] Running recovery sweep (${source})`);

    // 1. Re-acquire wake lock
    acquireWakeLock();

    // 2. Check signaling WebSocket health IMMEDIATELY
    const { currentRoomId, peerId: storePeerId } = useSessionStore.getState();
    if (!signalingConnected && currentRoomId && storePeerId) {
      console.log(`[Resilience] Signaling WS dead on ${source} — triggering reconnect`);
      context.connect(currentRoomId, storePeerId);
    }

    // 3. Resume suspended AudioContext (silent keepalive)
    if (silentAudioRef.current && silentAudioRef.current.ctx.state === 'suspended') {
      silentAudioRef.current.ctx.resume().catch(() => { });
    }

    // 4. Resume any paused media elements (autoplay policy after background)
    try {
      document.querySelectorAll('video, audio').forEach((el) => {
        const media = el as HTMLMediaElement;
        if (media.srcObject && media.paused && !media.ended) {
          media.play().catch(() => { });
        }
      });
    } catch (_) { /* non-critical */ }

    // 5. ICE recovery sweep — give ICE 1.5 seconds to self-heal first
    setTimeout(() => {
      if (document.hidden) return;

      const pcs = getPeerConnections();
      for (const [pid, pc] of pcs) {
        const richState = getConnectionState(pid);
        const iceState = pc.iceConnectionState;
        const connState = pc.connectionState;

        if (richState.type === 'failed' || iceState === 'failed' || connState === 'failed') {
          if (isFallbackActive(pid)) {
            console.log(`[Resilience] Peer ${pid} failed but fallback already active — skipping`);
            continue;
          }
          console.warn(`[Resilience] Peer ${pid} stuck in failed (${source}, richState: ${richState.type}) — restarting ICE`);
          applyTurnFallback(pid);
        } else if (richState.type === 'disconnected' || iceState === 'disconnected') {
          if (isFallbackActive(pid)) continue;
          console.warn(`[Resilience] Peer ${pid} still disconnected (${source}) — restarting ICE`);
          applyTurnFallback(pid);
        } else if (iceState === 'checking') {
          if (isFallbackActive(pid)) continue;
          console.warn(`[Resilience] Peer ${pid} still checking (${source}) — restarting ICE`);
          applyTurnFallback(pid);
        }
      }

      // 6. Enhanced screen share stream recovery
      const ssState = useScreenShareStore.getState();
      if (ssState.isRemoteSharing && ssState.remoteStream) {
        console.log('[Resilience] Enhanced remote screen share stream recovery');
        // Force stream re-attachment by incrementing version
        useScreenShareStore.getState().setRemoteSharing(ssState.remoteStream);
        
        // Ensure video elements are playing the screen share
        setTimeout(() => {
          document.querySelectorAll('video[srcobject]').forEach(video => {
            const media = video as HTMLVideoElement;
            if (media.srcObject instanceof MediaStream) {
              const stream = media.srcObject as MediaStream;
              const isScreenShare = stream.getVideoTracks().some(track => 
                ssState.remoteStream?.getVideoTracks().some(rt => rt.id === track.id)
              );
              
              if (isScreenShare && media.paused) {
                media.play().catch(() => {
                  // Expected if still in background, but worth trying
                  console.log('[Resilience] Screen share video play failed (still background?)');
                });
              }
            }
          });
        }, 100); // Small delay to ensure DOM is ready
      }

      // 7. Local screen share recovery - ensure tracks are enabled
      if (ssState.isLocalSharing && ssState.localStream) {
        console.log('[Resilience] Checking local screen share tracks');
        ssState.localStream.getVideoTracks().forEach(track => {
          if (track.readyState === 'live' && !track.enabled) {
            track.enabled = true;
            console.log('[Resilience] Re-enabled local screen share track');
          }
        });
      }
    }, 1500);
  }, [signalingConnected, context, acquireWakeLock, getPeerConnections, applyTurnFallback, isFallbackActive]);

  // ── Visibility Change Handler ─────────────────────────────────────
  // Core resilience: when the tab becomes visible again after being
  // backgrounded, sweep all peer connections and recover stuck ones.
  useEffect(() => {
    if (!isInChat) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('[Resilience] Tab hidden — suppressing ICE reactions');
        return;
      }
      // Tab became visible
      runRecoverySweep('tab-visible');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also handle window focus (covers some edge cases on mobile)
    const handleFocus = () => {
      if (!document.hidden) {
        acquireWakeLock();
      }
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isInChat, runRecoverySweep, acquireWakeLock]);

  // ── Page Lifecycle: freeze / resume ───────────────────────────────
  // Mobile browsers (especially Chrome on Android) aggressively freeze
  // backgrounded tabs — suspending all JS timers, WebSockets, and even
  // WebRTC ICE agents. The Page Lifecycle API fires `freeze` before
  // suspension and `resume` when the tab is brought back.
  //
  // Note: Chrome won't freeze tabs with active WebRTC, but other
  // mobile browsers (Samsung Internet, Firefox Android) may.
  useEffect(() => {
    if (!isInChat) return;

    const handleFreeze = () => {
      frozenTimestampRef.current = Date.now();
      console.log('[Resilience] Page frozen — saving timestamp for recovery');
    };

    const handleResume = () => {
      const frozenAt = frozenTimestampRef.current;
      const frozenDuration = frozenAt ? Date.now() - frozenAt : 0;
      frozenTimestampRef.current = null;

      console.log(`[Resilience] Page resumed after ${frozenDuration}ms frozen`);

      // If we were frozen for more than 5 seconds, the WebSocket is likely dead
      // and ICE may have timed out. Run a full recovery sweep.
      if (frozenDuration > 5000) {
        runRecoverySweep('resume-after-freeze');
      } else {
        // Short freeze — just re-check signaling and wake lock
        acquireWakeLock();
        const { currentRoomId, peerId: storePeerId } = useSessionStore.getState();
        if (!signalingConnected && currentRoomId && storePeerId) {
          context.connect(currentRoomId, storePeerId);
        }
      }
    };

    document.addEventListener('freeze', handleFreeze);
    document.addEventListener('resume', handleResume);

    return () => {
      document.removeEventListener('freeze', handleFreeze);
      document.removeEventListener('resume', handleResume);
    };
  }, [isInChat, signalingConnected, context, runRecoverySweep, acquireWakeLock]);

  // ── Web Locks API ─────────────────────────────────────────────────
  // Holding a Web Lock signals to the browser that this tab is actively
  // doing important work, discouraging the "Discard" lifecycle transition
  // (where the tab's state is completely unloaded to save memory).
  //
  // The lock is held for the entire duration of the chat session via a
  // never-resolving promise. The AbortController is used to release it
  // when the chat ends.
  useEffect(() => {
    if (!isInChat || !('locks' in navigator)) return;

    const controller = new AbortController();
    webLockAbortRef.current = controller;

    navigator.locks.request(
      'buzzu-active-chat',
      { signal: controller.signal },
      () => new Promise<void>(() => {
        // Intentionally never resolves — holds the lock until aborted
        console.log('[Resilience] Web Lock acquired — tab discard discouraged');
      }),
    ).catch((err) => {
      // AbortError is expected when we release the lock
      if (err.name !== 'AbortError') {
        console.warn('[Resilience] Web Lock error:', err);
      }
    });

    return () => {
      controller.abort();
      webLockAbortRef.current = null;
      console.log('[Resilience] Web Lock released');
    };
  }, [isInChat]);

  // ── Silent Audio Keepalive ────────────────────────────────────────
  // Creates an inaudible oscillator (gain=0) connected to the AudioContext
  // destination. This prevents mobile browsers from suspending the audio
  // context when the tab is backgrounded, which would freeze WebRTC
  // audio tracks. The oscillator runs at 1Hz with zero gain — completely
  // silent and near-zero CPU cost.
  useEffect(() => {
    if (!isInChat) {
      // Cleanup
      if (silentAudioRef.current) {
        try {
          silentAudioRef.current.osc.stop();
          silentAudioRef.current.ctx.close();
        } catch (_) { /* non-critical */ }
        silentAudioRef.current = null;
      }
      return;
    }

    let init: () => void = () => { };
    try {
      let initialized = false;
      init = () => {
        if (initialized || !isInChat) return;
        initialized = true;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.frequency.value = 1;
        gain.gain.value = 0;

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();

        silentAudioRef.current = { ctx, osc, gain };
        console.log('[Resilience] Silent audio keepalive started');

        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => { });
        }
      };

      const hasActivation = typeof navigator !== 'undefined'
        && typeof (navigator as any).userActivation !== 'undefined'
        && (navigator as any).userActivation?.hasBeenActive;

      if (hasActivation) {
        init();
      } else {
        document.addEventListener('touchstart', init, { once: true });
        document.addEventListener('click', init, { once: true });
      }
    } catch (err) {
      console.warn('[Resilience] Failed to create silent audio keepalive:', err);
    }

    return () => {
      document.removeEventListener('touchstart', init);
      document.removeEventListener('click', init);
      if (silentAudioRef.current) {
        try {
          silentAudioRef.current.osc.stop();
          silentAudioRef.current.ctx.close();
        } catch (_) { /* non-critical */ }
        silentAudioRef.current = null;
      }
    };
  }, [isInChat]);

  // ── Audio Keep-Alive ──────────────────────────────────────────────
  // Periodically check that audio/video elements aren't paused
  // (browser can pause them when backgrounded).
  useEffect(() => {
    if (!isInChat) {
      if (audioKeepAliveRef.current) {
        clearInterval(audioKeepAliveRef.current);
        audioKeepAliveRef.current = null;
      }
      return;
    }

    audioKeepAliveRef.current = setInterval(() => {
      // Don't burn CPU while tab is hidden — the visibility handler
      // will do a full recovery sweep when the tab becomes visible.
      if (document.hidden) return;

      document.querySelectorAll('video, audio').forEach((el) => {
        const media = el as HTMLMediaElement;
        if (media.srcObject && media.paused && !media.ended) {
          media.play().catch(() => { });
        }
      });

      // Also resume the silent AudioContext if it got suspended
      if (silentAudioRef.current && silentAudioRef.current.ctx.state === 'suspended') {
        silentAudioRef.current.ctx.resume().catch(() => { });
      }
    }, 5000);

    return () => {
      if (audioKeepAliveRef.current) {
        clearInterval(audioKeepAliveRef.current);
        audioKeepAliveRef.current = null;
      }
    };
  }, [isInChat]);

  // ── Screen Share Background Keepalive ─────────────────────────────
  // Browsers aggressively throttle video tracks when tabs are backgrounded.
  // This keepalive specifically targets screen share streams to ensure they
  // continue transmitting even when the sharing tab is minimized.
  useEffect(() => {
    // Check if screen sharing is active (local or remote)
    const checkScreenShareActive = () => {
      const ssState = useScreenShareStore.getState();
      return ssState.isLocalSharing || ssState.isRemoteSharing;
    };

    const cleanup = () => {
      if (screenShareKeepaliveRef.current) {
        clearInterval(screenShareKeepaliveRef.current);
        screenShareKeepaliveRef.current = null;
      }
    };

    if (!checkScreenShareActive()) {
      cleanup();
      return;
    }

    // Create interval that keeps screen share streams active in background
    screenShareKeepaliveRef.current = setInterval(() => {
      const ssState = useScreenShareStore.getState();
      if (!ssState.isLocalSharing && !ssState.isRemoteSharing) {
        cleanup();
        return;
      }

      // For local screen sharing: ensure tracks remain enabled
      if (ssState.localStream) {
        ssState.localStream.getVideoTracks().forEach(track => {
          // Prevent track from being disabled by browser throttling
          if (track.readyState === 'live' && !track.enabled) {
            track.enabled = true;
            console.log('[Resilience] Re-enabled local screen share video track');
          }
        });
      }

      // For remote screen sharing: ensure video elements continue playing
      if (ssState.remoteStream) {
        document.querySelectorAll('video[srcobject]').forEach(video => {
          const media = video as HTMLVideoElement;
          if (media.srcObject instanceof MediaStream) {
            const stream = media.srcObject as MediaStream;
            // Check if this is our screen share stream
            const isScreenShare = stream.getVideoTracks().some(track => 
              ssState.remoteStream?.getVideoTracks().some(rt => rt.id === track.id)
            );
            
            if (isScreenShare && media.paused && !media.ended) {
              media.play().catch(() => { 
                // Expected in background - browser will block autoplay
              });
            }
          }
        });
      }

      // Force peer connection to stay active by requesting stats
      // This prevents ICE agents from going dormant in background tabs
      const pcs = getPeerConnections();
      pcs.forEach((pc, peerId) => {
        if (pc.connectionState !== 'closed') {
          // Requesting stats keeps the connection active even in background
          pc.getStats().then(() => {
            // Stats request completed successfully
          }).catch(err => {
            console.warn(`[Resilience] Stats request failed for peer ${peerId}:`, err);
          });
        }
      });

    }, 3000); // Every 3 seconds - aggressive enough to prevent throttling

    console.log('[Resilience] Screen share background keepalive started');

    return cleanup;
  }, [isInChat, getPeerConnections]);

  // ── pagehide cleanup ──────────────────────────────────────────────
  // On mobile, `pagehide` is more reliable than `beforeunload` for
  // detecting navigation away / app backgrounding. We use it to send
  // a graceful disconnect to the matchmaker so the partner knows we
  // left rather than timing out.
  useEffect(() => {
    if (!isInChat) return;

    const handlePageHide = (e: PageTransitionEvent) => {
      // If persisted is false, the page is being unloaded entirely
      // (not put in bfcache). Send a disconnect.
      if (!e.persisted) {
        const { currentRoomId, peerId: storePeerId } = useSessionStore.getState();
        if (currentRoomId && storePeerId) {
          sendMatchmakerDisconnect(storePeerId, { useBeacon: true });
        }
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [isInChat]);
}
