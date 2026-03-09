/**
 * useVoiceChat — Manages mic audio track lifecycle on the RTCPeerConnection
 *
 * Architecture mirrors useScreenShare:
 *   - startMic: getUserMedia({ audio }) → pc.addTrack() → renegotiate
 *   - stopMic: pc.removeTrack() → stop tracks → renegotiate
 *   - detachFromPC: keep mic alive across partner skips
 *   - reattachToPC: re-add mic stream to new PC on next match
 *
 * Audio constraints are voice-optimized (echo cancellation, noise suppression)
 * unlike screen share's raw system audio.
 */

import { useCallback, useRef, useState } from 'react';
import { useVoiceChatStore } from '../stores/voiceChatStore';

// ── Voice-optimized audio constraints ───────────────────────────────
const VOICE_AUDIO_CONSTRAINTS = {
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: true },
    sampleRate: { ideal: 48000, max: 48000 },
    channelCount: { ideal: 1, max: 1 },
    latency: { ideal: 0.02 },
    suppressLocalAudioPlayback: true as any,
    googEchoCancellation: true as any,
    googAutoGainControl: true as any,
    googNoiseSuppression: true as any,
    googHighpassFilter: true as any,
    googTypingNoiseDetection: true as any,
    googAudioMirroring: false as any,
} as MediaTrackConstraints;

const BASIC_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48000,
};

export interface UseVoiceChatResult {
    isMicActive: boolean;
    startMic: (
        pc: RTCPeerConnection,
        sendOffer: (offer: RTCSessionDescriptionInit) => void,
    ) => Promise<void>;
    stopMic: (
        pc: RTCPeerConnection,
        sendOffer: (offer: RTCSessionDescriptionInit) => void,
    ) => void;
    /** Detach from PC without killing the mic (for partner skip) */
    detachFromPC: () => void;
    /** Force-stop the mic entirely */
    forceStopMic: () => void;
    /** Re-attach existing mic to a new PC and renegotiate */
    reattachToPC: (
        pc: RTCPeerConnection,
        sendOffer: (offer: RTCSessionDescriptionInit) => void,
    ) => Promise<boolean>;
}

