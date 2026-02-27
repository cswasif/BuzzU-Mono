import type {
  WebSocketConnection,
  PeerConnection,
  PeerConnectionConfig,
  MediaConstraints,
  MediaStreamWrapper,
  FileReadResult,
  WasmModule,
} from './types';
import { WebRTCError, MediaError, FileError } from './types';
import { workerManager, encryptInWorker, measureQualityInWorker } from './worker-manager';

// WASM module reference
let wasmModule: WasmModule | null = null;

// Active connections
const webSocketConnections = new Map<string, WebSocketConnection>();
const peerConnections = new Map<string, PeerConnection>();
const mediaStreams = new Map<string, MediaStreamWrapper>();

/**
 * Initialize WASM module
 */
export async function initWasm(wasmPath: string = './pkg/buzzu_wasm.js'): Promise<WasmModule> {
  if (wasmModule) {
    return wasmModule;
  }

  try {
    // Dynamic import of WASM module
    const module = await import(wasmPath);
    wasmModule = module as WasmModule;
    
    // Initialize WASM instance
    await module.default();
    
    return wasmModule;
  } catch (error) {
    throw new Error(`Failed to initialize WASM module: ${error}`);
  }
}

/**
 * Connect to WebSocket signaling server
 */
export function connectWebSocket(
  url: string,
  onMessage: (message: string) => void,
  onOpen?: () => void,
  onClose?: () => void,
  onError?: (error: Event) => void
): WebSocket {
  if (webSocketConnections.has(url)) {
    const existing = webSocketConnections.get(url)!;
    return existing.ws;
  }

  const ws = new WebSocket(url);
  
  const connection: WebSocketConnection = {
    ws,
    url,
    onMessage,
    onOpen: onOpen || (() => {}),
    onClose: onClose || (() => {}),
    onError: onError || (() => {}),
  };

  ws.onopen = () => {
    if (onOpen) onOpen();
  };

  ws.onmessage = (event) => {
    onMessage(event.data);
  };

  ws.onclose = () => {
    webSocketConnections.delete(url);
    if (onClose) onClose();
  };

  ws.onerror = (error) => {
    webSocketConnections.delete(url);
    if (onError) onError(error);
  };

  webSocketConnections.set(url, connection);
  return ws;
}

/**
 * Disconnect WebSocket
 */
export function disconnectWebSocket(url: string): void {
  const connection = webSocketConnections.get(url);
  if (connection) {
    connection.ws.close();
    webSocketConnections.delete(url);
  }
}

/**
 * Create WebRTC peer connection
 */
export function createPeerConnection(
  peerId: string,
  config: PeerConnectionConfig = {}
): RTCPeerConnection {
  if (peerConnections.has(peerId)) {
    return peerConnections.get(peerId)!.pc;
  }

  const defaultConfig: RTCConfiguration = {
    iceServers: config.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }],
    iceTransportPolicy: config.iceTransportPolicy || 'all',
    bundlePolicy: config.bundlePolicy || 'balanced',
    rtcpMuxPolicy: config.rtcpMuxPolicy || 'require',
  };

  const pc = new RTCPeerConnection(defaultConfig);
  
  const peerConnection: PeerConnection = {
    pc,
    peerId,
    dataChannels: new Map(),
  };

  peerConnections.set(peerId, peerConnection);
  return pc;
}

/**
 * Create WebRTC offer
 */
export async function createOffer(peerId: string): Promise<RTCSessionDescriptionInit> {
  const peerConnection = peerConnections.get(peerId);
  if (!peerConnection) {
    throw new WebRTCError(`Peer connection not found for ${peerId}`, peerId);
  }

  try {
    const offer = await peerConnection.pc.createOffer();
    await peerConnection.pc.setLocalDescription(offer);
    return offer;
  } catch (error) {
    throw new WebRTCError(`Failed to create offer for ${peerId}: ${error}`, peerId);
  }
}

/**
 * Create WebRTC answer
 */
export async function createAnswer(peerId: string): Promise<RTCSessionDescriptionInit> {
  const peerConnection = peerConnections.get(peerId);
  if (!peerConnection) {
    throw new WebRTCError(`Peer connection not found for ${peerId}`, peerId);
  }

  try {
    const answer = await peerConnection.pc.createAnswer();
    await peerConnection.pc.setLocalDescription(answer);
    return answer;
  } catch (error) {
    throw new WebRTCError(`Failed to create answer for ${peerId}: ${error}`, peerId);
  }
}

/**
 * Set remote description
 */
export async function setRemoteDescription(
  peerId: string,
  description: RTCSessionDescriptionInit
): Promise<void> {
  const peerConnection = peerConnections.get(peerId);
  if (!peerConnection) {
    throw new WebRTCError(`Peer connection not found for ${peerId}`, peerId);
  }

  try {
    await peerConnection.pc.setRemoteDescription(description);
  } catch (error) {
    throw new WebRTCError(`Failed to set remote description for ${peerId}: ${error}`, peerId);
  }
}

