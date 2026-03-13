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

export interface AdaptiveBitrateStats {
  targetBitrate: number | null;
  lossRate: number | null;
  rttMs: number | null;
}

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
    maxBitrate: 2_000_000,
    contentHint: "detail",
    degradationPreference: "maintain-framerate",
  },
  "1080p": {
    width: 1920,
    height: 1080,
    frameRate: 30,
    maxBitrate: 4_000_000,
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
  adaptiveBitrateEnabled: boolean;
  setAdaptiveBitrateEnabled: (enabled: boolean) => void;
  adaptiveBitrateStats: AdaptiveBitrateStats;
  /** Start screen sharing — adds tracks to the given PC and triggers renegotiation */
  startScreenShare: (
    pc: RTCPeerConnection,
    requestRenegotiation: () => Promise<void>,
    quality?: ScreenShareQuality,
  ) => Promise<void>;
  /** Stop screen sharing — removes tracks from PC and triggers renegotiation */
  stopScreenShare: (
    pc: RTCPeerConnection,
    requestRenegotiation: () => Promise<void>,
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
    requestRenegotiation: () => Promise<void>,
  ) => Promise<boolean>;
}

export function useScreenShare(): UseScreenShareResult {
  const [isSharing, setIsSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [hasAudio, setHasAudio] = useState(false);
  const [quality, setQualityState] = useState<ScreenShareQuality>("720p");
  const [adaptiveBitrateEnabled, setAdaptiveBitrateEnabledState] = useState(true);
  const [adaptiveBitrateStats, setAdaptiveBitrateStats] = useState<AdaptiveBitrateStats>({
    targetBitrate: null,
    lossRate: null,
    rttMs: null,
  });

  // Refs to track senders so we can remove them later
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const audioSenderRef = useRef<RTCRtpSender | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activePcRef = useRef<RTCPeerConnection | null>(null);
  const renegotiateRef = useRef<(() => Promise<void>) | null>(null);
  const healthIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recoveryInFlightRef = useRef(false);
  const recoveryAttemptsRef = useRef(0);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastVideoActiveAtRef = useRef<number>(Date.now());
  const lastAudioActiveAtRef = useRef<number>(Date.now());
  const qualityRef = useRef<ScreenShareQuality>("720p");
  const healthListenersRef = useRef<{
    video?: { track: MediaStreamTrack; onMute: () => void; onUnmute: () => void };
    audio?: { track: MediaStreamTrack; onMute: () => void; onUnmute: () => void };
  } | null>(null);

  // Guard against double-cleanup (browser "Stop sharing" + programmatic stop racing)
  const cleanupInFlightRef = useRef(false);
  const startInFlightRef = useRef(false);

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
  const prevRemoteStatsRef = useRef<{
    packetsLost: number;
    packetsReceived: number;
    ts: number;
  } | null>(null);
  const adaptiveBitrateRef = useRef<number | null>(null);
  const lastBitrateUpdateRef = useRef<number>(0);

  const startDebugStats = useCallback(
    (pc: RTCPeerConnection) => {
      if (debugIntervalRef.current) clearInterval(debugIntervalRef.current);
      prevStatsRef.current = null;
      prevRemoteStatsRef.current = null;

    debugIntervalRef.current = setInterval(async () => {
      if (pc.connectionState === "closed") {
        if (debugIntervalRef.current) clearInterval(debugIntervalRef.current);
        return;
      }
      try {
        const stats = await pc.getStats();
        const now = performance.now();
        let outboundVideo: any = null;
        let remoteInboundVideo: any = null;
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
          if (
            report.type === "remote-inbound-rtp" &&
            report.kind === "video"
          ) {
            if (
              !remoteInboundVideo ||
              report.packetsReceived > remoteInboundVideo.packetsReceived
            ) {
              remoteInboundVideo = report;
            }
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

        let lossRateValue: number | null = null;
        let rttMsValue: number | null = null;
        if (videoSenderRef.current) {
          const profile = QUALITY_PROFILES[quality];
          const minBitrate = Math.max(400_000, Math.floor(profile.maxBitrate * 0.35));
          const maxBitrate = profile.maxBitrate;
          const nowTs = performance.now();
          const prevRemote = prevRemoteStatsRef.current;
          const currentPacketsLost = remoteInboundVideo?.packetsLost ?? 0;
          const currentPacketsReceived = remoteInboundVideo?.packetsReceived ?? 0;
          const rtt = remoteInboundVideo?.roundTripTime ?? candidatePair?.currentRoundTripTime ?? 0;
          const elapsedRemote = prevRemote ? (nowTs - prevRemote.ts) / 1000 : 0;
          const lostDelta =
            prevRemote && elapsedRemote > 0
              ? Math.max(0, currentPacketsLost - prevRemote.packetsLost)
              : 0;
          const recvDelta =
            prevRemote && elapsedRemote > 0
              ? Math.max(0, currentPacketsReceived - prevRemote.packetsReceived)
              : 0;
          const lossRate = recvDelta > 0 ? lostDelta / recvDelta : 0;
          lossRateValue = lossRate;
          rttMsValue = rtt > 0 ? rtt * 1000 : null;
          prevRemoteStatsRef.current = {
            packetsLost: currentPacketsLost,
            packetsReceived: currentPacketsReceived,
            ts: nowTs,
          };

          let target = adaptiveBitrateRef.current ?? maxBitrate;
          if (adaptiveBitrateEnabled) {
            if (lossRate > 0.03 || rtt > 0.35) {
              target = Math.max(minBitrate, Math.floor(target * 0.85));
            } else if (lossRate < 0.01 && rtt > 0 && rtt < 0.2) {
              target = Math.min(maxBitrate, Math.floor(target * 1.08));
            }
          } else {
            target = maxBitrate;
          }

          const elapsedSinceUpdate = nowTs - lastBitrateUpdateRef.current;
          const currentTarget = adaptiveBitrateRef.current ?? maxBitrate;
          const shouldForce = !adaptiveBitrateEnabled && currentTarget !== maxBitrate;
          if (
            elapsedSinceUpdate > 1500 &&
            (shouldForce || Math.abs(target - currentTarget) > maxBitrate * 0.05)
          ) {
            adaptiveBitrateRef.current = target;
            lastBitrateUpdateRef.current = nowTs;
            try {
              const params = videoSenderRef.current.getParameters();
              if (!params.encodings || params.encodings.length === 0) {
                params.encodings = [{}];
              }
              params.encodings[0].maxBitrate = target;
              params.encodings[0].maxFramerate = profile.frameRate;
              params.encodings[0].priority = "high";
              params.encodings[0].networkPriority = "high";
              params.degradationPreference =
                profile.degradationPreference as RTCDegradationPreference;
              await videoSenderRef.current.setParameters(params);
            } catch {
            }
          }
        }

        setAdaptiveBitrateStats({
          targetBitrate: adaptiveBitrateRef.current ?? null,
          lossRate: lossRateValue,
          rttMs: rttMsValue,
        });

        if (import.meta.env.DEV) {
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
              lossRate:
                lossRateValue !== null
                  ? `${(lossRateValue * 100).toFixed(2)}%`
                  : "N/A",
            },
          );
        }
      } catch (e) {
        console.warn("[ScreenShare SENDER Stats] Error:", e);
      }
    }, 2000);
  },
    [quality, adaptiveBitrateEnabled],
  );

  const stopDebugStats = useCallback(() => {
    if (debugIntervalRef.current) {
      clearInterval(debugIntervalRef.current);
      debugIntervalRef.current = null;
    }
    prevStatsRef.current = null;
    prevRemoteStatsRef.current = null;
    adaptiveBitrateRef.current = null;
    lastBitrateUpdateRef.current = 0;
    setAdaptiveBitrateStats({
      targetBitrate: null,
      lossRate: null,
      rttMs: null,
    });
  }, []);

  const stopHealthMonitor = useCallback(() => {
    if (healthIntervalRef.current) {
      clearInterval(healthIntervalRef.current);
      healthIntervalRef.current = null;
    }
    if (healthListenersRef.current?.video) {
      const { track, onMute, onUnmute } = healthListenersRef.current.video;
      track.removeEventListener("mute", onMute);
      track.removeEventListener("unmute", onUnmute);
    }
    if (healthListenersRef.current?.audio) {
      const { track, onMute, onUnmute } = healthListenersRef.current.audio;
      track.removeEventListener("mute", onMute);
      track.removeEventListener("unmute", onUnmute);
    }
    healthListenersRef.current = null;
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
    recoveryAttemptsRef.current = 0;
    recoveryInFlightRef.current = false;
  }, []);

  const recoverCapture = async (reason: string) => {
    if (recoveryInFlightRef.current) return;
    const pc = activePcRef.current;
    const requestRenegotiation = renegotiateRef.current;
    if (!pc || !requestRenegotiation) return;
    recoveryInFlightRef.current = true;
    try {
      const profile = QUALITY_PROFILES[qualityRef.current];
      const newStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: profile.width },
          height: { ideal: profile.height },
          frameRate: { ideal: profile.frameRate },
        },
        audio: SYSTEM_AUDIO_CONSTRAINTS as any,
      });
      const oldStream = streamRef.current;
      pcGenerationRef.current++;
      streamRef.current = newStream;
      setScreenStream(newStream);
      setQualityState(qualityRef.current);

      const newVideo = newStream.getVideoTracks()[0];
      const newAudio = newStream.getAudioTracks()[0];
      if (newVideo) {
        newVideo.contentHint = profile.contentHint;
        if (videoSenderRef.current) {
          await videoSenderRef.current.replaceTrack(newVideo);
        } else {
          videoSenderRef.current = pc.addTrack(newVideo, newStream);
        }
        requestAnimationFrame(() =>
          setTimeout(() => {
            if (videoSenderRef.current) {
              tuneSender(videoSenderRef.current, profile);
            }
          }, 50),
        );
      }
      if (newAudio) {
        newAudio.contentHint = "music";
        if (audioSenderRef.current) {
          await audioSenderRef.current.replaceTrack(newAudio);
        } else {
          audioSenderRef.current = pc.addTrack(newAudio, newStream);
        }
        try {
          const params = audioSenderRef.current?.getParameters();
          if (params) {
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}];
            }
            params.encodings[0].maxBitrate = 128_000;
            params.encodings[0].priority = "high";
            params.encodings[0].networkPriority = "high";
            await audioSenderRef.current?.setParameters(params);
          }
        } catch (err) {
          console.warn("[useScreenShare] Failed to tune audio sender:", err);
        }
      }
      setHasAudio(!!newAudio);
      attachHealthMonitor(newVideo, newAudio);
      if (oldStream) {
        oldStream.getTracks().forEach((t) => t.stop());
      }
      await requestRenegotiation();
      setIsSharing(true);
      recoveryAttemptsRef.current = 0;
      console.log("[useScreenShare] Recovery succeeded:", reason);
    } catch (err: any) {
      if (err?.name === "NotAllowedError" || err?.name === "AbortError") {
        console.warn("[useScreenShare] Recovery cancelled by user:", reason);
      } else {
        console.warn("[useScreenShare] Recovery failed:", reason, err);
      }
    } finally {
      recoveryInFlightRef.current = false;
    }
  };

  const scheduleRecovery = (reason: string) => {
    if (recoveryInFlightRef.current || recoveryTimerRef.current) return;
    if (recoveryAttemptsRef.current >= 3) {
      console.warn("[useScreenShare] Recovery attempts exhausted:", reason);
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, recoveryAttemptsRef.current), 8000);
    recoveryAttemptsRef.current += 1;
    recoveryTimerRef.current = setTimeout(() => {
      recoveryTimerRef.current = null;
      recoverCapture(reason);
    }, delay);
  };

  const attachHealthMonitor = (videoTrack?: MediaStreamTrack, audioTrack?: MediaStreamTrack) => {
    lastVideoActiveAtRef.current = Date.now();
    lastAudioActiveAtRef.current = Date.now();
    if (healthListenersRef.current?.video) {
      const { track, onMute, onUnmute } = healthListenersRef.current.video;
      track.removeEventListener("mute", onMute);
      track.removeEventListener("unmute", onUnmute);
    }
    if (healthListenersRef.current?.audio) {
      const { track, onMute, onUnmute } = healthListenersRef.current.audio;
      track.removeEventListener("mute", onMute);
      track.removeEventListener("unmute", onUnmute);
    }
    healthListenersRef.current = null;
    if (videoTrack) {
      const onUnmute = () => {
        lastVideoActiveAtRef.current = Date.now();
      };
      const onMute = () => {
        lastVideoActiveAtRef.current = Date.now();
      };
      videoTrack.addEventListener("unmute", onUnmute);
      videoTrack.addEventListener("mute", onMute);
      healthListenersRef.current = {
        ...(healthListenersRef.current ?? {}),
        video: { track: videoTrack, onMute, onUnmute },
      };
    }
    if (audioTrack) {
      const onUnmute = () => {
        lastAudioActiveAtRef.current = Date.now();
      };
      const onMute = () => {
        lastAudioActiveAtRef.current = Date.now();
      };
      audioTrack.addEventListener("unmute", onUnmute);
      audioTrack.addEventListener("mute", onMute);
      healthListenersRef.current = {
        ...(healthListenersRef.current ?? {}),
        audio: { track: audioTrack, onMute, onUnmute },
      };
    }
    if (healthIntervalRef.current) clearInterval(healthIntervalRef.current);
    healthIntervalRef.current = setInterval(() => {
      if (!isSharing || cleanupInFlightRef.current) return;
      const now = Date.now();
      if (videoTrack) {
        if (videoTrack.readyState !== "live") {
          scheduleRecovery("video-track-ended");
        } else if (videoTrack.muted && now - lastVideoActiveAtRef.current > 2000) {
          scheduleRecovery("video-track-muted");
        }
      }
      if (audioTrack) {
        if (audioTrack.readyState !== "live") {
          scheduleRecovery("audio-track-ended");
        } else if (audioTrack.muted && now - lastAudioActiveAtRef.current > 2000) {
          scheduleRecovery("audio-track-muted");
        }
      }
    }, 1500);
  };

  const setAdaptiveBitrateEnabled = useCallback(
    (enabled: boolean) => {
      setAdaptiveBitrateEnabledState(enabled);
      const profile = QUALITY_PROFILES[quality];
      if (!enabled) {
        adaptiveBitrateRef.current = profile.maxBitrate;
        lastBitrateUpdateRef.current = 0;
        const sender = videoSenderRef.current;
        if (sender) {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          params.encodings[0].maxBitrate = profile.maxBitrate;
          params.encodings[0].maxFramerate = profile.frameRate;
          params.encodings[0].priority = "high";
          params.encodings[0].networkPriority = "high";
          params.degradationPreference =
            profile.degradationPreference as RTCDegradationPreference;
          sender.setParameters(params).catch(() => { });
        }
        setAdaptiveBitrateStats((prev) => ({
          ...prev,
          targetBitrate: profile.maxBitrate,
        }));
      }
    },
    [quality],
  );

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
      requestRenegotiation: () => Promise<void>,
      qualityPreset: ScreenShareQuality = "720p",
    ) => {
      if (streamRef.current) {
        console.warn("[useScreenShare] Already sharing — stop first");
        return;
      }
      if (startInFlightRef.current) {
        console.warn("[useScreenShare] Start already in flight — skipping");
        return;
      }
      startInFlightRef.current = true;

      const profile = QUALITY_PROFILES[qualityPreset];
      adaptiveBitrateRef.current = profile.maxBitrate;
      lastBitrateUpdateRef.current = 0;
      setAdaptiveBitrateStats((prev) => ({
        ...prev,
        targetBitrate: profile.maxBitrate,
      }));
      qualityRef.current = qualityPreset;

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

        activePcRef.current = pc;
        renegotiateRef.current = requestRenegotiation;
        recoveryAttemptsRef.current = 0;

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
            _removeTracksFromPC(pc, requestRenegotiation, vSender, aSender);
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

        attachHealthMonitor(videoTrack, audioTrack);

        await requestRenegotiation();

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
      } finally {
        startInFlightRef.current = false;
      }
    },
    [attachHealthMonitor, tuneSender],
  );

  /**
   * Remove screen share senders from the PC and renegotiate.
   * Accepts explicit sender refs because _cleanupStream may have already
   * nulled the instance refs by the time this runs.
   */
  const _removeTracksFromPC = useCallback(
    async (
      pc: RTCPeerConnection,
      requestRenegotiation: () => Promise<void>,
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

        await requestRenegotiation();
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
    stopHealthMonitor();
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
    activePcRef.current = null;
    renegotiateRef.current = null;
  }, [stopDebugStats, stopHealthMonitor]);

  /**
   * Stop screen sharing — removes tracks from the PC and renegotiates.
   * IMPORTANT: Snapshot sender refs BEFORE cleanup nullifies them.
   */
  const stopScreenShare = useCallback(
    (
      pc: RTCPeerConnection,
      requestRenegotiation: () => Promise<void>,
    ) => {
      console.log("[useScreenShare] Stopping screen share");
      startInFlightRef.current = false;
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
      _removeTracksFromPC(pc, requestRenegotiation, vSender, aSender);
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
      qualityRef.current = newQuality;
      const profile = QUALITY_PROFILES[newQuality];
      adaptiveBitrateRef.current = profile.maxBitrate;
      lastBitrateUpdateRef.current = 0;
      setAdaptiveBitrateStats((prev) => ({
        ...prev,
        targetBitrate: profile.maxBitrate,
      }));

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
    stopHealthMonitor();
    stopDebugStats();
    // Bump generation so old `ended` listeners become stale no-ops
    pcGenerationRef.current++;
    videoSenderRef.current = null;
    audioSenderRef.current = null;
    activePcRef.current = null;
    renegotiateRef.current = null;
    // Reset the double-cleanup guard — the old PC is gone, so the
    // ended listener closure (which captured the OLD PC) is dead.
    cleanupInFlightRef.current = false;
  }, [stopDebugStats, stopHealthMonitor]);

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
      requestRenegotiation: () => Promise<void>,
    ): Promise<boolean> => {
      activePcRef.current = pc;
      renegotiateRef.current = requestRenegotiation;
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
        _removeTracksFromPC(pc, requestRenegotiation, vSender, aSender);
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

      attachHealthMonitor(videoTrack, audioTrack);
      await requestRenegotiation();

      // Restart debug stats for the new PC
      startDebugStats(pc);

      console.log(
        "[useScreenShare] Successfully re-attached screen share to new PC",
      );
      return true;
    },
    [
      attachHealthMonitor,
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
    adaptiveBitrateEnabled,
    setAdaptiveBitrateEnabled,
    adaptiveBitrateStats,
    startScreenShare,
    stopScreenShare,
    setQuality,
    onStopped,
    detachFromPC,
    forceStopCapture,
    reattachToPC,
  };
}
