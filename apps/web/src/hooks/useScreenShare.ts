/**
 * useScreenShare — Production-grade screen sharing for P2P WebRTC
 *
 * Architecture: Adds a screen share video track to the existing
 * RTCPeerConnection via addTrack (triggers renegotiation).  The remote
 * peer distinguishes the screen track from the camera track by checking
 * the MediaStreamTrack.label or a custom signaling "ScreenShare" message.
 *
 * Quality tuning pulled from:
 *   - walujanle/simple-p2p-e2e-chat (contentHint, scalabilityMode, SDP)
 *   - Sphyrna-029/Chatter (maxBitrate profiles, degradationPreference)
 *   - frisksitron/lobby (replaceTrack pattern, priority settings)
 *
 * Supports up to 4K@30fps / 1080p@60fps with automatic hardware encoder
 * offload via scalabilityMode: 'L1T1'.
 */

import { useCallback, useRef, useState } from "react";

// ── Quality presets ──────────────────────────────────────────────────

export type ScreenShareQuality = "720p" | "1080p" | "1440p" | "4k";

interface QualityProfile {
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number; // bps
  contentHint: "detail" | "motion";
  degradationPreference: RTCDegradationPreference;
}

const QUALITY_PROFILES: Record<ScreenShareQuality, QualityProfile> = {
  "720p": {
    width: 1280,
    height: 720,
    frameRate: 30,
    maxBitrate: 2_500_000,
    contentHint: "detail",
    degradationPreference: "maintain-resolution",
  },
  "1080p": {
    width: 1920,
    height: 1080,
    frameRate: 30,
    maxBitrate: 4_500_000,
    contentHint: "detail",
    degradationPreference: "maintain-resolution",
  },
  "1440p": {
    width: 2560,
    height: 1440,
    frameRate: 30,
    maxBitrate: 6_000_000,
    contentHint: "detail",
    degradationPreference: "maintain-resolution",
  },
  "4k": {
    width: 3840,
    height: 2160,
    frameRate: 30,
    maxBitrate: 12_000_000, // 12 Mbps — suitable for 4K movie streaming
    contentHint: "motion", // movies benefit from 'motion'
    degradationPreference: "maintain-resolution",
  },
};

// Audio constraints for system audio (stereo, no processing)
const SYSTEM_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  sampleRate: 48000,
  channelCount: 2,
};

// ── Hook ─────────────────────────────────────────────────────────────

export interface UseScreenShareResult {
  /** Whether the local user is currently sharing their screen */
  isSharing: boolean;
  /** The local screen capture MediaStream (null when not sharing) */
  screenStream: MediaStream | null;
  /** Whether system audio is being captured */
  hasAudio: boolean;
  /** Current quality preset */
  quality: ScreenShareQuality;
  /** Start screen sharing — adds tracks to the given PC and triggers renegotiation */
  startScreenShare: (
    pc: RTCPeerConnection,
    sendOffer: (offer: RTCSessionDescriptionInit) => void,
    quality?: ScreenShareQuality,
  ) => Promise<void>;
  /** Stop screen sharing — removes tracks from PC and triggers renegotiation */
  stopScreenShare: (
    pc: RTCPeerConnection,
    sendOffer: (offer: RTCSessionDescriptionInit) => void,
  ) => void;
  /** Change quality on the fly (without stopping/restarting) */
  setQuality: (quality: ScreenShareQuality) => void;
  /**
   * Register a callback that fires when the browser's native "Stop sharing"
   * button ends the capture. ChatArea uses this to notify the remote peer
   * and update the screen-share store.
   */
  onStopped: (cb: (() => void) | null) => void;
  /**
   * Detach from the current PC without stopping the capture.
   * Call this on partner skip/leave to keep the browser capture alive.
   */
  detachFromPC: () => void;
  /**
   * Force-stop the screen capture entirely (no PC needed).
   * Called on full stop (user leaves chat) to kill the browser capture.
   */
  forceStopCapture: () => void;
  /**
   * Re-attach the existing capture to a new PC and renegotiate.
   * Returns true if tracks were re-added, false if no active capture.
   */
  reattachToPC: (
    pc: RTCPeerConnection,
    sendOffer: (offer: RTCSessionDescriptionInit) => void,
  ) => Promise<boolean>;
}

