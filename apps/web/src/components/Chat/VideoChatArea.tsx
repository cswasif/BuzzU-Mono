import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CameraSetupLobby } from './CameraSetupLobby';
import { ShieldCheck } from 'lucide-react';
import { MessageInput } from './MessageInput';
import { ReportModal } from './ReportModal';
import { ProfileModal } from './ProfileModal';
import { PartnerSkippedView } from './PartnerSkippedView';
import { Message } from './types';
import { SettingsIcon, VideoIcon } from '../Dashboard_Updated/Icons';
import { useMatching } from '../../hooks/useMatching';
import { useSignaling } from '../../hooks/useSignaling';
import { useWebRTC } from '../../hooks/useWebRTC';
import { useSessionStore } from '../../stores/sessionStore';
import { useCrypto } from '../../hooks/useCrypto';
import { useCamera } from '../../hooks/useCamera';
import { BackgroundKeepAlive } from './BackgroundKeepAlive';

function makeId() {
    return Date.now().toString() + Math.random().toString(36).slice(2);
}

function now() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type ConnectionState = 'idle' | 'setup' | 'searching' | 'connecting' | 'connected' | 'partner_skipped' | 'self_skipped';

export function VideoChatArea() {
    const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
    const [partner, setPartner] = useState<{ name: string; avatar: string } | null>(null);
    const partnerRef = useRef<{ name: string; avatar: string } | null>(null);
    const handledMatchId = useRef<string | null>(null);
    const keyExchangeInitiatedRef = useRef<string | null>(null);

    const {
        isMatching,
        matchData,
        error: matchingError,
        startMatching,
        stopMatching,
        setMatchData,
    } = useMatching();

    const {
        isConnected: signalingConnected,
        remoteStream,
        connect: connectSignaling,
        disconnect: disconnectSignaling,
        error: signalingError,
        onPeerLeave,
        sendChatMessage,
        onChatMessage,
        onTyping,
        sendTypingState,
        publishKeys,
        requestKeys,
        sendKeysResponse,
        sendHandshake,
        sendFriendRequest: sendFriendRequestSignaling,
        onFriendRequest,
        onKeysRequest,
        onKeysResponse,
        onHandshake,
    } = useSignaling();

    const { createPeerConnection, closePeerConnection, initiateCall, setLocalStream } = useWebRTC();
    const { partnerId, peerId, currentRoomId, isVerified, partnerIsVerified, partnerAvatarUrl, partnerName, displayName,
        friendRequestsSent, friendRequestsReceived, friendList,
        sendFriendRequest: sendFriendRequestAction, acceptFriendRequest, declineFriendRequest, handleReceivedFriendRequest
        , avatarSeed, avatarUrl, leaveRoom, setPartnerAvatarUrl } = useSessionStore();
    const {
        isReady: isCryptoReady,
        encryptMessage,
        decryptMessage,
        generatePreKeyBundle,
        initiateSignalSession,
        respondToSignalSession
    } = useCrypto();
    const [isSignalReady, setIsSignalReady] = useState(false);

    const {
        localStream,
        isCameraOn,
        isMuted,
        isCameraLoading,
        cameraError,
        availableCameras,
        availableMicrophones,
        currentCameraId,
        currentMicrophoneId,
        startCamera,
        stopCamera,
        toggleCamera,
        toggleMute,
        switchCamera,
        switchMicrophone,
        refreshDevices,
        getOptimalConstraints,
        isMirrored,
        audioLevel,
        toggleMirror,
    } = useCamera();

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const remoteAudioRef = useRef<HTMLAudioElement>(null);
    const [isVoiceOnly, setIsVoiceOnly] = useState(false);
    const [volumeLevel, setVolumeLevel] = useState(0);

    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [selectedProfile, setSelectedProfile] = useState<{ username: string; avatarSeed: string; avatarUrl?: string | null; isVerified?: boolean } | null>(null);

    // For text overlay
    const [messages, setMessages] = useState<Message[]>([]);
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [isGifPickerOpen, setIsGifPickerOpen] = useState(false);

    useEffect(() => {
        if (localStream && localVideoRef.current) {
            localVideoRef.current.srcObject = localStream;
        }
        setLocalStream(localStream ?? null);
    }, [localStream, setLocalStream]);

    useEffect(() => {
        if (remoteStream && remoteVideoRef.current) {
            const videoElement = remoteVideoRef.current;
            videoElement.srcObject = remoteStream;

            // ── Low-latency video element configuration ───────────────
            // Matches OpenNOW (GeForce NOW client) pattern:
            // Prevents Chrome from offering Cast/remote playback (adds buffering)
            videoElement.disableRemotePlayback = true;
            // No preload buffering — WebRTC pushes frames directly
            videoElement.preload = 'none';
            // Explicit 1.0 playback rate — some mobile browsers adjust this
            videoElement.playbackRate = 1.0;
            videoElement.defaultPlaybackRate = 1.0;

            // Log stream info
            console.log('[VideoChatArea] Remote stream info:', {
                id: remoteStream.id,
                videoTracks: remoteStream.getVideoTracks().length,
                audioTracks: remoteStream.getAudioTracks().length,
                active: remoteStream.active
            });

            // Ensure video tracks are enabled
            remoteStream.getVideoTracks().forEach(track => {
                console.log('[VideoChatArea] Remote video track:', track.id, 'enabled:', track.enabled, 'state:', track.readyState, 'kind:', track.kind);
                track.enabled = true;
            });

            remoteStream.getAudioTracks().forEach(track => {
                console.log('[VideoChatArea] Remote audio track:', track.id, 'enabled:', track.enabled, 'state:', track.readyState, 'kind:', track.kind);
                track.enabled = true;
            });

            // Force play on mobile browsers with detailed error logging
            videoElement.play().then(() => {
                console.log('[VideoChatArea] Remote video playing successfully');
            }).catch(err => {
                console.error('[VideoChatArea] Failed to play remote video:', err.name, err.message);

                // Try to play with user interaction hint
                const playPromise = videoElement.play();
                if (playPromise !== undefined) {
                    playPromise.catch(playError => {
                        console.error('[VideoChatArea] Second play attempt failed:', playError.name, playError.message);
                    });
                }
            });

            // Log video element state
            setTimeout(() => {
                console.log('[VideoChatArea] Video element state:', {
                    readyState: videoElement.readyState,
                    networkState: videoElement.networkState,
                    videoWidth: videoElement.videoWidth,
                    videoHeight: videoElement.videoHeight,
                    muted: videoElement.muted,
                    autoplay: videoElement.autoplay,
                    playsInline: videoElement.playsInline
                });
            }, 1000);
        }
        if (remoteStream && remoteAudioRef.current) {
            const audioElement = remoteAudioRef.current;
            audioElement.srcObject = remoteStream;
            audioElement.muted = false;
            audioElement.play().then(() => {
                console.log('[VideoChatArea] Remote audio playing successfully');
            }).catch(err => {
                console.error('[VideoChatArea] Failed to play remote audio:', err.name, err.message);
            });
        }
        if (!remoteStream) {
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = null;
            }
            if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = null;
            }
        }
    }, [remoteStream]);

    // Mount-only: start camera on mount, stop on unmount.
    // IMPORTANT: partnerId must NOT be in deps — it changes when matched,
    // which would trigger cleanup (stopCamera + disconnectSignaling) mid-session.
    useEffect(() => {
        async function setupCamera() {
            try {
                await startCamera();
            } catch (err) {
                console.error('[VideoChatArea] Error accessing media devices:', err);
            }
        }
        setupCamera();

        return () => {
            stopCamera();
            disconnectSignaling();
            // Use store directly to get current partnerId at cleanup time
            const currentPartnerId = useSessionStore.getState().partnerId;
            if (currentPartnerId) {
                closePeerConnection(currentPartnerId);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (matchData) {
            if (handledMatchId.current === matchData.room_id) return;
            handledMatchId.current = matchData.room_id;
            keyExchangeInitiatedRef.current = null;

            setConnectionState('connected');
            // Small delay prevents race condition with disconnectSignaling from previous skips
            setTimeout(() => {
                connectSignaling(matchData.room_id, matchData.peer_id);

                if (isCryptoReady) {
                    console.log('[VideoChatArea] Initiating Signal key exchange...');
                    const bundle = generatePreKeyBundle();
                    publishKeys(bundle);
                    requestKeys(matchData.partner_id);
                    keyExchangeInitiatedRef.current = matchData.room_id;
                } else {
                    console.log('[VideoChatArea] Crypto not ready yet, will retry when ready...');
                }
            }, 50);
        } else {
            handledMatchId.current = null;
            keyExchangeInitiatedRef.current = null;
            setConnectionState((prev) => {
                if (prev === 'setup' || prev === 'partner_skipped' || prev === 'self_skipped') return prev;
                if (isMatching) return 'searching';
                return 'idle';
            });
            if (!isMatching) {
                setPartner(null);
            }
        }
    }, [matchData, connectSignaling, isMatching]);

    // Initiate key exchange when crypto becomes ready (handles race condition)
    useEffect(() => {
        if (isCryptoReady && matchData && !keyExchangeInitiatedRef.current && currentRoomId === matchData.room_id) {
            console.log('[VideoChatArea] Crypto ready now, initiating delayed key exchange...');
            const bundle = generatePreKeyBundle();
            publishKeys(bundle);
            requestKeys(matchData.partner_id);
            keyExchangeInitiatedRef.current = matchData.room_id;
        }
    }, [isCryptoReady, matchData, currentRoomId, publishKeys, requestKeys, generatePreKeyBundle]);

    // Initiate WebRTC call when Signal session is ready (only the peer with higher peerId initiates)
    useEffect(() => {
        if (isSignalReady && partnerId && currentRoomId && localStream && peerId > partnerId) {
            console.log('[VideoChatArea] Signal session ready, initiating WebRTC call to:', partnerId);
            initiateCall(partnerId, localStream);
        }
    }, [isSignalReady, partnerId, currentRoomId, initiateCall, peerId, localStream]);

    // Handle Signaling Events
    useEffect(() => {
        onPeerLeave((leftPeerId) => {
            if (leftPeerId === partnerId) {
                console.log('[VideoChatArea] Partner skipped/left the match!');
                setConnectionState('partner_skipped');
                disconnectSignaling();
                if (partnerId) {
                    closePeerConnection(partnerId);
                }
                stopMatching(true);
                leaveRoom();
                setMatchData(null);
                setIsSignalReady(false);
                setPartner(null);
                partnerRef.current = null;
                handledMatchId.current = null;
                keyExchangeInitiatedRef.current = null;
                setMessages([]);
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = null;
                }
                if (remoteAudioRef.current) {
                    remoteAudioRef.current.srcObject = null;
                }
            }
        });

        onChatMessage(async (message, from) => {
            if (import.meta.env.DEV) console.log('[VideoChatArea] Received chat message:', message, 'from:', from);

            let decryptedContent = message.content;
            let decryptionFailed = false;
            const isEncryptedMsg = !!(message as any).isEncrypted;

            if (message.encryptedContent && isCryptoReady && decryptMessage) {
                try {
                    const ciphertext = new Uint8Array(JSON.parse(message.encryptedContent));
                    const decrypted = await decryptMessage(from, ciphertext);
                    decryptedContent = new TextDecoder().decode(decrypted);
                    if (import.meta.env.DEV) console.log('[VideoChatArea] Successfully decrypted message from', from);
                } catch (err) {
                    console.error('[VideoChatArea] Failed to decrypt message:', err);
                    decryptionFailed = true;
                }
            }

            if (decryptionFailed || (isEncryptedMsg && decryptedContent === '[encrypted]')) {
                decryptedContent = '\u26a0 Message could not be decrypted';
            }

            setMessages(prev => [...prev, {
                id: message.id,
                username: message.username,
                avatarSeed: message.avatarSeed,
                avatarUrl: message.avatarUrl || null,
                timestamp: message.timestamp,
                content: decryptedContent,
                isVerified: partnerIsVerified,
                replyToMessage: message.replyToMessage ? {
                    id: message.replyToMessage.id,
                    username: 'Partner',
                    avatarSeed: from,
                    avatarUrl: message.avatarUrl || null,
                    timestamp: message.timestamp,
                    content: message.replyToMessage.content,
                } : null,
            }]);

            if (from === partnerId && message.avatarUrl) {
                setPartnerAvatarUrl(message.avatarUrl);
            }
        });

        onTyping((isTyping, from) => {
            if (from === partnerId) {
                setIsPartnerTyping(isTyping);
            }
        });

        onKeysRequest((from) => {
            if (from === partnerId && isCryptoReady) {
                console.log('[VideoChatArea] Received key request from partner');
                const bundle = generatePreKeyBundle();
                sendKeysResponse(from, bundle as any);
            }
        });

        onKeysResponse((bundleStr, from) => {
            if (from === partnerId && isCryptoReady) {
                // ROLE ENFORCEMENT: Only the initiator (lower peerId) processes KeysResponse
                const myPeerId = useSessionStore.getState().peerId;
                const isInitiator = myPeerId < from;
                if (!isInitiator) {
                    console.log('[VideoChatArea] [Responder] Ignoring KeysResponse — waiting for SignalHandshake');
                    return;
                }
                try {
                    console.log('[VideoChatArea] [Initiator] Received key response, initiating session...');
                    // Pass bundle string directly — no need to JSON.parse
                    const bundlePayload = typeof bundleStr === 'string' ? bundleStr : JSON.stringify(bundleStr);
                    const initiation = initiateSignalSession(from, bundlePayload);
                    sendHandshake(from, initiation as any);
                    setIsSignalReady(true);
                } catch (err) {
                    console.error('[VideoChatArea] Failed to initiate Signal session:', err);
                }
            }
        });

        onHandshake((initiationStr, from) => {
            if (from === partnerId && isCryptoReady) {
                // ROLE ENFORCEMENT: Only the responder (higher peerId) processes SignalHandshake
                const myPeerId = useSessionStore.getState().peerId;
                const isResponder = myPeerId > from;
                if (!isResponder) {
                    console.log('[VideoChatArea] [Initiator] Ignoring SignalHandshake — already have session');
                    return;
                }
                try {
                    console.log('[VideoChatArea] [Responder] Received handshake, establishing session...');
                    // Pass initiation string directly — no need to JSON.parse
                    const initiationPayload = typeof initiationStr === 'string' ? initiationStr : JSON.stringify(initiationStr);
                    respondToSignalSession(from, initiationPayload);
                    setIsSignalReady(true);
                } catch (err) {
                    console.error('[VideoChatArea] Failed to respond to Signal handshake:', err);
                }
            }
        });

        onFriendRequest((action, from, username, avatarSeed) => {
            console.log('[VideoChatArea] Received friend request action:', action, 'from:', from);
            if (action === 'send') {
                handleReceivedFriendRequest({
                    id: from,
                    username: username || 'Partner',
                    avatarSeed: avatarSeed || from
                });
            } else if (action === 'accept') {
                acceptFriendRequest(from);
            } else if (action === 'decline') {
                declineFriendRequest(from);
            }
        });
    }, [onPeerLeave, onChatMessage, onTyping, partnerId, disconnectSignaling, partnerIsVerified, isCryptoReady, decryptMessage, onKeysRequest, onKeysResponse, onHandshake, generatePreKeyBundle, sendKeysResponse, initiateSignalSession, respondToSignalSession, sendHandshake, onFriendRequest, closePeerConnection, stopMatching, leaveRoom, setMatchData]);

    const handleAddFriend = useCallback(() => {
        if (!partnerId) return;
        sendFriendRequestAction(partnerId);
        sendFriendRequestSignaling(partnerId, 'send', displayName, peerId);
    }, [partnerId, sendFriendRequestAction, sendFriendRequestSignaling, displayName, peerId]);

    const handleAcceptFriendRequest = useCallback(() => {
        if (!partnerId) return;
        acceptFriendRequest(partnerId);
        sendFriendRequestSignaling(partnerId, 'accept');
    }, [partnerId, acceptFriendRequest, sendFriendRequestSignaling]);

    const handleDeclineFriendRequest = useCallback(() => {
        if (!partnerId) return;
        declineFriendRequest(partnerId);
        sendFriendRequestSignaling(partnerId, 'decline');
    }, [partnerId, declineFriendRequest, sendFriendRequestSignaling]);

    const getFriendRequestStatus = useCallback((targetPeerId: string): 'none' | 'sent' | 'received' | 'friends' => {
        if (friendList.some(f => f.id === targetPeerId)) return 'friends';
        if (friendRequestsSent.includes(targetPeerId)) return 'sent';
        if (friendRequestsReceived[targetPeerId]) return 'received';
        return 'none';
    }, [friendList, friendRequestsSent, friendRequestsReceived]);

    // Remote stream is handled by the sync effect on line 82

    const handleStart = useCallback(() => {
        setConnectionState('setup');
    }, []);

    const handleStop = () => {
        setConnectionState('idle');
        stopMatching();
        disconnectSignaling();
        leaveRoom();
        setMatchData(null);
        setIsSignalReady(false);
        setPartner(null);
        partnerRef.current = null;
        handledMatchId.current = null;
        keyExchangeInitiatedRef.current = null;
        setMessages([]);
        if (partnerId) {
            closePeerConnection(partnerId);
        }
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
        }
        if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = null;
        }
    };
    const handleSkip = () => {
        stopMatching(true);
        disconnectSignaling();
        leaveRoom();
        setMatchData(null);
        setIsSignalReady(false);
        setPartner(null);
        partnerRef.current = null;
        handledMatchId.current = null;
        keyExchangeInitiatedRef.current = null;
        setMessages([]);
        if (partnerId) {
            closePeerConnection(partnerId);
        }
        setConnectionState('self_skipped');
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
        }
        if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = null;
        }
    };

    const handleSendMessage = useCallback(async (content: string, replyToMessage?: Message | null) => {
        const message = {
            id: makeId(),
            username: 'Me',
            avatarSeed: avatarSeed,
            avatarUrl: avatarUrl || null,
            timestamp: now(),
            content,
            isVerified: isVerified,
            replyToMessage: replyToMessage || null,
        };

        setMessages(prev => [...prev, message]);

        if (sendChatMessage && partnerId) {
            let encryptedContent: string | undefined;
            let plaintextContent = content;

            if (isCryptoReady && encryptMessage) {
                if (isSignalReady) {
                    try {
                        const ciphertext = await encryptMessage(partnerId, content);
                        encryptedContent = JSON.stringify(Array.from(ciphertext));
                        console.log('[VideoChatArea] Successfully encrypted message for', partnerId);
                    } catch (err) {
                        console.error('[VideoChatArea] Failed to encrypt message:', err);
                        // SECURITY: Do NOT fall back to plaintext when encryption is expected.
                        // Mark the local message as failed and abort sending.
                        setMessages(prev => prev.map(m =>
                            m.id === message.id
                                ? { ...m, content: '\u26a0 Encryption failed \u2014 message not sent' }
                                : m
                        ));
                        return;
                    }
                } else {
                    console.warn('[VideoChatArea] Signal not ready, sending plaintext...');
                }
            }

            const isEncrypted = !!encryptedContent;
            sendChatMessage(partnerId, {
                id: message.id,
                username: displayName || 'Anonymous',
                avatarSeed: avatarSeed,
                avatarUrl: avatarUrl || null,
                timestamp: message.timestamp,
                // SECURITY: Never send plaintext alongside encrypted content
                content: isEncrypted ? '[encrypted]' : plaintextContent,
                encryptedContent,
                isVerified: isVerified,
                replyToMessage: replyToMessage ? {
                    id: replyToMessage.id,
                    content: isEncrypted ? '[encrypted]' : replyToMessage.content,
                } : null,
            });
        }
        setReplyingTo(null);
    }, [sendChatMessage, partnerId, displayName, isVerified, isCryptoReady, encryptMessage, isSignalReady, avatarSeed, avatarUrl]);

    const handleTyping = useCallback((isTyping: boolean) => {
        if (partnerId && sendTypingState) {
            sendTypingState(partnerId, isTyping);
        }
    }, [partnerId, sendTypingState]);

    const handleProfileClick = (username: string, avatarSeed: string, avatarUrl?: string | null, isVerified?: boolean) => {
        const currentAvatarUrl = username === partnerName ? partnerAvatarUrl : (avatarUrl || null);
        setSelectedProfile({ username, avatarSeed, avatarUrl: currentAvatarUrl, isVerified });
        setIsProfileModalOpen(true);
    };

    const toggleMirrorHandler = useCallback(() => {
        toggleMirror();
    }, [toggleMirror]);

    return (
        <main className="w-full flex h-full flex-grow flex-col overflow-hidden bg-background relative">
            <div className="flex-grow overflow-hidden flex flex-col relative z-0">

                {connectionState === 'idle' ? (
                    <div className="flex-grow flex items-center justify-center flex-col gap-6 absolute inset-0 z-10 bg-zinc-950">
                        {/* Immersive Background */}
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/10 via-background to-background opacity-50" />

                        <div className="relative group cursor-pointer" onClick={() => setConnectionState('setup')}>
                            <motion.div
                                className="absolute -inset-10 bg-indigo-500/20 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ duration: 4, repeat: Infinity }}
                            />
                            <div className="p-8 rounded-[40px] bg-white/5 border border-white/10 backdrop-blur-2xl shadow-2xl z-10">
                                <VideoIcon className="w-16 h-16 text-indigo-400 drop-shadow-[0_0_15px_rgba(129,140,248,0.5)]" />
                            </div>
                        </div>

                        <div className="flex flex-col items-center gap-3 z-10">
                            <h1 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-200 to-white/60 tracking-tight">Ready to Buzz?</h1>
                            <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-[0.5em] opacity-60">Click START to begin your journey</p>
                        </div>

                        <motion.button
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            onClick={() => setConnectionState('setup')}
                            className="mt-4 px-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-[0.2em] rounded-full shadow-[0_20px_40px_rgba(79,70,229,0.3)] transition-all active:scale-95 z-10"
                        >
                            Get Started
                        </motion.button>
                    </div>
                ) : connectionState === 'setup' ? (
                    <div className="absolute inset-0 z-[60] p-4 bg-zinc-950">
                        <CameraSetupLobby
                            localStream={localStream}
                            availableCameras={availableCameras}
                            availableMicrophones={availableMicrophones}
                            currentCameraId={currentCameraId}
                            currentMicrophoneId={currentMicrophoneId}
                            isCameraOn={isCameraOn}
                            isMuted={isMuted}
                            isMirrored={isMirrored}
                            audioLevel={audioLevel}
                            onToggleCamera={toggleCamera}
                            onToggleMute={toggleMute}
                            onToggleMirror={toggleMirrorHandler}
                            onSwitchCamera={switchCamera}
                            onSwitchMicrophone={switchMicrophone}
                            onStart={() => {
                                setMessages([]);
                                setPartner(null);
                                partnerRef.current = null;
                                setIsSignalReady(false);
                                setConnectionState('searching');
                                startMatching();
                            }}
                        />
                    </div>
                ) : connectionState === 'searching' ? (
                    <div className="flex-grow flex items-center justify-center flex-col gap-8 animate-in fade-in duration-700 absolute inset-0 z-10 bg-zinc-950 overflow-hidden">
                        {/* Animated Background for Search */}
                        <div className="absolute inset-0 opacity-20">
                            {[...Array(3)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/30 via-transparent to-transparent"
                                    animate={{
                                        scale: [1, 1.5, 1],
                                        opacity: [0.3, 0.6, 0.3],
                                        x: [0, (i - 1) * 100, 0],
                                        y: [0, (i - 1) * 50, 0]
                                    }}
                                    transition={{
                                        duration: 8 + i * 2,
                                        repeat: Infinity,
                                        ease: "easeInOut"
                                    }}
                                />
                            ))}
                        </div>

                        <div className="relative group">
                            <motion.div
                                className="absolute -inset-8 bg-indigo-500/20 rounded-full blur-2xl group-hover:bg-indigo-500/30 transition-all duration-500"
                                animate={{ scale: [0.8, 1.1, 0.8] }}
                                transition={{ duration: 3, repeat: Infinity }}
                            />
                            <div className="w-32 h-32 relative flex items-center justify-center z-10">
                                <svg
                                    className="w-full h-full animate-logo-breathe filter drop-shadow-[0_0_15px_rgba(141,150,246,0.4)]"
                                    viewBox="-2.4 -2.4 28.80 28.80"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        fill="#8d96f6"
                                        d="M19.442 21.355c.55-.19.74-.256.99-.373.342-.152.605-.39.605-.818a.846.846 0 00-.605-.813c-.318-.092-.703.042-.99.122l-5.42 1.46a7.808 7.808 0 01-4.057 0l-5.407-1.46c-.287-.08-.672-.214-.99-.122a.847.847 0 00-.605.813c0 .427.263.666.605.818.25.117.44.184.99.373l5.138 1.79c1.491.52 3.104.52 4.601 0zm-9.263-3.224a7.622 7.622 0 003.636 0l8.01-1.967c.507-.122.709-.165.99-.257.354-.116.605-.415.605-.806a.847.847 0 00-.605-.813c-.281-.08-.697.024-.99.08l-8.664 1.545a6.813 6.813 0 01-2.334 0l-8.652-1.545c-.293-.056-.708-.16-.99-.08a.847.847 0 00-.604.813c0 .39.25.69.604.806.282.092.483.135.99.257zM14.75.621a24.43 24.43 0 00-5.511 0L6.495.933c-.294.03-.715.055-.99.14-.28.092-.605.355-.605.807 0 .39.257.702.605.806.281.08.696.074.99.074h11.01c.293 0 .709.006.99-.074a.835.835 0 00.605-.806c0-.452-.324-.715-.605-.807-.275-.085-.697-.11-.99-.14zm6.037 6.767c.3-.019.709-.037.99-.116a.84.84 0 000-1.614c-.281-.085-.69-.073-.99-.073H3.214c-.3 0-.709-.012-.99.073a.84.84 0 000 1.614c.281.079.69.097.99.116l7.808.556c.642.042 1.308.042 1.943 0zm1.62 4.242c.513-.08.708-.104.989-.202.354-.121.605-.409.605-.806a.84.84 0 00-.605-.806c-.28-.086-.69-.019-.99.012l-9.232.929c-.776.079-1.582.079-2.358 0l-9.22-.93c-.3-.03-.715-.097-.99-.011a.84.84 0 00-.605.806c0 .397.25.685.605.806.275.092.476.123.99.202l8.823 1.418c1.038.165 2.12.165 3.158 0Z"
                                    />
                                </svg>
                            </div>
                        </div>

                        <div className="flex flex-col items-center gap-3 z-10 translate-y-4">
                            <h2 className="text-2xl font-black text-white tracking-[0.15em] uppercase drop-shadow-lg">Searching...</h2>
                            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.4em] opacity-80">Finding your next perfect match</p>
                            <div className="flex gap-1.5 mt-2">
                                <motion.div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1, repeat: Infinity }} />
                                <motion.div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1, repeat: Infinity, delay: 0.2 }} />
                                <motion.div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1, repeat: Infinity, delay: 0.4 }} />
                            </div>
                        </div>
                    </div>
                ) : connectionState === 'partner_skipped' || connectionState === 'self_skipped' ? (
                    <div className="flex-grow flex items-center justify-center absolute inset-0 z-10 bg-zinc-950 overflow-hidden">
                        {/* Dynamic Background */}
                        <div className="absolute inset-0 bg-gradient-to-b from-red-500/5 to-transparent pointer-events-none opacity-40" />

                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="w-full max-w-lg mx-auto p-8 glass-card border border-white/5 rounded-[32px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] z-10"
                        >
                            <PartnerSkippedView
                                onReport={() => setIsReportModalOpen(true)}
                                onGetPremium={() => console.log('Premium clicked')}
                                isSelfSkip={connectionState === 'self_skipped'}
                            />
                        </motion.div>
                    </div>
                ) : (
                    <>
                        {/* Remote Video (Partner) - Edge to Edge */}
                        <div className="absolute inset-0 bg-zinc-950 flex items-center justify-center overflow-hidden">
                            {isVoiceOnly ? (
                                <div className="flex flex-col items-center justify-center space-y-8 animate-in fade-in zoom-in duration-700">
                                    {/* Premium Glowing Orb with Waveform inside */}
                                    <div className="relative w-64 h-64 flex items-center justify-center">
                                        <motion.div
                                            className="absolute -inset-12 rounded-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/30 via-emerald-500/10 to-transparent pointer-events-none will-change-transform"
                                            animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0.7, 0.4] }}
                                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                        />
                                        <div className="absolute inset-0 rounded-full bg-zinc-950/40 backdrop-blur-3xl border border-indigo-500/20 shadow-[0_0_60px_rgba(99,102,241,0.3)] flex items-center justify-center overflow-hidden transform-gpu">
                                            <div className="flex items-center justify-center gap-1.5 h-16 px-4 w-full">
                                                {[...Array(18)].map((_, i) => (
                                                    <motion.div
                                                        key={i}
                                                        className="w-1.5 h-full rounded-full bg-gradient-to-t from-indigo-400 via-emerald-400 to-teal-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)] origin-bottom will-change-transform"
                                                        animate={{ scaleY: [0.2, 0.3 + (Math.sin(i * 1.5) * 0.5 + 0.5) * 0.7, 0.2] }}
                                                        transition={{ duration: 0.8 + Math.random() * 0.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.05 }}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-center gap-2 z-10 text-center">
                                        <h3 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-emerald-400 tracking-tight">Blind Date</h3>
                                        <p className="text-zinc-500 text-xs font-semibold tracking-[0.3em] uppercase opacity-75">Audio Only Mode Active</p>
                                    </div>
                                </div>
                            ) : remoteStream ? (
                                <video
                                    ref={remoteVideoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    controls={false}
                                    disablePictureInPicture
                                    disableRemotePlayback
                                    className="w-full h-full object-contain transform-gpu bg-black will-change-transform"
                                    style={{
                                        transform: 'scaleX(-1)',
                                        WebkitTransform: 'scaleX(-1)',
                                        backfaceVisibility: 'hidden',
                                        WebkitBackfaceVisibility: 'hidden',
                                    }}
                                    onError={(e) => console.error('[VideoChatArea] Remote video error:', e)}
                                    onLoadedMetadata={() => {
                                        console.log('[VideoChatArea] Remote video metadata loaded');
                                        const video = remoteVideoRef.current;
                                        if (video) {
                                            video.play().catch(err => console.error('[VideoChatArea] Auto-play failed:', err));
                                        }
                                    }}
                                    onCanPlay={() => {
                                        console.log('[VideoChatArea] Remote video can play');
                                    }}
                                    onPlay={() => console.log('[VideoChatArea] Remote video playing')}
                                    onWaiting={() => console.log('[VideoChatArea] Remote video buffering')}
                                    onPlaying={() => console.log('[VideoChatArea] Remote video resumed')}
                                    onStalled={() => console.log('[VideoChatArea] Remote video stalled')}
                                    onSuspend={() => console.log('[VideoChatArea] Remote video suspended')}
                                    onRateChange={(e) => console.log('[VideoChatArea] Playback rate changed:', e.currentTarget.playbackRate)}
                                    onResize={(e) => {
                                        const video = e.currentTarget;
                                        console.log('[VideoChatArea] Remote video resized:', video.videoWidth, 'x', video.videoHeight);
                                    }}
                                    onProgress={(e) => {
                                        const video = e.currentTarget;
                                        if (video.buffered.length > 0 && video.duration && video.duration > 0) {
                                            console.log('[VideoChatArea] Buffer progress:',
                                                (video.buffered.end(video.buffered.length - 1) / video.duration * 100).toFixed(1) + '%');
                                        }
                                    }}
                                    onTimeUpdate={(e) => {
                                        const video = e.currentTarget;
                                        if (video.readyState < 3) {
                                            console.log('[VideoChatArea] Ready state:', video.readyState);
                                        }
                                    }}
                                />
                            ) : null}
                            {remoteStream && (
                                <audio ref={remoteAudioRef} autoPlay playsInline />
                            )}
                        </div>

                        {/* Local Video (PIP) - Enhanced Draggable */}
                        {!isVoiceOnly && (
                            <motion.div
                                drag
                                dragConstraints={{ left: -1000, right: 0, top: -1000, bottom: 0 }}
                                dragElastic={0.05}
                                dragMomentum={false}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98, cursor: 'grabbing' }}
                                className="absolute bottom-6 right-6 w-40 h-56 sm:w-56 sm:h-72 bg-black rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-zinc-800/50 z-40 transform-gpu cursor-grab"
                            >
                                <video
                                    ref={localVideoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    disablePictureInPicture
                                    className={`w-full h-full object-contain transition-opacity duration-500 will-change-transform ${!isCameraOn ? 'opacity-0' : 'opacity-100'}`}
                                    style={{
                                        transform: 'scaleX(-1)',
                                        WebkitTransform: 'scaleX(-1)',
                                        backfaceVisibility: 'hidden',
                                        WebkitBackfaceVisibility: 'hidden',
                                    }}
                                    onError={(e) => console.error('[VideoChatArea] Local video error:', e)}
                                    onLoadedMetadata={() => {
                                        console.log('[VideoChatArea] Local video metadata loaded');
                                        const video = localVideoRef.current;
                                        if (video) {
                                            video.play().catch(err => console.error('[VideoChatArea] Local auto-play failed:', err));
                                        }
                                    }}
                                    onCanPlay={() => {
                                        console.log('[VideoChatArea] Local video can play');
                                    }}
                                    onPlay={() => console.log('[VideoChatArea] Local video playing')}
                                    onWaiting={() => console.log('[VideoChatArea] Local video buffering')}
                                    onPlaying={() => console.log('[VideoChatArea] Local video resumed')}
                                    onStalled={() => console.log('[VideoChatArea] Local video stalled')}
                                    onResize={(e) => {
                                        const video = e.currentTarget;
                                        console.log('[VideoChatArea] Local video resized:', video.videoWidth, 'x', video.videoHeight);
                                    }}
                                />
                                {!isCameraOn && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                                        <VideoIcon className="w-10 h-10 text-zinc-700 opacity-50" />
                                    </div>
                                )}
                                {/* Small local indicator */}
                                <div className="absolute top-3 left-3 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded-md text-[10px] font-bold text-white uppercase tracking-wider border border-zinc-700/50">
                                    You
                                </div>
                            </motion.div>
                        )}

                        {/* Transparent Chat Overlay - Positioned Above Video */}
                        <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-end p-6 pb-24 lg:p-10 lg:pb-32">
                            <div className="max-w-md w-full flex flex-col gap-3 overflow-hidden">
                                <AnimatePresence initial={false}>
                                    {messages.slice(-5).map((msg, idx) => (
                                        <motion.div
                                            key={msg.id}
                                            initial={{ opacity: 0, x: -20, y: 10 }}
                                            animate={{ opacity: 1, x: 0, y: 0 }}
                                            className={`flex items-end gap-2 ${msg.username === 'Me' ? 'self-end flex-row-reverse' : 'self-start'}`}
                                        >
                                            <div
                                                className={`px-4 py-2.5 rounded-2xl text-[14.5px] font-medium backdrop-blur-lg border pointer-events-auto transition-all duration-300 hover:scale-[1.02] shadow-xl ${msg.username === 'Me'
                                                    ? 'bg-indigo-600/60 border-indigo-400/30 text-white rounded-br-none shadow-indigo-900/10'
                                                    : 'bg-white/10 border-white/20 text-white rounded-bl-none shadow-black/20'
                                                    }`}
                                                onClick={() => handleProfileClick(msg.username, msg.avatarSeed, msg.avatarUrl, msg.isVerified)}
                                            >
                                                <div className="flex flex-col gap-0.5">
                                                    {msg.username !== 'Me' && (
                                                        <div className="flex items-center gap-1.5 mb-0.5">
                                                            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">{msg.username}</span>
                                                            {msg.isVerified && <ShieldCheck className="h-3 w-3 text-blue-400 shadow-sm" />}
                                                        </div>
                                                    )}
                                                    <span className="leading-relaxed drop-shadow-sm">{msg.content}</span>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                                {isPartnerTyping && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex items-center gap-2 px-4 py-1.5 bg-white/5 backdrop-blur-md border border-white/10 rounded-full w-fit self-start ml-2"
                                    >
                                        <span className="flex gap-1">
                                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                                        </span>
                                        <span className="text-[11px] font-bold text-indigo-200 uppercase tracking-widest">{partner?.name || 'Partner'} is typing</span>
                                    </motion.div>
                                )}
                            </div>
                        </div>

                        {/* Floating Top Controls (Settings/Encryption) */}
                        <div className="absolute top-6 left-6 right-6 z-40 flex items-center justify-between pointer-events-none">
                            <div className="flex items-center gap-3 pointer-events-auto">
                                <div className={`flex items-center gap-2.5 px-4 py-2 bg-black/30 backdrop-blur-xl border rounded-full transition-all duration-500 ${isSignalReady ? 'border-indigo-500/40' : 'border-white/10'}`}>
                                    <div className={`w-2 h-2 rounded-full ${isSignalReady ? 'bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.8)] animate-pulse' : 'bg-zinc-600'}`} />
                                    <span className={`text-[11px] font-bold uppercase tracking-widest ${isSignalReady ? 'text-indigo-100' : 'text-zinc-500'}`}>
                                        {isSignalReady ? 'E2E Encrypted' : 'Establishing Secure Link...'}
                                    </span>
                                </div>
                                {connectionState === 'connected' && (
                                    <div className="pointer-events-auto">
                                        <BackgroundKeepAlive
                                            partnerName={partnerName || 'Companion'}
                                            messages={messages}
                                            isActive={connectionState === 'connected'}
                                        />
                                    </div>
                                )}
                                {partnerIsVerified && (
                                    <div className="px-3 py-1.5 bg-blue-500/20 backdrop-blur-md border border-blue-400/30 rounded-full flex items-center gap-2">
                                        <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                                        <span className="text-[10px] font-bold text-blue-200 uppercase tracking-wider">Verified User</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-3 pointer-events-auto">
                                <button
                                    onClick={() => setIsProfileModalOpen(true)}
                                    className="p-2.5 bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/10 rounded-full text-white transition-all active:scale-95"
                                >
                                    <SettingsIcon className="w-5 h-5 opacity-70" />
                                </button>
                            </div>
                        </div>

                        {/* Floating Interaction Bar */}
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-6 py-3.5 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full shadow-[0_20px_60px_rgba(0,0,0,0.6)] transform-gpu opacity-0 group-hover:opacity-100 lg:group-hover:opacity-100 lg:opacity-100 transition-all duration-500">
                            <button
                                onClick={toggleCamera}
                                disabled={isVoiceOnly}
                                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${!isCameraOn || isVoiceOnly ? 'bg-red-500/20 text-red-400 hover:bg-red-500/40' : 'bg-white/10 text-white hover:bg-white/20'} ${isVoiceOnly ? 'opacity-30' : ''}`}
                            >
                                {isCameraOn ? <VideoIcon className="w-5 h-5" /> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10m-1 1l-1-1m-4 1v-1l-1-1m-4 1v-1l-1-1M1 1l22 22"></path></svg>}
                            </button>
                            <button
                                onClick={toggleMute}
                                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${isMuted ? 'bg-red-500/20 text-red-400 hover:bg-red-500/40' : 'bg-white/10 text-white hover:bg-white/20'}`}
                            >
                                {isMuted ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v6a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12H3a9 9 0 0 0 8 8.94V23h2v-2.06a8.98 8.98 0 0 0 5.39-2.79l-1.39-1.2z"></path></svg> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>}
                            </button>
                            <div className="w-[1px] h-8 bg-white/10" />
                            <button
                                onClick={() => setIsVoiceOnly(!isVoiceOnly)}
                                className={`px-5 py-2.5 rounded-full text-[12px] font-black uppercase tracking-[0.15em] transition-all duration-500 ${isVoiceOnly ? 'bg-indigo-600 text-white ring-4 ring-indigo-500/20' : 'bg-white/5 text-zinc-400 hover:text-white border border-white/5'}`}
                            >
                                {isVoiceOnly ? 'Show Video' : 'Go Blind'}
                            </button>
                        </div>
                    </>
                )}
            </div>


            <div className="relative z-30 bg-background border-t border-border/40">
                <MessageInput
                    replyingTo={replyingTo}
                    editingMessage={null}
                    onCancelReply={() => setReplyingTo(null)}
                    onCancelEdit={() => { }}
                    connectionState={connectionState}
                    onStart={handleStart}
                    onStop={handleStop}
                    onSkip={handleSkip}
                    onSend={handleSendMessage}
                    isPartnerTyping={isPartnerTyping}
                    partnerName={partner?.name || 'Partner'}
                    onTyping={handleTyping}
                    onSelectFiles={() => { }}
                    isGifPickerOpen={isGifPickerOpen}
                    onToggleGifPicker={() => setIsGifPickerOpen(prev => !prev)}
                    onCloseGifPicker={() => setIsGifPickerOpen(false)}
                />
            </div>

            <ReportModal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                message={null}
            />

            <ProfileModal
                isOpen={isProfileModalOpen}
                onClose={() => setIsProfileModalOpen(false)}
                username={selectedProfile?.username || ''}
                avatarSeed={selectedProfile?.avatarSeed || ''}
                avatarUrl={selectedProfile?.avatarUrl || null}
                isVerified={selectedProfile?.isVerified}
                onAddFriend={handleAddFriend}
                onAcceptFriend={handleAcceptFriendRequest}
                onDeclineFriend={handleDeclineFriendRequest}
                requestStatus={partnerId ? getFriendRequestStatus(partnerId) : 'none'}
            />
        </main>
    );
}
