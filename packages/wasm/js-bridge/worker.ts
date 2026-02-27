/**
 * Web Worker implementation for BuzzU WASM
 * Offloads heavy computations to prevent UI blocking
 */

import init, { WorkerEngine } from '../pkg/buzzu_wasm.js';

let workerEngine: WorkerEngine | null = null;
let isInitialized = false;

/**
 * Initialize the Web Worker with WASM module
 */
async function initializeWorker(wasmPath: string = '../pkg/buzzu_wasm.js'): Promise<void> {
  if (isInitialized) {
    return;
  }

  try {
    await init(wasmPath);
    workerEngine = new WorkerEngine();
    isInitialized = true;
    
    self.postMessage({
      type: 'worker_initialized',
      payload: { success: true }
    });
  } catch (error) {
    self.postMessage({
      type: 'worker_initialized',
      payload: { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }
    });
  }
}

/**
 * Process crypto operations in worker
 */
async function processCrypto(data: {
  operation: 'encrypt' | 'decrypt';
  key: string;
  data: Uint8Array;
  nonce: string;
}): Promise<void> {
  if (!workerEngine || !isInitialized) {
    throw new Error('Worker not initialized');
  }

  try {
    // Initialize crypto if needed
    if (data.key) {
      await workerEngine.initialize_crypto(data.key);
    }

    const result = await workerEngine.process_crypto_batch(
      data.data,
      data.nonce
    );

    self.postMessage({
      type: 'crypto_result',
      payload: {
        success: true,
        data: result,
        operation: data.operation
      }
    });
  } catch (error) {
    self.postMessage({
      type: 'crypto_result',
      payload: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        operation: data.operation
      }
    });
  }
}

/**
 * Measure connection quality in worker
 */
async function measureConnectionQuality(rttData: number[]): Promise<void> {
  if (!workerEngine || !isInitialized) {
    throw new Error('Worker not initialized');
  }

  try {
    // Convert number[] to Float64Array for Rust WASM compatibility
    const float64Array = new Float64Array(rttData);
    const qualityState = workerEngine.measure_connection_quality(float64Array);
    const summary = workerEngine.get_network_health_summary();
    const avgRtt = workerEngine.calculate_average_rtt();
    const qualityScore = workerEngine.get_connection_quality();

    self.postMessage({
      type: 'connection_quality_result',
      payload: {
        success: true,
        qualityState,
        summary,
        averageRtt: avgRtt,
        qualityScore
      }
    });
  } catch (error) {
    self.postMessage({
      type: 'connection_quality_result',
      payload: {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

/**
 * Process large datasets in worker
 */
async function processLargeDataset(data: Uint8Array): Promise<void> {
  if (!workerEngine || !isInitialized) {
    throw new Error('Worker not initialized');
  }

  try {
    const result = workerEngine.process_large_dataset(data);

    self.postMessage({
      type: 'dataset_result',
      payload: {
        success: true,
        data: result
      }
    });
  } catch (error) {
    self.postMessage({
      type: 'dataset_result',
      payload: {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

/**
 * Handle messages from main thread
 */
self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  try {
    switch (type) {
      case 'initialize':
        await initializeWorker(payload.wasmPath);
        break;

      case 'crypto_operation':
        await processCrypto(payload);
        break;

      case 'measure_connection_quality':
        await measureConnectionQuality(payload.rttData);
        break;

      case 'process_dataset':
        await processLargeDataset(payload.data);
        break;

      default:
        self.postMessage({
          type: 'error',
          payload: {
            error: `Unknown message type: ${type}`
          }
        });
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      payload: {
        error: error instanceof Error ? error.message : String(error)
      }
    });
  }
};

// Handle worker errors
self.onerror = (event: Event | string) => {
  const error = event as ErrorEvent;
  self.postMessage({
    type: 'worker_error',
    payload: {
      error: error.message || 'Unknown error',
      filename: error.filename || 'unknown',
      lineno: error.lineno || 0,
      colno: error.colno || 0
    }
  });
};

export {};