/**
 * Web Worker Manager for BuzzU WASM
 * Provides easy integration of Web Workers for performance optimization
 */

export interface WorkerMessage {
  type: string;
  payload: any;
}

export interface WorkerResponse {
  type: string;
  payload: any;
}

export class BuzzUWorkerManager {
  private worker: Worker | null = null;
  private messageHandlers: Map<string, (payload: any) => void> = new Map();
  private initializationPromise: Promise<boolean> | null = null;

  constructor(private workerScriptPath: string = './worker.js') {}

  /**
   * Initialize the Web Worker
   */
  async initialize(wasmPath?: string): Promise<boolean> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.initializeWorker(wasmPath);
    return this.initializationPromise;
  }

  private async initializeWorker(wasmPath?: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.worker = new Worker(this.workerScriptPath, { type: 'module' });

        this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const { type, payload } = event.data;
          
          if (type === 'worker_initialized') {
            resolve(payload.success);
            return;
          }

          const handler = this.messageHandlers.get(type);
          if (handler) {
            handler(payload);
          }
        };

        this.worker.onerror = (error: ErrorEvent) => {
          console.error('Worker error:', error);
          resolve(false);
        };

        this.worker.postMessage({
          type: 'initialize',
          payload: { wasmPath }
        });

      } catch (error) {
        console.error('Failed to create worker:', error);
        resolve(false);
      }
    });
  }

  /**
   * Process crypto operations in worker
   */
  async processCrypto(
    operation: 'encrypt' | 'decrypt',
    key: string,
    data: Uint8Array,
    nonce: string
  ): Promise<Uint8Array> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    return new Promise((resolve, reject) => {
      const messageId = `crypto_${Date.now()}_${Math.random()}`;
      
      this.messageHandlers.set('crypto_result', (payload) => {
        this.messageHandlers.delete('crypto_result');
        
        if (payload.success) {
          resolve(new Uint8Array(payload.data));
        } else {
          reject(new Error(payload.error));
        }
      });

      this.worker!.postMessage({
        type: 'crypto_operation',
        payload: {
          operation,
          key,
          data,
          nonce,
          messageId
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        this.messageHandlers.delete('crypto_result');
        reject(new Error('Crypto operation timeout'));
      }, 30000);
    });
  }

  /**
   * Measure connection quality in worker
   */
  async measureConnectionQuality(rttData: number[]): Promise<{
    qualityState: string;
    summary: string;
    averageRtt: number;
    qualityScore: number;
  }> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    return new Promise((resolve, reject) => {
      this.messageHandlers.set('connection_quality_result', (payload) => {
        this.messageHandlers.delete('connection_quality_result');
        
        if (payload.success) {
          resolve({
            qualityState: payload.qualityState,
            summary: payload.summary,
            averageRtt: payload.averageRtt,
            qualityScore: payload.qualityScore
          });
        } else {
          reject(new Error(payload.error));
        }
      });

      this.worker!.postMessage({
        type: 'measure_connection_quality',
        payload: { rttData }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        this.messageHandlers.delete('connection_quality_result');
        reject(new Error('Connection quality measurement timeout'));
      }, 10000);
    });
  }

  /**
   * Process large datasets in worker
   */
  async processLargeDataset(data: Uint8Array): Promise<string> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    return new Promise((resolve, reject) => {
      this.messageHandlers.set('dataset_result', (payload) => {
        this.messageHandlers.delete('dataset_result');
        
        if (payload.success) {
          resolve(payload.data);
        } else {
          reject(new Error(payload.error));
        }
      });

      this.worker!.postMessage({
        type: 'process_dataset',
        payload: { data }
      });

      // Timeout after 60 seconds for large datasets
      setTimeout(() => {
        this.messageHandlers.delete('dataset_result');
        reject(new Error('Dataset processing timeout'));
      }, 60000);
    });
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.messageHandlers.clear();
      this.initializationPromise = null;
    }
  }

  /**
   * Check if worker is initialized
   */
  isInitialized(): boolean {
    return this.worker !== null;
  }
}

// Export singleton instance for easy usage
export const workerManager = new BuzzUWorkerManager();

// Helper functions for common operations
export async function encryptInWorker(
  key: string,
  data: Uint8Array,
  nonce: string
): Promise<Uint8Array> {
  await workerManager.initialize();
  return workerManager.processCrypto('encrypt', key, data, nonce);
}

export async function decryptInWorker(
  key: string,
  data: Uint8Array,
  nonce: string
): Promise<Uint8Array> {
  await workerManager.initialize();
  return workerManager.processCrypto('decrypt', key, data, nonce);
}

export async function measureQualityInWorker(
  rttData: number[]
): Promise<{
  qualityState: string;
  summary: string;
  averageRtt: number;
  qualityScore: number;
}> {
  await workerManager.initialize();
  return workerManager.measureConnectionQuality(rttData);
}