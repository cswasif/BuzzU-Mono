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
import { useSessionStore } from '../stores/sessionStore';
import { useScreenShareStore } from '../stores/screenShareStore';

interface UseConnectionResilienceOptions {
  /** Map of peer connections (from useWebRTC) */
  getPeerConnections: () => Map<string, RTCPeerConnection>;
  /** Trigger ICE restart for a specific peer */
  applyTurnFallback: (peerId: string) => void;
  /** Check if a TURN fallback is in progress for a peer */
  isFallbackActive: (peerId: string) => boolean;
  /** Whether the user is currently in an active chat */
  isInChat: boolean;
}

export function useConnectionResilience({
  getPeerConnections,
  applyTurnFallback,
  isFallbackActive,
  isInChat,
}: UseConnectionResilienceOptions) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const audioKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silentAudioRef = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);
  const webLockAbortRef = useRef<AbortController | null>(null);
  const frozenTimestampRef = useRef<number | null>(null);
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
        const iceState = pc.iceConnectionState;
        const connState = pc.connectionState;

        if (iceState === 'failed' || connState === 'failed') {
          if (isFallbackActive(pid)) {
            console.log(`[Resilience] Peer ${pid} failed but fallback already active — skipping`);
            continue;
          }
          console.warn(`[Resilience] Peer ${pid} stuck in failed (${source}) — restarting ICE`);
          applyTurnFallback(pid);
        } else if (iceState === 'disconnected') {
          if (isFallbackActive(pid)) continue;
          console.warn(`[Resilience] Peer ${pid} still disconnected (${source}) — restarting ICE`);
          applyTurnFallback(pid);
        } else if (iceState === 'checking') {
          if (isFallbackActive(pid)) continue;
          console.warn(`[Resilience] Peer ${pid} still checking (${source}) — restarting ICE`);
          applyTurnFallback(pid);
        }
      }

      // 6. Screen share stream recovery
      const ssState = useScreenShareStore.getState();
      if (ssState.isRemoteSharing && ssState.remoteStream) {
        console.log('[Resilience] Nudging remote screen share stream');
        useScreenShareStore.getState().setRemoteSharing(ssState.remoteStream);
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

    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.frequency.value = 1; // 1 Hz — inaudible
      gain.gain.value = 0;     // Completely silent

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      silentAudioRef.current = { ctx, osc, gain };
      console.log('[Resilience] Silent audio keepalive started');

      // Handle AudioContext suspension (iOS Safari requires user gesture)
      if (ctx.state === 'suspended') {
        const resumeOnInteraction = () => {
          ctx.resume().catch(() => { });
          document.removeEventListener('touchstart', resumeOnInteraction);
          document.removeEventListener('click', resumeOnInteraction);
        };
        document.addEventListener('touchstart', resumeOnInteraction, { once: true });
        document.addEventListener('click', resumeOnInteraction, { once: true });
      }
    } catch (err) {
      console.warn('[Resilience] Failed to create silent audio keepalive:', err);
    }

    return () => {
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
          // Use sendBeacon for reliability — fetch may be cancelled during unload
          const matchmakerUrl = import.meta.env.VITE_MATCHMAKER_URL || 'https://buzzu-matchmaker.md-wasif-faisal.workers.dev';
          navigator.sendBeacon(
            `${matchmakerUrl}/match/disconnect?peer_id=${storePeerId}`,
          );
          console.log('[Resilience] Sent graceful disconnect via sendBeacon');
        }
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [isInChat]);
}