export function useVoiceChat(): UseVoiceChatResult {
    const [isMicActive, setIsMicActive] = useState(false);

    const audioSenderRef = useRef<RTCRtpSender | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rawStreamRef = useRef<MediaStream | null>(null);
    const cleanupInFlightRef = useRef(false);
    const fallbackAttemptedRef = useRef(false);
    const disableTuningRef = useRef(false);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const inputRnnoiseNodeRef = useRef<AudioWorkletNode | null>(null);
    const inputHighPassRef = useRef<BiquadFilterNode | null>(null);
    const inputLowPassRef = useRef<BiquadFilterNode | null>(null);
    const inputCompressorRef = useRef<DynamicsCompressorNode | null>(null);
    const inputGainRef = useRef<GainNode | null>(null);
    const inputDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
    const inputAnalyserRef = useRef<AnalyserNode | null>(null);
    const gateRafRef = useRef<number | null>(null);

    // Generation counter to invalidate stale event listeners across PC recreation
    const pcGenerationRef = useRef(0);

    const tuneAudioSender = useCallback(async (sender: RTCRtpSender) => {
        if (disableTuningRef.current) return;
        try {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
                params.encodings = [{}];
            }
            params.encodings[0].maxBitrate = 96_000;
            params.encodings[0].priority = 'high';
            params.encodings[0].networkPriority = 'high';
            await sender.setParameters(params);
        } catch (err: any) {
            if (err?.name === 'InvalidModificationError') {
                disableTuningRef.current = true;
                return;
            }
            console.warn('[useVoiceChat] Failed to tune audio sender:', err);
        }
    }, []);

    // ── Internal cleanup ──────────────────────────────────────────────
    const _cleanupStream = useCallback(() => {
        if (gateRafRef.current) {
            cancelAnimationFrame(gateRafRef.current);
            gateRafRef.current = null;
        }
        if (inputSourceRef.current) {
            try { inputSourceRef.current.disconnect(); } catch (_) { }
            inputSourceRef.current = null;
        }
        if (inputRnnoiseNodeRef.current) {
            try { inputRnnoiseNodeRef.current.port.postMessage({ type: 'destroy' }); } catch (_) { }
            try { inputRnnoiseNodeRef.current.disconnect(); } catch (_) { }
            inputRnnoiseNodeRef.current = null;
        }
        if (inputHighPassRef.current) {
            try { inputHighPassRef.current.disconnect(); } catch (_) { }
            inputHighPassRef.current = null;
        }
        if (inputLowPassRef.current) {
            try { inputLowPassRef.current.disconnect(); } catch (_) { }
            inputLowPassRef.current = null;
        }
        if (inputCompressorRef.current) {
            try { inputCompressorRef.current.disconnect(); } catch (_) { }
            inputCompressorRef.current = null;
        }
        if (inputGainRef.current) {
            try { inputGainRef.current.disconnect(); } catch (_) { }
            inputGainRef.current = null;
        }
        if (inputAnalyserRef.current) {
            try { inputAnalyserRef.current.disconnect(); } catch (_) { }
            inputAnalyserRef.current = null;
        }
        if (inputDestinationRef.current) {
            try { inputDestinationRef.current.disconnect(); } catch (_) { }
            inputDestinationRef.current = null;
        }
        if (inputAudioContextRef.current) {
            try { inputAudioContextRef.current.close(); } catch (_) { }
            inputAudioContextRef.current = null;
        }
        if (rawStreamRef.current) {
            rawStreamRef.current.getTracks().forEach(t => t.stop());
            rawStreamRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setIsMicActive(false);
        audioSenderRef.current = null;
        fallbackAttemptedRef.current = false;
        disableTuningRef.current = false;
        useVoiceChatStore.getState().clearMic();
    }, []);

    const _removeTrackFromPC = useCallback(async (
        pc: RTCPeerConnection,
        sendOffer: (offer: RTCSessionDescriptionInit) => void,
        sender: RTCRtpSender | null,
    ) => {
        try {
            if (sender) {
                try { pc.removeTrack(sender); } catch (_) { /* already removed */ }
            }

            // Renegotiate if signaling state allows
            if (pc.signalingState === 'stable') {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                sendOffer(offer);
            } else if (pc.signalingState !== 'closed') {
                console.warn('[useVoiceChat] Skipping renegotiation — signalingState:', pc.signalingState);
            }
        } catch (err) {
            console.error('[useVoiceChat] Failed to remove track and renegotiate:', err);
        }
    }, []);

    // ── Start Mic ─────────────────────────────────────────────────────
    const startMic = useCallback(async (
        pc: RTCPeerConnection,
        sendOffer: (offer: RTCSessionDescriptionInit) => void,
    ) => {
        if (streamRef.current) {
            console.log('[useVoiceChat] Mic stream already exists, soft unmuting');
            const stream = streamRef.current;
            const audioTrack = stream.getAudioTracks()[0];
            if (!audioTrack) {
                console.error('[useVoiceChat] Existing mic stream has no audio track');
                _cleanupStream();
                return;
            }
            if (inputAudioContextRef.current && inputAudioContextRef.current.state === 'suspended') {
                inputAudioContextRef.current.resume().catch(() => { });
            }
            if (!gateRafRef.current && inputAnalyserRef.current && inputGainRef.current && inputAudioContextRef.current) {
                const analyser = inputAnalyserRef.current;
                const gain = inputGainRef.current;
                const ctx = inputAudioContextRef.current;
                const data = new Float32Array(analyser.fftSize);
                const updateGate = () => {
                    analyser.getFloatTimeDomainData(data);
                    let sum = 0;
                    for (let i = 0; i < data.length; i++) {
                        const v = data[i];
                        sum += v * v;
                    }
                    const rms = Math.sqrt(sum / data.length);
                    const target = rms > 0.02 ? 1.0 : 0.0;
                    gain.gain.setTargetAtTime(target, ctx.currentTime, 0.05);
                    gateRafRef.current = requestAnimationFrame(updateGate);
                };
                gateRafRef.current = requestAnimationFrame(updateGate);
            }

            audioTrack.enabled = true;
            setIsMicActive(true);
            useVoiceChatStore.getState().setMicOn(stream);

            const existingTrackIds = new Set(
                pc.getSenders().map(s => s.track?.id).filter(Boolean)
            );

            if (!existingTrackIds.has(audioTrack.id)) {
                const sender = pc.addTrack(audioTrack, stream);
                audioSenderRef.current = sender;
                await tuneAudioSender(sender);

                if (pc.signalingState === 'stable') {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    sendOffer(offer);
                } else {
                    console.warn('[useVoiceChat] Deferring renegotiation — signalingState:', pc.signalingState);
                }
            }

            return;
        }

        try {
            let stream = await navigator.mediaDevices.getUserMedia({
                audio: VOICE_AUDIO_CONSTRAINTS,
                video: false,
            });

            const audioTrackCandidate = stream.getAudioTracks()[0];
            if (!audioTrackCandidate || audioTrackCandidate.readyState !== 'live') {
                stream.getTracks().forEach(t => t.stop());
                if (!fallbackAttemptedRef.current) {
                    fallbackAttemptedRef.current = true;
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: BASIC_AUDIO_CONSTRAINTS,
                        video: false,
                    });
                }
            }

            rawStreamRef.current = stream;

            let processedStream: MediaStream | null = null;
            try {
                const AudioContextCtor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
                let context: AudioContext;
                try {
                    context = new AudioContextCtor({ sampleRate: 48000 });
                } catch (_) {
                    context = new AudioContextCtor();
                }
                const source = context.createMediaStreamSource(stream);
                let rnnoiseNode: AudioWorkletNode | null = null;
                try {
                    await context.audioWorklet.addModule(new URL('../worklets/rnnoiseProcessor.ts', import.meta.url));
                    rnnoiseNode = new AudioWorkletNode(context, 'rnnoise-processor', {
                        numberOfInputs: 1,
                        numberOfOutputs: 1,
                        channelCount: 1,
                        outputChannelCount: [1],
                    });
                    inputRnnoiseNodeRef.current = rnnoiseNode;
                } catch (_) {
                    rnnoiseNode = null;
                }
                const highPass = context.createBiquadFilter();
                highPass.type = 'highpass';
                highPass.frequency.value = 100;
                highPass.Q.value = 0.7;
                const lowPass = context.createBiquadFilter();
                lowPass.type = 'lowpass';
                lowPass.frequency.value = 8000;
                lowPass.Q.value = 0.7;
                const compressor = context.createDynamicsCompressor();
                compressor.threshold.value = -30;
                compressor.knee.value = 30;
                compressor.ratio.value = 8;
                compressor.attack.value = 0.003;
                compressor.release.value = 0.25;
                const gain = context.createGain();
                gain.gain.value = 0.0;
                const analyser = context.createAnalyser();
                analyser.fftSize = 2048;
                analyser.smoothingTimeConstant = 0.8;
                const destination = context.createMediaStreamDestination();

                if (rnnoiseNode) {
                    source.connect(rnnoiseNode);
                    rnnoiseNode.connect(highPass);
                } else {
                    source.connect(highPass);
                }
                highPass.connect(lowPass);
                lowPass.connect(compressor);
                compressor.connect(analyser);
                compressor.connect(gain);
                gain.connect(destination);

                inputAudioContextRef.current = context;
                inputSourceRef.current = source;
                inputHighPassRef.current = highPass;
                inputLowPassRef.current = lowPass;
                inputCompressorRef.current = compressor;
                inputGainRef.current = gain;
                inputAnalyserRef.current = analyser;
                inputDestinationRef.current = destination;
                processedStream = destination.stream;
                const data = new Float32Array(analyser.fftSize);
                const updateGate = () => {
                    analyser.getFloatTimeDomainData(data);
                    let sum = 0;
                    for (let i = 0; i < data.length; i++) {
                        const v = data[i];
                        sum += v * v;
                    }
                    const rms = Math.sqrt(sum / data.length);
                    const target = rms > 0.02 ? 1.0 : 0.0;
                    gain.gain.setTargetAtTime(target, context.currentTime, 0.05);
                    gateRafRef.current = requestAnimationFrame(updateGate);
                };
                gateRafRef.current = requestAnimationFrame(updateGate);
                if (context.state === 'suspended') {
                    context.resume().catch(() => { });
                }
            } catch (err) {
                processedStream = null;
            }

            streamRef.current = processedStream ?? stream;

            // Guard: PC may have closed during permission dialog
            if (pc.signalingState === 'closed') {
                console.warn('[useVoiceChat] PC closed while requesting mic — aborting');
                rawStreamRef.current?.getTracks().forEach(t => t.stop());
                rawStreamRef.current = null;
                streamRef.current = null;
                return;
            }

            const audioTrack = streamRef.current.getAudioTracks()[0];
            if (!audioTrack) {
                console.error('[useVoiceChat] No audio track from getUserMedia');
                streamRef.current = null;
                return;
            }

            // Add track to PC
            const sender = pc.addTrack(audioTrack, streamRef.current);
            audioSenderRef.current = sender;

            // Tune for voice quality
            await tuneAudioSender(sender);

            // Handle track ended (browser killed mic / user revoked permission)
            const gen = pcGenerationRef.current;
            audioTrack.addEventListener('ended', () => {
                console.log('[useVoiceChat] Audio track ended (browser/user stopped)');
                if (gen !== pcGenerationRef.current) return; // stale
                if (cleanupInFlightRef.current) return;
                cleanupInFlightRef.current = true;
                const senderSnapshot = audioSenderRef.current;
                _cleanupStream();
                _removeTrackFromPC(pc, sendOffer, senderSnapshot);
                setTimeout(() => { cleanupInFlightRef.current = false; }, 0);
            });

            // Renegotiate
            if (pc.signalingState === 'stable') {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                sendOffer(offer);
            } else {
                console.warn('[useVoiceChat] Deferring renegotiation — signalingState:', pc.signalingState);
            }

            setIsMicActive(true);
            useVoiceChatStore.getState().setMicOn(stream);
            console.log('[useVoiceChat] Mic started successfully');

        } catch (err: any) {
            if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
                console.log('[useVoiceChat] User denied mic permission');
                return;
            }
            console.error('[useVoiceChat] Failed to start mic:', err);
            throw err;
        }
    }, [_cleanupStream, _removeTrackFromPC, tuneAudioSender]);

    // ── Stop Mic ──────────────────────────────────────────────────────
    const stopMic = useCallback((
        pc: RTCPeerConnection,
        sendOffer: (offer: RTCSessionDescriptionInit) => void,
    ) => {
        console.log('[useVoiceChat] Stopping mic (soft mute)');
        if (streamRef.current) {
            streamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
        }
        setIsMicActive(false);
        useVoiceChatStore.getState().setMicOff();
    }, []);

    // ── Detach from PC (keep mic alive for next match) ────────────────
    const detachFromPC = useCallback(() => {
        console.log('[useVoiceChat] Detaching from PC (keeping mic alive)');
        pcGenerationRef.current++;
        audioSenderRef.current = null;
        cleanupInFlightRef.current = false;
    }, []);

    // ── Force stop ────────────────────────────────────────────────────
    const forceStopMic = useCallback(() => {
        console.log('[useVoiceChat] Force-stopping mic');
        _cleanupStream();
    }, [_cleanupStream]);

    // ── Reattach to new PC ────────────────────────────────────────────
    const reattachToPC = useCallback(async (
        pc: RTCPeerConnection,
        sendOffer: (offer: RTCSessionDescriptionInit) => void,
    ): Promise<boolean> => {
        const stream = streamRef.current;
        if (!stream) {
            console.log('[useVoiceChat] reattachToPC: no active mic stream — skipping');
            return false;
        }

        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack || audioTrack.readyState !== 'live') {
            console.warn('[useVoiceChat] reattachToPC: audio track ended — cleaning up');
            _cleanupStream();
            return false;
        }

        console.log('[useVoiceChat] Re-attaching mic to new PC');

        const existingTrackIds = new Set(
            pc.getSenders().map(s => s.track?.id).filter(Boolean)
        );

        if (!existingTrackIds.has(audioTrack.id)) {
            const sender = pc.addTrack(audioTrack, stream);
            audioSenderRef.current = sender;

            await tuneAudioSender(sender);
        }

        // Wire "ended" listener for the new PC generation
        const gen = pcGenerationRef.current;
        audioTrack.addEventListener('ended', () => {
            if (gen !== pcGenerationRef.current) return;
            if (cleanupInFlightRef.current) return;
            cleanupInFlightRef.current = true;
            const senderSnapshot = audioSenderRef.current;
            _cleanupStream();
            _removeTrackFromPC(pc, sendOffer, senderSnapshot);
            setTimeout(() => { cleanupInFlightRef.current = false; }, 0);
        });

        // Renegotiate
        if (pc.signalingState === 'stable') {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                sendOffer(offer);
            } catch (err) {
                console.warn('[useVoiceChat] reattach: renegotiation failed:', err);
            }
        }

        console.log('[useVoiceChat] Successfully re-attached mic to new PC');
        return true;
    }, [isMicActive, _cleanupStream, _removeTrackFromPC, tuneAudioSender]);

    return {
        isMicActive,
        startMic,
        stopMic,
        detachFromPC,
        forceStopMic,
        reattachToPC,
    };
}
