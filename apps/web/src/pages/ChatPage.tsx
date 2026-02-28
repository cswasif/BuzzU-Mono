import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../chat-styles.css';
import { useParams, useNavigate } from 'react-router-dom';
import { useSessionStore } from '../stores/sessionStore';
import { useSignaling, SignalingMessage } from '../hooks/useSignaling';
import { useWebRTC } from '../hooks/useWebRTC';
import { BuzzULogoIcon } from '../../components/SocialLanding/Icons';

const SIGNALING_URL = process.env.SIGNALING_URL || 'wss://buzzu-signaling.md-wasif-faisal.workers.dev';

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
    const { peerId, partnerId, chatMode, isVerified, idToken, leaveRoom, initSession } = useSessionStore();

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [isMuted, setIsMuted] = useState(false);
    const [isCamOff, setIsCamOff] = useState(false);
    const [peerReady, setPeerReady] = useState(false);

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => { initSession(); }, [initSession]);

    // WebRTC
    const {
        localStream,
        remoteStream,
        connectionState,
        isScreenSharing,
        partnerVerified,
        createPeerConnection,
        startLocalMedia,
        createOffer,
        handleOffer,
        handleAnswer,
        addIceCandidate,
        onIceCandidate,
        sendDataMessage,
        startScreenShare,
        stopScreenShare,
        cleanup: cleanupWebRTC,
    } = useWebRTC({
        localIdToken: isVerified ? idToken : null,
        onDataMessage: (data) => {
            try {
                const msg = JSON.parse(data);
                if (msg.type === 'chat') {
                    addChatMessage(msg.from || 'Stranger', msg.text, false);
                }
            } catch { /* ignore non-json messages */ }
        },
        onRemoteStream: (stream) => {
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = stream;
            }
        },
    });

    // Signaling message handler
    const handleSignalingMessage = useCallback(async (msg: SignalingMessage) => {
        switch (msg.type) {
            case 'Offer':
                if (msg.payload) {
                    const answerSdp = await handleOffer(msg.payload);
                    sendAnswerSignal(msg.from!, answerSdp);
                }
                break;
            case 'Answer':
                if (msg.payload) {
                    await handleAnswer(msg.payload);
                }
                break;
            case 'IceCandidate':
                if (msg.payload) {
                    await addIceCandidate(msg.payload);
                }
                break;
            case 'Join':
                if (msg.peer_id !== peerId) {
                    setPeerReady(true);
                    // We initiate the offer
                    await initiateConnection(msg.peer_id!);
                }
                break;
            case 'Leave':
                addChatMessage('System', 'Stranger has disconnected', false);
                setPeerReady(false);
                break;
        }
    }, [handleOffer, handleAnswer, addIceCandidate, peerId]);

    const { isConnected, connect, disconnect, sendOffer, sendAnswer, sendIceCandidate } = useSignaling({
        signalingUrl: SIGNALING_URL,
        roomId: roomId || '',
        peerId,
        onMessage: handleSignalingMessage,
        autoConnect: true,
    });

    const sendAnswerSignal = useCallback((toPeer: string, sdp: string) => {
        sendAnswer(toPeer, sdp);
    }, [sendAnswer]);

    const initiateConnection = useCallback(async (targetPeerId: string) => {
        createPeerConnection();

        // Start local media for video mode
        if (chatMode === 'video') {
            try { await startLocalMedia(true, true); } catch { /* cam not available */ }
        }

        // Set up ICE candidate forwarding
        onIceCandidate((candidate) => {
            sendIceCandidate(targetPeerId, candidate);
        });

        const offerSdp = await createOffer();
        sendOffer(targetPeerId, offerSdp);
    }, [chatMode, createPeerConnection, startLocalMedia, onIceCandidate, sendIceCandidate, createOffer, sendOffer]);

    // Attach local stream to video element
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    // Auto-scroll messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

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

        // Send via WebRTC data channel (P2P, no server)
        sendDataMessage(JSON.stringify({ type: 'chat', from: peerId, text }));

        setInputText('');
    };

    const handleSkip = () => {
        cleanupWebRTC();
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
                        <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
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
                        {connectionState === 'connected' ? '🔗 P2P Active' :
                            connectionState === 'connecting' ? '⏳ Establishing P2P...' : ''}
                    </span>
                </div>
                <span className="encryption-badge">🔒 E2E Encrypted</span>
                {partnerVerified && (
                    <div className="verified-badge-mini flex items-center gap-1 bg-[#f5a623]/10 px-2 py-0.5 rounded border border-[#f5a623]/30">
                        <span className="text-[10px] font-bold text-[#f5a623]">✓ VERIFIED STUDENT</span>
                    </div>
                )}
            </div>

            {/* Chat Messages */}
            <div className="chat-area">
                <div className="messages-container">
                    {messages.length === 0 && (
                        <div className="chat-empty">
                            <p>👋 Say hi to your new stranger!</p>
                            <p className="chat-hint">Messages are end-to-end encrypted and never stored.</p>
                        </div>
                    )}
                    {messages.map(msg => (
                        <div key={msg.id} className={`message ${msg.isOwn ? 'own' : 'other'}`}>
                            <div className="message-sender flex items-center gap-1">
                                {msg.isOwn ? (
                                    <>You {isVerified && <span className="text-[#f5a623] text-xs">✓</span>}</>
                                ) : (
                                    <>Stranger {partnerVerified && <span className="text-[#f5a623] text-xs">✓</span>}</>
                                )}
                            </div>
                            <div className="message-text">{msg.text}</div>
                            <div className="message-time">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="chat-input-area">
                    <input
                        type="text"
                        value={inputText}
                        onChange={e => setInputText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
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
                        <button
                            onClick={isScreenSharing ? stopScreenShare : startScreenShare}
                            className={`control-btn ${isScreenSharing ? 'active' : ''}`}
                        >
                            🖥️
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