export function useScreenShare(): UseScreenShareResult {
  const [isSharing, setIsSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [hasAudio, setHasAudio] = useState(false);
  const [quality, setQualityState] = useState<ScreenShareQuality>("1080p");

  // Refs to track senders so we can remove them later
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const audioSenderRef = useRef<RTCRtpSender | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Guard against double-cleanup (browser "Stop sharing" + programmatic stop racing)
  const cleanupInFlightRef = useRef(false);

  // Generation counter: incremented on detach/reattach so old `ended`
  // event listeners (which captured a stale PC) become no-ops.
  const pcGenerationRef = useRef(0);

  // ── Debug stats interval ───────────────────────────────────────
  const debugIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatsRef = useRef<{
    bytesSent: number;
    ts: number;
    framesSent: number;
  } | null>(null);

  const startDebugStats = useCallback((pc: RTCPeerConnection) => {
    if (debugIntervalRef.current) clearInterval(debugIntervalRef.current);
    prevStatsRef.current = null;

    debugIntervalRef.current = setInterval(async () => {
      if (pc.connectionState === "closed") {
        if (debugIntervalRef.current) clearInterval(debugIntervalRef.current);
        return;
      }
      try {
        const stats = await pc.getStats();
        const now = performance.now();
        let outboundVideo: any = null;
        let outboundAudio: any = null;
        let candidatePair: any = null;
        let codec: any = null;
        let localCandidate: any = null;
        let remoteCandidate: any = null;

        stats.forEach((report: any) => {
          if (
            report.type === "outbound-rtp" &&
            report.kind === "video" &&
            report.bytesSent > 0
          ) {
            // Pick the screen share sender (highest bytesSent or contentType === 'screenshare')
            if (!outboundVideo || report.bytesSent > outboundVideo.bytesSent)
              outboundVideo = report;
          }
          if (report.type === "outbound-rtp" && report.kind === "audio") {
            outboundAudio = report;
          }
          if (
            report.type === "candidate-pair" &&
            report.state === "succeeded"
          ) {
            candidatePair = report;
          }
        });

        // Resolve codec
        if (outboundVideo?.codecId) {
          stats.forEach((r: any) => {
            if (r.id === outboundVideo.codecId) codec = r;
          });
        }
        // Resolve candidates
        if (candidatePair) {
          stats.forEach((r: any) => {
            if (r.id === candidatePair.localCandidateId) localCandidate = r;
            if (r.id === candidatePair.remoteCandidateId) remoteCandidate = r;
          });
        }

        const prev = prevStatsRef.current;
        const elapsed = prev ? (now - prev.ts) / 1000 : 0;

        const bitrateKbps =
          prev && elapsed > 0
            ? (((outboundVideo?.bytesSent ?? 0) - prev.bytesSent) * 8) /
              1000 /
              elapsed
            : 0;
        const fpsSent =
          prev && elapsed > 0
            ? ((outboundVideo?.framesSent ?? 0) - prev.framesSent) / elapsed
            : 0;

        prevStatsRef.current = {
          bytesSent: outboundVideo?.bytesSent ?? 0,
          ts: now,
          framesSent: outboundVideo?.framesSent ?? 0,
        };

        const videoTrack = streamRef.current?.getVideoTracks()[0];
        const settings = videoTrack?.getSettings();

        console.log(
          "%c[ScreenShare SENDER Stats]",
          "color: #00ff88; font-weight: bold",
          {
            capture: settings
              ? `${settings.width}x${settings.height}@${settings.frameRate?.toFixed(1)}fps`
              : "N/A",
            encoded: outboundVideo
              ? `${outboundVideo.frameWidth ?? "?"}x${outboundVideo.frameHeight ?? "?"}`
              : "N/A",
            codec: codec
              ? `${codec.mimeType} (${codec.clockRate}Hz)`
              : "unknown",
            bitrate: `${bitrateKbps.toFixed(0)} kbps`,
            fpsSent: fpsSent.toFixed(1),
            framesEncoded: outboundVideo?.framesEncoded,
            keyFrames: outboundVideo?.keyFramesEncoded,
            qpSum: outboundVideo?.qpSum,
            totalEncodeTime: outboundVideo?.totalEncodeTime?.toFixed(2) + "s",
            avgEncodeMs: outboundVideo?.framesEncoded
              ? (
                  (outboundVideo.totalEncodeTime /
                    outboundVideo.framesEncoded) *
                  1000
                ).toFixed(1) + "ms"
              : "N/A",
            qualityLimit: outboundVideo?.qualityLimitationReason ?? "none",
            qualityDurations: outboundVideo?.qualityLimitationDurations,
            nackCount: outboundVideo?.nackCount,
            pliCount: outboundVideo?.pliCount,
            firCount: outboundVideo?.firCount,
            retransmitted: outboundVideo?.retransmittedBytesSent,
            packetsSent: outboundVideo?.packetsSent,
            rtt: candidatePair
              ? `${(candidatePair.currentRoundTripTime * 1000).toFixed(0)}ms`
              : "N/A",
            transport: localCandidate
              ? `${localCandidate.candidateType}(${localCandidate.protocol}) → ${remoteCandidate?.candidateType}(${remoteCandidate?.protocol})`
              : "N/A",
            bytesSent: outboundVideo?.bytesSent,
          },
        );
      } catch (e) {
        console.warn("[ScreenShare SENDER Stats] Error:", e);
      }
    }, 2000);
  }, []);

  const stopDebugStats = useCallback(() => {
    if (debugIntervalRef.current) {
      clearInterval(debugIntervalRef.current);
      debugIntervalRef.current = null;
    }
    prevStatsRef.current = null;
  }, []);

  // Callback for when the browser's native "Stop sharing" button ends capture.
  // ChatArea registers this to send ScreenShare=false to the remote peer.
  const onStoppedCallbackRef = useRef<(() => void) | null>(null);

  /**
   * Tune an RTCRtpSender's encoding parameters for screen share quality.
   */
  const tuneSender = useCallback(
    async (sender: RTCRtpSender, profile: QualityProfile) => {
      try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }

        params.encodings[0].maxBitrate = profile.maxBitrate;
        params.encodings[0].maxFramerate = profile.frameRate;
        params.encodings[0].priority = "high";
        params.encodings[0].networkPriority = "high";

        // degradationPreference lives on the params object, not an encoding
        params.degradationPreference =
          profile.degradationPreference as RTCDegradationPreference;

        // scalabilityMode is intentionally omitted here — setting it on a
        // non-SVC codec causes InvalidModificationError on Firefox and some
        // Chrome versions, and the 'L1T1' value gives no benefit over the
        // browser default for single-layer screen share.

        await sender.setParameters(params);
        console.log("[useScreenShare] Sender tuned successfully", {
          maxBitrate: profile.maxBitrate,
          frameRate: profile.frameRate,
          degradationPreference: params.degradationPreference,
        });
      } catch (err) {
        console.warn(
          "[useScreenShare] Failed to tune sender (full params):",
          err,
        );
        // Fallback: minimal parameters only — no scalabilityMode, no degradationPreference
        try {
          const fallbackParams = sender.getParameters();
          if (
            !fallbackParams.encodings ||
            fallbackParams.encodings.length === 0
          ) {
            fallbackParams.encodings = [{}];
          }
          fallbackParams.encodings[0].maxBitrate = profile.maxBitrate;
          fallbackParams.encodings[0].maxFramerate = Math.min(
            profile.frameRate,
            30,
          );
          fallbackParams.encodings[0].priority = "high";
          await sender.setParameters(fallbackParams);
          console.log("[useScreenShare] Fallback tuning succeeded");
        } catch (fallbackErr) {
          console.error(
            "[useScreenShare] Fallback tuning also failed:",
            fallbackErr,
          );
        }
      }
    },
    [],
  );

  /**
   * Start screen sharing.
   *
   * 1. Capture via getDisplayMedia
   * 2. Set contentHint on tracks
   * 3. addTrack to the existing peer connection
   * 4. Tune encoding parameters
   * 5. Create a new offer (renegotiation) and send it
   */
  const startScreenShare = useCallback(
    async (
      pc: RTCPeerConnection,
      sendOffer: (offer: RTCSessionDescriptionInit) => void,
      qualityPreset: ScreenShareQuality = "1080p",
    ) => {
      if (streamRef.current) {
        console.warn("[useScreenShare] Already sharing — stop first");
        return;
      }

      const profile = QUALITY_PROFILES[qualityPreset];

      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: profile.width },
            height: { ideal: profile.height },
            frameRate: { ideal: profile.frameRate },
          },
          audio: SYSTEM_AUDIO_CONSTRAINTS as any,
        });

        streamRef.current = stream;
        setScreenStream(stream);
        setQualityState(qualityPreset);

        // Guard: the PC may have been closed between the user clicking
        // "Share" and getDisplayMedia resolving (user spent time in the
        // browser's screen picker dialog).
        if (pc.signalingState === "closed") {
          console.warn(
            "[useScreenShare] PC closed while picker was open — aborting",
          );
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          setScreenStream(null);
          throw new Error(
            "RTCPeerConnection closed during screen share picker",
          );
        }

        // ── Video track ──────────────────────────────────────────────
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.contentHint = profile.contentHint;

          const sender = pc.addTrack(videoTrack, stream);
          videoSenderRef.current = sender;

          // ── Prefer VP9 for screen share ─────────────────────────────
          // VP9 is significantly better than H.264 for screen content
          // (text, UI, static regions) — higher quality at lower bitrate,
          // fewer keyframe artifacts, and lower perceived latency.
          // setCodecPreferences must be called before createOffer so the SDP
          // negotiation reflects our preference. Falls back gracefully if VP9
          // is unavailable on the browser/platform.
          try {
            const transceivers = pc.getTransceivers();
            const videoTransceiver = transceivers.find(
              (t) => t.sender === sender,
            );
            if (
              videoTransceiver &&
              typeof RTCRtpSender.getCapabilities === "function" &&
              typeof videoTransceiver.setCodecPreferences === "function"
            ) {
              const caps = RTCRtpSender.getCapabilities("video");
              if (caps && caps.codecs.length > 0) {
                // Sort: VP9 first, then AV1, then H.264, then everything else
                const vp9 = caps.codecs.filter(
                  (c) => c.mimeType.toLowerCase() === "video/vp9",
                );
                const av1 = caps.codecs.filter(
                  (c) => c.mimeType.toLowerCase() === "video/av1",
                );
                const h264 = caps.codecs.filter(
                  (c) => c.mimeType.toLowerCase() === "video/h264",
                );
                const others = caps.codecs.filter((c) => {
                  const m = c.mimeType.toLowerCase();
                  return (
                    m !== "video/vp9" && m !== "video/av1" && m !== "video/h264"
                  );
                });
                const preferred = [...vp9, ...av1, ...h264, ...others];
                if (preferred.length > 0) {
                  videoTransceiver.setCodecPreferences(preferred);
                  console.log(
                    "[useScreenShare] Codec preference set: VP9 → AV1 → H.264",
                  );
                }
              }
            }
          } catch (codecErr) {
            // Non-fatal — browser will pick its own codec
            console.warn(
              "[useScreenShare] Could not set codec preferences:",
              codecErr,
            );
          }

          // Tune encoding after a short delay — some browsers need the
          // transceiver to settle before setParameters works.
          // Use requestAnimationFrame + setTimeout combo: rAF ensures we're
          // past the current microtask queue, setTimeout lets the transceiver
          // fully register before we read/write parameters.
          requestAnimationFrame(() =>
            setTimeout(() => tuneSender(sender, profile), 50),
          );

          // When the user clicks "Stop sharing" in the browser's native UI
          const gen = pcGenerationRef.current;
          videoTrack.addEventListener("ended", () => {
            console.log(
              "[useScreenShare] Video track ended (user stopped via browser UI)",
            );
            // Stale listener from a detached PC — ignore
            if (gen !== pcGenerationRef.current) {
              console.log(
                "[useScreenShare] Stale ended listener (gen",
                gen,
                "!= current",
                pcGenerationRef.current,
                ") — skipping",
              );
              return;
            }
            // Guard: if stopScreenShare() already ran, skip to avoid double cleanup
            if (cleanupInFlightRef.current) {
              console.log(
                "[useScreenShare] Cleanup already in flight — skipping duplicate",
              );
              return;
            }
            cleanupInFlightRef.current = true;
            // Snapshot refs before cleanup nulls them
            const vSender = videoSenderRef.current;
            const aSender = audioSenderRef.current;
            _cleanupStream();
            _removeTracksFromPC(pc, sendOffer, vSender, aSender);
            // Notify ChatArea so it can send ScreenShare=false to the remote peer
            // and update the screen-share store.
            if (onStoppedCallbackRef.current) {
              try {
                onStoppedCallbackRef.current();
              } catch (_) {
                /* non-critical */
              }
            }
            // Reset guard after a tick so future shares work
            setTimeout(() => {
              cleanupInFlightRef.current = false;
            }, 0);
          });
        }

        // ── Audio track (system audio) ───────────────────────────────
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.contentHint = "music";
          const sender = pc.addTrack(audioTrack, stream);
          audioSenderRef.current = sender;
          setHasAudio(true);

          // Tune audio for high quality stereo
          try {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}];
            }
            params.encodings[0].maxBitrate = 128_000; // 128kbps stereo
            params.encodings[0].priority = "high";
            params.encodings[0].networkPriority = "high";
            await sender.setParameters(params);
          } catch (err) {
            console.warn("[useScreenShare] Failed to tune audio sender:", err);
          }
        } else {
          setHasAudio(false);
        }

        // ── Renegotiate ─────────────────────────────────────────────
        // Only create an offer if signaling state is stable.
        if (pc.signalingState === "stable") {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendOffer(offer);
        } else {
          console.warn(
            "[useScreenShare] Deferring renegotiation — signalingState:",
            pc.signalingState,
          );
        }

        setIsSharing(true);
        console.log(
          "[useScreenShare] Started sharing:",
          qualityPreset,
          audioTrack ? "(with audio)" : "(no audio)",
        );

        // ── Start debug stats logger ─────────────────────────────
        startDebugStats(pc);
      } catch (err: any) {
        // User cancelled the picker
        if (err.name === "NotAllowedError" || err.name === "AbortError") {
          console.log("[useScreenShare] User cancelled screen share picker");
          return;
        }
        console.error("[useScreenShare] Failed to start screen share:", err);
        throw err;
      }
    },
    [tuneSender],
  );

  /**
   * Remove screen share senders from the PC and renegotiate.
   * Accepts explicit sender refs because _cleanupStream may have already
   * nulled the instance refs by the time this runs.
   */
  const _removeTracksFromPC = useCallback(
    async (
      pc: RTCPeerConnection,
      sendOffer: (offer: RTCSessionDescriptionInit) => void,
      videoSender: RTCRtpSender | null,
      audioSender: RTCRtpSender | null,
    ) => {
      try {
        if (videoSender) {
          try {
            pc.removeTrack(videoSender);
          } catch (_) {
            /* already removed */
          }
        }
        if (audioSender) {
          try {
            pc.removeTrack(audioSender);
          } catch (_) {
            /* already removed */
          }
        }

        // Renegotiate to inform remote peer.
        // Guard: only create an offer when the signaling state allows it.
        // If we're in 'have-local-offer' or 'have-remote-offer', a concurrent
        // renegotiation is already in-flight — skip to avoid InvalidStateError.
        if (pc.signalingState === "stable") {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendOffer(offer);
        } else if (pc.signalingState !== "closed") {
          console.warn(
            "[useScreenShare] Skipping renegotiation — signalingState:",
            pc.signalingState,
          );
        }
      } catch (err) {
        console.error(
          "[useScreenShare] Failed to remove tracks and renegotiate:",
          err,
        );
      }
    },
    [],
  );

  const _cleanupStream = useCallback(() => {
    stopDebugStats();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScreenStream(null);
    setIsSharing(false);
    setHasAudio(false);
    videoSenderRef.current = null;
    audioSenderRef.current = null;
  }, [stopDebugStats]);

  /**
   * Stop screen sharing — removes tracks from the PC and renegotiates.
   * IMPORTANT: Snapshot sender refs BEFORE cleanup nullifies them.
   */
  const stopScreenShare = useCallback(
    (
      pc: RTCPeerConnection,
      sendOffer: (offer: RTCSessionDescriptionInit) => void,
    ) => {
      console.log("[useScreenShare] Stopping screen share");
      // Guard against double cleanup (browser "Stop sharing" may have already fired)
      if (cleanupInFlightRef.current) {
        console.log(
          "[useScreenShare] Cleanup already in flight — skipping duplicate stopScreenShare",
        );
        return;
      }
      cleanupInFlightRef.current = true;
      // Snapshot refs before _cleanupStream nulls them
      const vSender = videoSenderRef.current;
      const aSender = audioSenderRef.current;
      _cleanupStream();
      _removeTracksFromPC(pc, sendOffer, vSender, aSender);
      // Reset guard after a tick
      setTimeout(() => {
        cleanupInFlightRef.current = false;
      }, 0);
    },
    [_cleanupStream, _removeTracksFromPC],
  );

  /**
   * Change quality on-the-fly — retunes the existing sender without
   * stopping the capture.
   */
  const setQuality = useCallback(
    (newQuality: ScreenShareQuality) => {
      setQualityState(newQuality);
      const profile = QUALITY_PROFILES[newQuality];

      if (videoSenderRef.current) {
        tuneSender(videoSenderRef.current, profile);
      }

      // Also apply constraints to the live track for resolution changes
      const videoTrack = streamRef.current?.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.contentHint = profile.contentHint;
        videoTrack
          .applyConstraints({
            width: { ideal: profile.width },
            height: { ideal: profile.height },
            frameRate: { ideal: profile.frameRate },
          })
          .catch((err) =>
            console.warn("[useScreenShare] Failed to apply constraints:", err),
          );
      }
    },
    [tuneSender],
  );

  const onStopped = useCallback((cb: (() => void) | null) => {
    onStoppedCallbackRef.current = cb;
  }, []);

  /**
   * Detach screen share from the old PC without stopping the capture.
   * Called when a partner skips so the browser capture stays alive but
   * the orphaned sender refs are cleared.
   */
  const detachFromPC = useCallback(() => {
    console.log("[useScreenShare] Detaching from PC (keeping capture alive)");
    stopDebugStats();
    // Bump generation so old `ended` listeners become stale no-ops
    pcGenerationRef.current++;
    videoSenderRef.current = null;
    audioSenderRef.current = null;
    // Reset the double-cleanup guard — the old PC is gone, so the
    // ended listener closure (which captured the OLD PC) is dead.
    cleanupInFlightRef.current = false;
  }, [stopDebugStats]);

  /**
   * Force-stop the screen capture entirely (no PC needed).
   * Called on full stop (user leaves chat) to kill the browser capture.
   */
  const forceStopCapture = useCallback(() => {
    console.log("[useScreenShare] Force-stopping capture");
    _cleanupStream();
  }, [_cleanupStream]);

  /**
   * Re-attach the existing screen capture to a brand-new PC.
   * Called automatically when a new match connects while local screen
   * sharing was already active.
   *
   * Returns `true` if tracks were re-added, `false` if no active capture.
   */
  const reattachToPC = useCallback(
    async (
      pc: RTCPeerConnection,
      sendOffer: (offer: RTCSessionDescriptionInit) => void,
    ): Promise<boolean> => {
      const stream = streamRef.current;
      if (!stream || !isSharing) {
        console.log(
          "[useScreenShare] reattachToPC: no active capture — skipping",
        );
        return false;
      }

      // Verify tracks are still alive
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack || videoTrack.readyState !== "live") {
        console.warn(
          "[useScreenShare] reattachToPC: video track ended — cleaning up",
        );
        _cleanupStream();
        return false;
      }

      console.log("[useScreenShare] Re-attaching screen share to new PC");
      const profile = QUALITY_PROFILES[quality];

      // ── Video track ──────────────────────────────────────────
      const existingTrackIds = new Set(
        pc
          .getSenders()
          .map((s) => s.track?.id)
          .filter(Boolean),
      );

      if (!existingTrackIds.has(videoTrack.id)) {
        videoTrack.contentHint = profile.contentHint;
        const sender = pc.addTrack(videoTrack, stream);
        videoSenderRef.current = sender;
        setTimeout(() => tuneSender(sender, profile), 200);
      }

      // Wire up the browser "Stop sharing" listener for the NEW PC.
      // The generation counter ensures old listeners from previous PCs are ignored.
      const gen = pcGenerationRef.current;
      videoTrack.addEventListener("ended", () => {
        console.log(
          "[useScreenShare] Video track ended (browser Stop Sharing) — reattached PC context",
        );
        if (gen !== pcGenerationRef.current) {
          console.log(
            "[useScreenShare] Stale ended listener (gen",
            gen,
            "!= current",
            pcGenerationRef.current,
            ") — skipping",
          );
          return;
        }
        if (cleanupInFlightRef.current) return;
        cleanupInFlightRef.current = true;
        const vSender = videoSenderRef.current;
        const aSender = audioSenderRef.current;
        _cleanupStream();
        _removeTracksFromPC(pc, sendOffer, vSender, aSender);
        if (onStoppedCallbackRef.current) {
          try {
            onStoppedCallbackRef.current();
          } catch (_) {
            /* non-critical */
          }
        }
        setTimeout(() => {
          cleanupInFlightRef.current = false;
        }, 0);
      });

      // ── Audio track (system audio) ───────────────────────────
      const audioTrack = stream.getAudioTracks()[0];
      if (
        audioTrack &&
        audioTrack.readyState === "live" &&
        !existingTrackIds.has(audioTrack.id)
      ) {
        audioTrack.contentHint = "music";
        const sender = pc.addTrack(audioTrack, stream);
        audioSenderRef.current = sender;
        try {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0)
            params.encodings = [{}];
          params.encodings[0].maxBitrate = 128_000;
          params.encodings[0].priority = "high";
          params.encodings[0].networkPriority = "high";
          await sender.setParameters(params);
        } catch (err) {
          console.warn(
            "[useScreenShare] reattach: Failed to tune audio sender:",
            err,
          );
        }
      }

      // ── Renegotiate ─────────────────────────────────────────
      if (pc.signalingState === "stable") {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendOffer(offer);
        } catch (err) {
          console.warn("[useScreenShare] reattach: renegotiation failed:", err);
        }
      }

      // Restart debug stats for the new PC
      startDebugStats(pc);

      console.log(
        "[useScreenShare] Successfully re-attached screen share to new PC",
      );
      return true;
    },
    [
      isSharing,
      quality,
      tuneSender,
      _cleanupStream,
      _removeTracksFromPC,
      startDebugStats,
    ],
  );

  return {
    isSharing,
    screenStream,
    hasAudio,
    quality,
    startScreenShare,
    stopScreenShare,
    setQuality,
    onStopped,
    detachFromPC,
    forceStopCapture,
    reattachToPC,
  };
}
