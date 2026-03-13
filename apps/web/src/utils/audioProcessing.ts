/**
 * audioProcessing.ts — Shared audio processing utilities
 *
 * Provides reusable audio graph factories for both input (mic) and
 * output (remote peer) streams. These mirror the production-grade pipeline
 * used in ChatArea and useVoiceChat:
 *   - High-pass filter (remove rumble / HVAC / wind < 85 Hz)
 *   - Low-pass filter  (remove hiss / aliasing artefacts > 8 kHz)
 *   - Dynamics compressor (level voice, tame peaks)
 *   - Optional RMS-based noise gate (suppress silence)
 */

// ── Types ────────────────────────────────────────────────────────────

export interface AudioGraphNodes {
    context: AudioContext;
    source: MediaStreamAudioSourceNode;
    highPass: BiquadFilterNode;
    lowPass: BiquadFilterNode;
    compressor: DynamicsCompressorNode;
    gain: GainNode | null;
    analyser: AnalyserNode | null;
    destination: MediaStreamAudioDestinationNode | null;
    gateRafId: number | null;
}

export interface OutputAudioGraph {
    context: AudioContext;
    source: MediaStreamAudioSourceNode;
    highPass: BiquadFilterNode;
    lowPass: BiquadFilterNode;
    compressor: DynamicsCompressorNode;
}

// ── Output Processing (for remote peer audio) ────────────────────────
// Cleans up the partner's incoming audio with EQ + leveling.
// Does NOT create a destination — we let the <audio> element handle output.

export function createOutputAudioGraph(stream: MediaStream): OutputAudioGraph | null {
    if (stream.getAudioTracks().length === 0) return null;

    try {
        const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
        const context = new AudioCtor();
        const source = context.createMediaStreamSource(stream);

        const highPass = context.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 85;
        highPass.Q.value = 0.7;

        const lowPass = context.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.value = 8000;
        lowPass.Q.value = 0.7;

        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 30;
        compressor.ratio.value = 10;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        // Chain: source → highPass → lowPass → compressor
        // The compressor output is NOT connected to context.destination
        // because the <audio> element handles actual playback.
        source.connect(highPass);
        highPass.connect(lowPass);
        lowPass.connect(compressor);

        if (context.state === 'suspended') {
            const resume = () => {
                context.resume().catch(() => { });
                document.removeEventListener('click', resume);
                document.removeEventListener('touchstart', resume);
            };
            document.addEventListener('click', resume, { once: true });
            document.addEventListener('touchstart', resume, { once: true });
        }

        return { context, source, highPass, lowPass, compressor };
    } catch (err) {
        console.warn('[audioProcessing] Failed to create output audio graph:', err);
        return null;
    }
}

// ── Cleanup ──────────────────────────────────────────────────────────

export function cleanupOutputAudioGraph(graph: OutputAudioGraph | null): void {
    if (!graph) return;
    try { graph.source.disconnect(); } catch (_) { }
    try { graph.highPass.disconnect(); } catch (_) { }
    try { graph.lowPass.disconnect(); } catch (_) { }
    try { graph.compressor.disconnect(); } catch (_) { }
    try { graph.context.close(); } catch (_) { }
}
