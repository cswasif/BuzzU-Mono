// WebSocket types
export interface WebSocketConnection {
  ws: WebSocket;
  url: string;
  onMessage: (message: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
}

// WebRTC types
export interface PeerConnectionConfig {
  iceServers?: RTCIceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
  bundlePolicy?: RTCBundlePolicy;
  rtcpMuxPolicy?: RTCRtcpMuxPolicy;
}

export interface PeerConnection {
  pc: RTCPeerConnection;
  peerId: string;
  dataChannels: Map<string, RTCDataChannel>;
}

// Media types
export interface MediaConstraints {
  audio?: boolean | MediaTrackConstraints;
  video?: boolean | MediaTrackConstraints;
}

export interface MediaStreamWrapper {
  stream: MediaStream;
  audioTrack?: MediaStreamTrack | undefined;
  videoTrack?: MediaStreamTrack | undefined;
}

// File types
export interface FileReadResult {
  name: string;
  size: number;
  type: string;
  data: Uint8Array;
  lastModified: number;
}

// WASM types (matching the generated bindings)
export interface WasmModule {
  BuzzUEngine: typeof import('../pkg/buzzu_wasm').BuzzUEngine;
  CryptoEngine: typeof import('../pkg/buzzu_wasm').CryptoEngine;
  FileTransferEngine: typeof import('../pkg/buzzu_wasm').FileTransferEngine;
  MessageRouter: typeof import('../pkg/buzzu_wasm').MessageRouter;
  PeerInfo: typeof import('../pkg/buzzu_wasm').PeerInfo;
  PeerManager: typeof import('../pkg/buzzu_wasm').PeerManager;
  SignalingEngine: typeof import('../pkg/buzzu_wasm').SignalingEngine;
  TransportEngine: typeof import('../pkg/buzzu_wasm').TransportEngine;
  ImageCompressor: typeof import('../pkg/buzzu_wasm').ImageCompressor;
  SdpCompressor: typeof import('../pkg/buzzu_wasm').SdpCompressor;
}

// Bridge configuration
export interface BridgeConfig {
  wasmPath?: string;
  iceServers?: RTCIceServer[];
  enableWebTransport?: boolean;
  enableWebRTC?: boolean;
}

// Error types
export class BridgeError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'BridgeError';
  }
}

export class WebSocketError extends BridgeError {
  constructor(message: string, public wsUrl: string) {
    super(message, 'WEBSOCKET_ERROR');
    this.name = 'WebSocketError';
  }
}

export class WebRTCError extends BridgeError {
  constructor(message: string, public peerId: string) {
    super(message, 'WEBRTC_ERROR');
    this.name = 'WebRTCError';
  }
}

export class MediaError extends BridgeError {
  constructor(message: string) {
    super(message, 'MEDIA_ERROR');
    this.name = 'MediaError';
  }
}

export class FileError extends BridgeError {
  constructor(message: string) {
    super(message, 'FILE_ERROR');
    this.name = 'FileError';
  }
}