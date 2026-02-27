import React, { useEffect, useState, useRef } from 'react';
import { ChatWssWorker } from './wss-worker';
import { initWasm, createPeerConnection, createOffer, setRemoteDescription, addIceCandidate, createDataChannel } from './bridge';

export interface ChatMessage {
  id: string;
  from: string;
  message: string;
  timestamp: number;
  isOwn: boolean;
}

export interface ChatUser {
  peerId: string;
  displayName: string;
  isOnline: boolean;
}

export const ChatApp: React.FC = () => {
  const [wasmLoaded, setWasmLoaded] = useState(false);
  const [wssWorker, setWssWorker] = useState<ChatWssWorker | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [roomId] = useState('default-room');
  const [peerId, setPeerId] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  
  const messageEndRef = useRef<HTMLDivElement>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());

  useEffect(() => {
    // Initialize WASM and generate peer ID
    const initializeApp = async () => {
      try {
        const wasm = await initWasm('./pkg/buzzu_wasm.js');
        const buzzuEngine = new wasm.BuzzUEngine();
        setEngine(buzzuEngine);
        setWasmLoaded(true);
        
        // Generate unique peer ID
        const id = `peer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setPeerId(id);
        setDisplayName(`User ${id.substr(0, 8)}`);
      } catch (error) {
        console.error('Failed to initialize WASM:', error);
      }
    };

    initializeApp();
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const connectToRoom = async () => {
    if (!wasmLoaded || !peerId) return;
    
    setIsConnecting(true);
    
    try {
      // Create WSS worker for signaling
      const worker = new ChatWssWorker({
        url: `wss://your-signaling-server.com/ws?room=${roomId}`,
        peerId: peerId,
        roomId: roomId,
        onConnect: () => {
          setIsConnected(true);
          setIsConnecting(false);
          console.log('Connected to signaling server');
        },
        onDisconnect: () => {
          setIsConnected(false);
          console.log('Disconnected from signaling server');
        },
        onMessage: (message) => {
          handleSignalingMessage(message);
        },
        onError: (error) => {
          console.error('WSS Worker error:', error);
          setIsConnecting(false);
        }
      });

      setWssWorker(worker);
      worker.connect();
    } catch (error) {
      console.error('Failed to connect to room:', error);
      setIsConnecting(false);
    }
  };

  const handleSignalingMessage = async (message: any) => {
    try {
      switch (message.type) {
        case 'peer_list':
          updateUsersList(message.peers || []);
          break;
          
        case 'offer':
          await handleOffer(message);
          break;
          
        case 'answer':
          await handleAnswer(message);
          break;
          
        case 'ice_candidate':
          await handleIceCandidate(message);
          break;
          
        case 'chat':
          addMessage({
            id: `${message.from}_${Date.now()}`,
            from: message.from,
            message: message.message,
            timestamp: message.timestamp,
            isOwn: message.from === peerId
          });
          break;
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
    }
  };

  const updateUsersList = (peers: string[]) => {
    const updatedUsers: ChatUser[] = peers.map(peerId => ({
      peerId,
      displayName: `User ${peerId.substr(0, 8)}`,
      isOnline: true
    }));
    setUsers(updatedUsers);
  };

  const handleOffer = async (offer: any) => {
    const pc = createPeerConnection(offer.from);
    peerConnections.current.set(offer.from, pc);

    // Create data channel for chat
    const dataChannel = createDataChannel(offer.from, 'chat', {
      ordered: true,
    });
    dataChannels.current.set(offer.from, dataChannel);
    
    setupDataChannelHandlers(dataChannel, offer.from);

    // Set remote description
    await setRemoteDescription(offer.from, {
      type: 'offer',
      sdp: offer.sdp
    });

    // Create answer
    const peerConnection = peerConnections.get(offer.from);
    if (!peerConnection) {
      throw new Error(`Peer connection not found for ${offer.from}`);
    }
    const answer = await peerConnection.pc.createAnswer();
    await peerConnection.pc.setLocalDescription(answer);
    
    // Send answer via signaling
    if (wssWorker) {
      wssWorker.sendAnswer(offer.from, answer.sdp || '');
    }
  };

  const handleAnswer = async (answer: any) => {
    await setRemoteDescription(answer.from, {
      type: 'answer',
      sdp: answer.sdp
    });
  };

  const handleIceCandidate = async (candidate: any) => {
    await addIceCandidate(candidate.from, candidate.candidate);
  };

  const setupDataChannelHandlers = (dataChannel: RTCDataChannel, peerId: string) => {
    dataChannel.onopen = () => {
      console.log(`Data channel opened with ${peerId}`);
    };

    dataChannel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'chat') {
          addMessage({
            id: `${peerId}_${Date.now()}`,
            from: peerId,
            message: message.content,
            timestamp: Date.now(),
            isOwn: false
          });
        }
      } catch (error) {
        console.error('Error parsing data channel message:', error);
      }
    };

    dataChannel.onclose = () => {
      console.log(`Data channel closed with ${peerId}`);
      dataChannels.current.delete(peerId);
    };
  };

  const sendMessage = () => {
    if (!currentMessage.trim() || !wssWorker) return;

    // Send via signaling server (fallback)
    wssWorker.sendChatMessage(currentMessage.trim());

    // Also send via WebRTC data channels if available
    dataChannels.current.forEach((dataChannel, peerId) => {
      if (dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({
          type: 'chat',
          content: currentMessage.trim(),
          timestamp: Date.now()
        }));
      }
    });

    // Add own message to UI
    addMessage({
      id: `${peerId}_${Date.now()}`,
      from: peerId,
      message: currentMessage.trim(),
      timestamp: Date.now(),
      isOwn: true
    });

    setCurrentMessage('');
  };

  const addMessage = (message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
  };

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  if (!wasmLoaded) {
    return (
      <div className="chat-app-loading">
        <h2>Loading Chat Application...</h2>
        <p>Initializing WebAssembly...</p>
      </div>
    );
  }

  return (
    <div className="chat-app">
      <div className="chat-header">
        <h2>BuzzU Chat - Room: {roomId}</h2>
        <div className="connection-status">
          Status: {isConnected ? '🟢 Connected' : isConnecting ? '🟡 Connecting...' : '🔴 Disconnected'}
        </div>
      </div>

      <div className="chat-container">
        <div className="users-panel">
          <h3>Online Users ({users.length})</h3>
          <div className="users-list">
            {users.map(user => (
              <div key={user.peerId} className="user-item">
                <span className="user-status">🟢</span>
                <span className="user-name">{user.displayName}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="messages-panel">
          <div className="messages-container">
            {messages.length === 0 ? (
              <div className="no-messages">
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map(message => (
                <div key={message.id} className={`message ${message.isOwn ? 'own-message' : 'other-message'}`}>
                  <div className="message-header">
                    <span className="message-sender">
                      {message.isOwn ? 'You' : `User ${message.from.substr(0, 8)}`}
                    </span>
                    <span className="message-timestamp">
                      {formatTimestamp(message.timestamp)}
                    </span>
                  </div>
                  <div className="message-content">
                    {message.message}
                  </div>
                </div>
              ))
            )}
            <div ref={messageEndRef} />
          </div>

          <div className="message-input-container">
            <input
              type="text"
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type your message..."
              disabled={!isConnected}
              className="message-input"
            />
            <button 
              onClick={sendMessage} 
              disabled={!isConnected || !currentMessage.trim()}
              className="send-button"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      <div className="connection-controls">
        {!isConnected && !isConnecting && (
          <button onClick={connectToRoom} className="connect-button">
            Connect to Room
          </button>
        )}
        {isConnected && (
          <button onClick={() => wssWorker?.disconnect()} className="disconnect-button">
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
};

export default ChatApp;