/**
 * Add ICE candidate
 */
export async function addIceCandidate(
  peerId: string,
  candidate: RTCIceCandidateInit
): Promise<void> {
  const peerConnection = peerConnections.get(peerId);
  if (!peerConnection) {
    throw new WebRTCError(`Peer connection not found for ${peerId}`, peerId);
  }

  try {
    await peerConnection.pc.addIceCandidate(candidate);
  } catch (error) {
    throw new WebRTCError(`Failed to add ICE candidate for ${peerId}: ${error}`, peerId);
  }
}

/**
 * Create data channel
 */
export function createDataChannel(
  peerId: string,
  label: string,
  options?: RTCDataChannelInit
): RTCDataChannel {
  const peerConnection = peerConnections.get(peerId);
  if (!peerConnection) {
    throw new WebRTCError(`Peer connection not found for ${peerId}`, peerId);
  }

  const dataChannel = peerConnection.pc.createDataChannel(label, options);
  peerConnection.dataChannels.set(label, dataChannel);
  return dataChannel;
}

/**
 * Close peer connection
 */
export function closePeerConnection(peerId: string): void {
  const peerConnection = peerConnections.get(peerId);
  if (peerConnection) {
    peerConnection.pc.close();
    peerConnections.delete(peerId);
  }
}

/**
 * Get user media (audio/video)
 */
export async function getUserMedia(constraints: MediaConstraints): Promise<MediaStreamWrapper> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    const mediaStream: MediaStreamWrapper = {
      stream,
      audioTrack: stream.getAudioTracks()[0] || undefined,
      videoTrack: stream.getVideoTracks()[0] || undefined,
    };

    return mediaStream;
  } catch (error) {
    throw new MediaError(`Failed to get user media: ${error}`);
  }
}

/**
 * Stop media stream
 */
export function stopMediaStream(streamId: string): void {
  const mediaStream = mediaStreams.get(streamId);
  if (mediaStream) {
    mediaStream.stream.getTracks().forEach(track => track.stop());
    mediaStreams.delete(streamId);
  }
}

/**
 * Read file as Uint8Array
 */
export async function readFile(file: File): Promise<FileReadResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      const arrayBuffer = event.target?.result as ArrayBuffer;
      const uint8Array = new Uint8Array(arrayBuffer);
      
      resolve({
        name: file.name,
        size: file.size,
        type: file.type,
        data: uint8Array,
        lastModified: file.lastModified,
      });
    };
    
    reader.onerror = () => {
      reject(new FileError(`Failed to read file: ${reader.error}`));
    };
    
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Download blob as file
 */
export function downloadBlob(data: Uint8Array, filename: string, mimeType: string = 'application/octet-stream'): void {
  const blob = new Blob([data as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Create WebTransport connection (if available)
 */
export async function createWebTransport(url: string): Promise<WebTransport | null> {
  if (!('WebTransport' in window)) {
    return null;
  }

  try {
    const transport = new WebTransport(url);
    await transport.ready;
    return transport;
  } catch (error) {
    console.warn('WebTransport not available or failed:', error);
    return null;
  }
}

/**
 * Clean up all resources
 */
export function cleanup(): void {
  // Close all WebSocket connections
  webSocketConnections.forEach((connection) => {
    connection.ws.close();
  });
  webSocketConnections.clear();

  // Close all peer connections
  peerConnections.forEach((peerConnection) => {
    peerConnection.pc.close();
  });
  peerConnections.clear();

  // Stop all media streams
  mediaStreams.forEach((mediaStream) => {
    mediaStream.stream.getTracks().forEach(track => track.stop());
  });
  mediaStreams.clear();

  // Clear WASM references
  wasmModule = null;
  
  // Terminate worker
  workerManager.terminate();
}

/**
 * Initialize Web Worker for heavy computations
 */
export async function initializeWorker(wasmPath?: string): Promise<boolean> {
  return workerManager.initialize(wasmPath);
}

/**
 * Process crypto operations in Web Worker
 */
export async function processCryptoInWorker(
  key: string,
  data: Uint8Array,
  nonce: string
): Promise<Uint8Array> {
  return encryptInWorker(key, data, nonce);
}

/**
 * Measure connection quality in Web Worker
 */
export async function measureConnectionQualityInWorker(
  rttData: number[]
): Promise<{
  qualityState: string;
  summary: string;
  averageRtt: number;
  qualityScore: number;
}> {
  return measureQualityInWorker(rttData);
}

/**
 * Process large datasets in Web Worker
 */
export async function processLargeDatasetInWorker(data: Uint8Array): Promise<string> {
  return workerManager.processLargeDataset(data);
}

// Export types
export * from './types';