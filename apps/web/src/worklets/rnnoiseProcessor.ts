import { Rnnoise } from '@shiguredo/rnnoise-wasm';

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

declare function registerProcessor(name: string, processorCtor: typeof AudioWorkletProcessor): void;

class RnnoiseProcessor extends AudioWorkletProcessor {
  private ready: boolean;
  private denoiseState: { processFrame: (frame: Float32Array) => number; destroy: () => void } | null;
  private frameSize: number;
  private inputBuffer: Float32Array;
  private outputBuffer: Float32Array;
  private inputIndex: number;
  private outputIndex: number;
  private destroyed: boolean;
  private hasOutput: boolean;

  constructor() {
    super();
    this.ready = false;
    this.denoiseState = null;
    this.frameSize = 480;
    this.inputBuffer = new Float32Array(this.frameSize);
    this.outputBuffer = new Float32Array(this.frameSize);
    this.inputIndex = 0;
    this.outputIndex = 0;
    this.destroyed = false;
    this.hasOutput = false;

    this.port.onmessage = (event) => {
      if (event.data?.type === 'destroy') {
        this.destroyed = true;
        try { this.denoiseState?.destroy(); } catch (_) { }
        this.denoiseState = null;
      }
    };

    Rnnoise.load()
      .then((rnnoise) => {
        if (this.destroyed) return;
        this.frameSize = rnnoise.frameSize;
        this.inputBuffer = new Float32Array(this.frameSize);
        this.outputBuffer = new Float32Array(this.frameSize);
        this.inputIndex = 0;
        this.outputIndex = 0;
        this.denoiseState = rnnoise.createDenoiseState();
        this.ready = true;
        this.hasOutput = false;
        this.port.postMessage({ type: 'ready', frameSize: this.frameSize });
      })
      .catch((error) => {
        this.port.postMessage({ type: 'error', message: String(error) });
      });
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];

    if (!input || !output) return true;

    if (!this.ready || !this.denoiseState) {
      output.set(input);
      return true;
    }

    for (let i = 0; i < input.length; i++) {
      this.inputBuffer[this.inputIndex++] = input[i];
      if (this.inputIndex === this.frameSize) {
        try { this.denoiseState.processFrame(this.inputBuffer); } catch (_) { }
        this.outputBuffer.set(this.inputBuffer);
        this.outputIndex = 0;
        this.inputIndex = 0;
        this.hasOutput = true;
      }
      if (this.hasOutput && this.outputIndex < this.frameSize) {
        output[i] = this.outputBuffer[this.outputIndex++];
      } else {
        output[i] = input[i];
      }
    }

    return true;
  }
}

registerProcessor('rnnoise-processor', RnnoiseProcessor);
