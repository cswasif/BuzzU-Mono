# BuzzU WASM JS Bridge

A minimal TypeScript bridge that connects React to Rust WASM modules for WebRTC communication, file transfer, and peer-to-peer networking.

## Architecture

The bridge follows a **zero-logic principle** - it only wraps browser APIs and passes data to/from the WASM module. All business logic resides in the Rust WASM code.

```
React Component → JS Bridge → Browser APIs → WASM Module (Rust Logic)
```

## Features

- **WebSocket**: Signaling server connection
- **WebRTC**: Peer-to-peer connection management
- **WebTransport**: QUIC protocol support (when available)
- **Media APIs**: Audio/video capture and streaming
- **File APIs**: File reading and downloading
- **TypeScript**: Full type safety

## Usage

### Basic Setup

```typescript
import { initWasm, connectWebSocket, createPeerConnection } from './js-bridge';

// Initialize WASM module
const wasm = await initWasm('./pkg/buzzu_wasm.js');
const engine = new wasm.BuzzUEngine();

// Connect to signaling server
const ws = connectWebSocket('wss://your-server.com', (message) => {
  const response = engine.process(message);
  if (response) ws.send(response);
});

// Create peer connection
const pc = createPeerConnection('peer-123');
```

### File Transfer

```typescript
import { readFile, downloadBlob } from './js-bridge';

// Read file for sending
const fileData = await readFile(fileInput.files[0]);
const chunks = engine.createFileChunks(fileData.name, fileData.data);

// Download received file
downloadBlob(receivedData, 'filename.ext', 'application/octet-stream');
```

### Media Streaming

```typescript
import { getUserMedia } from './js-bridge';

// Get audio/video stream
const mediaStream = await getUserMedia({ audio: true, video: true });

// Add to peer connection
mediaStream.stream.getTracks().forEach(track => {
  pc.addTrack(track, mediaStream.stream);
});
```

## API Reference

### WASM Initialization

- `initWasm(wasmPath?: string): Promise<WasmModule>`

### WebSocket

- `connectWebSocket(url, onMessage, onOpen?, onClose?, onError?): WebSocket`
- `disconnectWebSocket(url): void`

### WebRTC

- `createPeerConnection(peerId, config?): RTCPeerConnection`
- `createOffer(peerId): Promise<RTCSessionDescriptionInit>`
- `createAnswer(peerId): Promise<RTCSessionDescriptionInit>`
- `setRemoteDescription(peerId, description): Promise<void>`
- `addIceCandidate(peerId, candidate): Promise<void>`
- `createDataChannel(peerId, label, options?): RTCDataChannel`
- `closePeerConnection(peerId): void`

### Media

- `getUserMedia(constraints): Promise<MediaStream>`
- `stopMediaStream(streamId): void`

### File Operations

- `readFile(file): Promise<FileReadResult>`
- `downloadBlob(data, filename, mimeType?): void`

### WebTransport

- `createWebTransport(url): Promise<WebTransport | null>`

### Cleanup

- `cleanup(): void` - Clean up all resources

## Zero-Logic Principle

The bridge **never** processes or interprets data:

```typescript
// ❌ WRONG - Logic in JS
if (message.type === 'offer') {
  // Process offer logic here
}

// ✅ CORRECT - Just call browser API, pass to Rust
const sdp = await pc.createOffer();
engine.handleLocalSdp(sdp);  // Rust handles everything
```

## Error Handling

All bridge functions throw typed errors:

- `BridgeError` - Base error class
- `WebSocketError` - WebSocket connection errors
- `WebRTCError` - WebRTC operation errors
- `MediaError` - Media capture errors
- `FileError` - File operation errors

```typescript
try {
  await getUserMedia({ video: true });
} catch (error) {
  if (error instanceof MediaError) {
    console.error('Media error:', error.message);
  }
}
```

## Browser Compatibility

- **WebSocket**: All modern browsers
- **WebRTC**: Chrome, Firefox, Safari, Edge
- **WebTransport**: Chrome 97+, Edge 97+
- **File API**: All modern browsers
- **Media API**: All modern browsers

## Development

```bash
# Build WASM module
cd buzzu-wasm
wasm-pack build --target web --out-dir pkg

# Use in React app
import { initWasm } from './js-bridge';
```