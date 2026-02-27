import React, { useEffect, useState } from 'react';
import { initWasm, connectWebSocket, createPeerConnection, createOffer, createDataChannel, getUserMedia, readFile } from '../js-bridge';

// Example React component using the WASM bridge
export const WasmBridgeExample: React.FC = () => {
  const [wasmLoaded, setWasmLoaded] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [engine, setEngine] = useState<any>(null);
  const [peerConnections] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    // Initialize WASM module
    const initializeWasm = async () => {
      try {
        const wasm = await initWasm('./pkg/buzzu_wasm.js');
        const buzzuEngine = new wasm.BuzzUEngine();
        setEngine(buzzuEngine);
        setWasmLoaded(true);
      } catch (error) {
        console.error('Failed to initialize WASM:', error);
      }
    };

    initializeWasm();

    // Cleanup on unmount
    return () => {
      // Cleanup resources
    };
  }, []);

  const connectToSignaling = () => {
    const ws = connectWebSocket(
      'wss://your-signaling-server.com',
      (message) => {
        // Handle incoming signaling messages
        if (engine) {
          const response = engine.process(message);
          if (response) {
            ws.send(response);
          }
        }
      },
      () => setWsConnected(true),
      () => setWsConnected(false),
      (error) => console.error('WebSocket error:', error)
    );
  };

  const connectToPeer = async (peerId: string) => {
    try {
      // Create peer connection
      createPeerConnection(peerId);
      
      // Create data channel
      const dataChannel = createDataChannel(peerId, 'chat', {
        ordered: true,
      });

      // Handle data channel events
      dataChannel.onopen = () => {
        setPeerConnected(true);
        console.log('Data channel opened');
      };

      dataChannel.onmessage = (event) => {
        console.log('Received message:', event.data);
        // Process message through WASM engine
        if (engine) {
          engine.process(event.data);
        }
      };

      dataChannel.onclose = () => {
        setPeerConnected(false);
        console.log('Data channel closed');
      };

      // Create offer
      await createOffer(peerId);
      
      // Send offer through signaling server
      if (wsConnected) {
        // Send offer to signaling server
      }

    } catch (error) {
      console.error('Failed to connect to peer:', error);
    }
  };

  const handleFileUpload = async (file: File) => {
    try {
      // Read file as Uint8Array
      const fileData = await readFile(file);
      
      // Process through WASM engine
      if (engine) {
        // Send chunks through data channel
        engine.createFileChunks(file.name, fileData.data);
      }
    } catch (error) {
      console.error('Failed to handle file upload:', error);
    }
  };

  const getMediaStream = async () => {
    try {
      const mediaStream = await getUserMedia({
        audio: true,
        video: true,
      });
      
      // Use media stream for WebRTC
      const pc = peerConnections.values().next().value?.pc;
      if (pc) {
        mediaStream.stream.getTracks().forEach(track => {
          pc.addTrack(track, mediaStream.stream);
        });
      }
    } catch (error) {
      console.error('Failed to get media stream:', error);
    }
  };

  return (
    <div>
      <h2>WASM Bridge Example</h2>
      
      <div>
        <p>WASM Loaded: {wasmLoaded ? '✅' : '❌'}</p>
        <p>WebSocket Connected: {wsConnected ? '✅' : '❌'}</p>
        <p>Peer Connected: {peerConnected ? '✅' : '❌'}</p>
      </div>

      <div>
        <button onClick={connectToSignaling} disabled={!wasmLoaded || wsConnected}>
          Connect to Signaling
        </button>
        
        <button onClick={() => connectToPeer('peer-123')} disabled={!wsConnected}>
          Connect to Peer
        </button>
        
        <button onClick={getMediaStream} disabled={!peerConnected}>
          Get Media Stream
        </button>
      </div>

      <div>
        <input
          type="file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
          }}
          disabled={!peerConnected}
        />
      </div>
    </div>
  );
};

export default WasmBridgeExample;