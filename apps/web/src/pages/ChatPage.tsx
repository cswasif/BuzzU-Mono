import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../chat-styles.css';
import { useParams, useNavigate } from 'react-router-dom';
import { useSessionStore } from '../stores/sessionStore';
import { useSignaling } from '../hooks/useSignaling';
import { useWebRTC } from '../hooks/useWebRTC';
import { BuzzULogoIcon } from '../../components/SocialLanding/Icons';

interface ChatMessage {
    id: string;
    from: string;
    text: string;
    timestamp: number;
    isOwn: boolean;
}

export const ChatPage: React.FC = () => {
    const { roomId } = useParams<{ roomId: string }>();
    const navigate = useNavigate();
    const { peerId, partnerId, chatMode, isVerified, idToken, leaveRoom, initSession, avatarSeed } = useSessionStore();

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [isMuted, setIsMuted] = useState(false);
    const [isCamOff, setIsCamOff] = useState(false);
    const [peerReady, setPeerReady] = useState(false);

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { initSession(); }, [initSession]);

    const {
        isConnected, connect, disconnect, localStream, startLocalStream, stopLocalStream,
        sendChatMessage, onChatMessage, onPeerJoin, onPeerLeave
    } = useSignaling();

    const { initiateCall, closePeerConnection, setLocalStream } = useWebRTC();

    useEffect(() => {
        if (roomId && peerId) {
            connect(roomId, peerId);
        }
        return () => disconnect();
    }, [connect, disconnect, roomId, peerId]);

    useEffect(() => {
        onPeerJoin(async (joinedPeerId) => {
            setPeerReady(true);
            let stream = localStream;
            if (chatMode === 'video' && !stream) {
                try {
                    stream = await startLocalStream({ video: true, audio: true });
                } catch { /* ignore */ }
            }
            if (stream) {
                initiateCall(joinedPeerId, stream);
            }
        });

        onPeerLeave((leftPeerId) => {
            addChatMessage('System', 'Stranger has disconnected', false);
            setPeerReady(false);
            closePeerConnection(leftPeerId);
        });

        onChatMessage((msg, from) => {
            if (from !== peerId) {
                addChatMessage(msg.username || 'Stranger', msg.content, false);
            }
        });
    }, [onPeerJoin, onPeerLeave, onChatMessage, chatMode, localStream, startLocalStream, closePeerConnection, initiateCall, peerId]);

    // Attach local stream to video element
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
        setLocalStream(localStream ?? null);
    }, [localStream, setLocalStream]);



    // Auto-scroll handled by CSS column-reverse pattern + reversed message mapping
    const scrollToBottom = useCallback(() => {
        // No-op - handled by CSS
    }, []);

    const addChatMessage = (from: string, text: string, isOwn: boolean) => {
        setMessages(prev => [...prev, {
            id: `${Date.now()}_${Math.random()}`,
            from,
            text,
            timestamp: Date.now(),
            isOwn,
        }]);
    };

    const handleSendMessage = () => {
        if (!inputText.trim()) return;

        const text = inputText.trim();
        addChatMessage(peerId, text, true);

        sendChatMessage(partnerId || '', {
            id: `${Date.now()}_${Math.random()}`,
            username: 'You',
            avatarSeed: 'test',
            timestamp: Date.now().toString(),
            content: text
        });

        setInputText('');
    };

    const handleSkip = () => {
        stopLocalStream();
        disconnect();
        leaveRoom();
        navigate('/match');
    };

    const toggleMute = () => {
        if (localStream) {
            localStream.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
            setIsMuted(!isMuted);
        }
    };

    const toggleCamera = () => {
        if (localStream) {
            localStream.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
            setIsCamOff(!isCamOff);
        }
    };

    if (!roomId) {
        navigate('/match');
        return null;
    }

    return (
        <div className="chat-page">
            {/* Video Area */}
            {chatMode === 'video' && (
                <div className="video-area">
                    <div className="remote-video-container">
                        <video ref={remoteVideoRef} data-remote-peer={partnerId} autoPlay playsInline className="remote-video" />
                        {!peerReady && (
                            <div className="video-placeholder">
                                <span>Waiting for stranger...</span>
                            </div>
                        )}
                    </div>
                    <div className="local-video-container">
                        <video ref={localVideoRef} autoPlay playsInline muted className="local-video" />
                    </div>
                </div>
            )}

            {/* Connection Status */}
            <div className="status-bar">
                <div className="flex items-center gap-2">
                    <BuzzULogoIcon className="w-5 h-5 text-primary" />
                    <span className="font-bold text-sm tracking-tight text-white/90">BuzzU</span>
                </div>
                <div className="flex-grow flex items-center justify-center gap-4">
                    <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
                        {isConnected ? '🟢 Connected' : '🔴 Connecting...'}
                    </span>
                    <span className="connection-state">
                        {peerReady ? '🔗 P2P Active' : '⏳ Establishing P2P...'}
                    </span>
                </div>
                <span className="encryption-badge">🔒 E2E Encrypted</span>
                {/* Removed Partner Verified temporarily as hook rewritten */}
            </div>

            {/* Chat Messages */}
            <div className="chat-area">
                <div className="messages-container">
                    {[...messages].reverse().map(msg => (
                        <div key={msg.id} className={`message ${msg.isOwn ? 'own' : 'other'}`}>
                            <div className="message-sender flex items-center gap-1">
                                {msg.isOwn ? (
                                    <>You {isVerified && <span className="text-primary text-xs">✓</span>}</>
                                ) : (
                                    <>Stranger</>
                                )}
                            </div>
                            <div className="message-text">{msg.text}</div>
                            <div className="message-time">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    ))}
                    {messages.length === 0 && (
                        <div className="chat-empty">
                            <p>👋 Say hi to your new stranger!</p>
                            <p className="chat-hint">Messages are end-to-end encrypted and never stored.</p>
                        </div>
                    )}
                </div>

                {/* Input */}
                <div className="chat-input-area">
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputText}
                        onChange={e => setInputText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                        onFocus={() => {
                            // Handled by CSS column-reverse
                        }}
                        placeholder="Type a message..."
                        className="chat-input"
                    />
                    <button onClick={handleSendMessage} disabled={!inputText.trim()} className="send-btn">
                        Send
                    </button>
                </div>
            </div>

            {/* Controls */}
            <div className="controls-bar">
                {chatMode === 'video' && (
                    <>
                        <button onClick={toggleMute} className={`control-btn ${isMuted ? 'active' : ''}`}>
                            {isMuted ? '🔇' : '🎤'}
                        </button>
                        <button onClick={toggleCamera} className={`control-btn ${isCamOff ? 'active' : ''}`}>
                            {isCamOff ? '📷' : '📹'}
                        </button>

                    </>
                )}
                <button onClick={handleSkip} className="skip-btn">
                    ⏭️ Skip
                </button>
            </div>
        </div>
    );
};

export default ChatPage;
