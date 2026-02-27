import { useState, useCallback, useRef, useEffect } from 'react';
import { verifyGoogleIdToken, type VerifiedIdentity } from '../lib/verifyGoogleToken';

const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
];

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

interface UseWebRTCOptions {
    onRemoteStream?: (stream: MediaStream) => void;
    onDataMessage?: (data: string) => void;
    onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
    localIdToken?: string | null;
}

export function useWebRTC(options: UseWebRTCOptions = {}) {
    const { onRemoteStream, onDataMessage, onConnectionStateChange, localIdToken } = options;

    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [partnerVerified, setPartnerVerified] = useState<VerifiedIdentity | null>(null);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const dataChannelRef = useRef<RTCDataChannel | null>(null);
    const callbacksRef = useRef(options);
    const skipCooldownRef = useRef(false);

    useEffect(() => {
        callbacksRef.current = options;
    }, [options]);

    const handleMessage = useCallback((data: string) => {
        try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'identity' && parsed.token) {
                // ═══════════════════════════════════════════════════════════
                // CRYPTOGRAPHIC VERIFICATION (P2P, Zero-Trust)
                //
                // We do NOT just decode the JWT — we cryptographically verify:
                //   1. RSA-SHA256 signature against Google's public JWKS
                //   2. Issuer (iss) === accounts.google.com
                //   3. Audience (aud) === OUR client ID
                //   4. Expiration (exp) is not past
                //   5. Hosted domain (hd) === g.bracu.ac.bd
                //   6. Email is verified by Google
                //
                // If ANY check fails, the partner is NOT marked as verified.
                // ═══════════════════════════════════════════════════════════
                verifyGoogleIdToken(parsed.token, GOOGLE_CLIENT_ID)
                    .then((identity) => {
                        console.log('[P2P] ✅ Partner cryptographically verified:', identity.email);
                        setPartnerVerified(identity);
                    })
                    .catch((err) => {
                        console.warn('[P2P] ❌ Partner verification FAILED:', err.message);
                        setPartnerVerified(null);
                    });
                return; // Don't propagate identity messages to onDataMessage
            }
        } catch (e) {
            // Not a JSON message or not an identity message
        }
        callbacksRef.current.onDataMessage?.(data);
    }, []);

    const setupDataChannel = useCallback((dc: RTCDataChannel) => {
        dc.onopen = () => {
            // Once open, if we are verified, share our identity
            if (localIdToken) {
                dc.send(JSON.stringify({ type: 'identity', token: localIdToken }));
            }
        };
        dc.onmessage = (e) => handleMessage(e.data);
        dataChannelRef.current = dc;
    }, [handleMessage, localIdToken]);

    const createPeerConnection = useCallback(() => {
        // HARDENING: Close any existing connection before creating a new one
        // This prevents "zombie" PeerConnections from stacking during rapid skips
        if (pcRef.current) {
            const oldPc = pcRef.current;
            oldPc.ontrack = null;
            oldPc.onconnectionstatechange = null;
            oldPc.ondatachannel = null;
            oldPc.onicecandidate = null;
            dataChannelRef.current?.close();
            dataChannelRef.current = null;
            oldPc.close();
            pcRef.current = null;
        }

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        pc.ontrack = (event) => {
            const stream = event.streams[0];
            setRemoteStream(stream);
            callbacksRef.current.onRemoteStream?.(stream);
        };

        pc.onconnectionstatechange = () => {
            setConnectionState(pc.connectionState);
            callbacksRef.current.onConnectionStateChange?.(pc.connectionState);
        };

        pc.ondatachannel = (event) => {
            setupDataChannel(event.channel);
        };

        pcRef.current = pc;
        return pc;
    }, [setupDataChannel]);

    const startLocalMedia = useCallback(async (video = true, audio = true) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
            setLocalStream(stream);

            if (pcRef.current) {
                stream.getTracks().forEach(track => {
                    pcRef.current!.addTrack(track, stream);
                });
            }

            return stream;
        } catch (err) {
            console.error('[useWebRTC] Failed to get media:', err);
            throw err;
        }
    }, []);

    const createOffer = useCallback(async (): Promise<string> => {
        const pc = pcRef.current || createPeerConnection();

        // Create data channel for text chat
        const dc = pc.createDataChannel('buzzu-chat', { ordered: true });
        dc.onmessage = (e) => callbacksRef.current.onDataMessage?.(e.data);
        dataChannelRef.current = dc;

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        return offer.sdp || '';
    }, [createPeerConnection]);

    const handleOffer = useCallback(async (sdp: string): Promise<string> => {
        const pc = pcRef.current || createPeerConnection();
        await pc.setRemoteDescription({ type: 'offer', sdp });

        // Add local tracks if available
        if (localStream) {
            localStream.getTracks().forEach(track => {
                if (!pc.getSenders().find(s => s.track === track)) {
                    pc.addTrack(track, localStream);
                }
            });
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        return answer.sdp || '';
    }, [createPeerConnection, localStream]);

    const handleAnswer = useCallback(async (sdp: string) => {
        if (pcRef.current) {
            await pcRef.current.setRemoteDescription({ type: 'answer', sdp });
        }
    }, []);

    const addIceCandidate = useCallback(async (candidateJson: string) => {
        if (pcRef.current) {
            try {
                const candidate = JSON.parse(candidateJson);
                await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.warn('[useWebRTC] Failed to add ICE candidate:', err);
            }
        }
    }, []);

    const onIceCandidate = useCallback((callback: (candidate: string) => void) => {
        if (pcRef.current) {
            pcRef.current.onicecandidate = (event) => {
                if (event.candidate) {
                    callback(JSON.stringify(event.candidate.toJSON()));
                }
            };
        }
    }, []);

    const sendDataMessage = useCallback((message: string) => {
        if (dataChannelRef.current?.readyState === 'open') {
            dataChannelRef.current.send(message);
        }
    }, []);

    const startScreenShare = useCallback(async () => {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];

            if (pcRef.current) {
                const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
                if (sender) {
                    await sender.replaceTrack(screenTrack);
                }
            }

            screenTrack.onended = () => stopScreenShare();
            setIsScreenSharing(true);
        } catch (err) {
            console.error('[useWebRTC] Screen share failed:', err);
        }
    }, []);

    const stopScreenShare = useCallback(async () => {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (pcRef.current && videoTrack) {
                const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
                if (sender) {
                    await sender.replaceTrack(videoTrack);
                }
            }
        }
        setIsScreenSharing(false);
    }, [localStream]);

    const cleanup = useCallback(() => {
        // Stop all media tracks
        localStream?.getTracks().forEach(t => t.stop());
        remoteStream?.getTracks().forEach(t => t.stop());

        // Close data channel
        dataChannelRef.current?.close();
        dataChannelRef.current = null;

        // HARDENING: Nullify event handlers BEFORE close()
        // Prevents zombie callbacks from firing during GC
        if (pcRef.current) {
            pcRef.current.ontrack = null;
            pcRef.current.onconnectionstatechange = null;
            pcRef.current.ondatachannel = null;
            pcRef.current.onicecandidate = null;
            pcRef.current.close();
            pcRef.current = null;
        }

        // Reset all state
        setLocalStream(null);
        setRemoteStream(null);
        setConnectionState('new');
        setIsScreenSharing(false);
        setPartnerVerified(null); // HARDENING: Clear stale verification badge
    }, [localStream, remoteStream]);

    // HARDENING: Skip cooldown — prevents creating connections faster than
    // Chrome's native cleanup can handle (protects against spam-skipping)
    const skipToNext = useCallback(() => {
        if (skipCooldownRef.current) return false;
        skipCooldownRef.current = true;

        // Close only the peer connection, keep local media stream alive
        // (no need to restart camera/mic on each skip)
        remoteStream?.getTracks().forEach(t => t.stop());
        dataChannelRef.current?.close();
        dataChannelRef.current = null;

        if (pcRef.current) {
            pcRef.current.ontrack = null;
            pcRef.current.onconnectionstatechange = null;
            pcRef.current.ondatachannel = null;
            pcRef.current.onicecandidate = null;
            pcRef.current.close();
            pcRef.current = null;
        }

        setRemoteStream(null);
        setConnectionState('new');
        setPartnerVerified(null);

        // 250ms cooldown before next connection can be created
        setTimeout(() => { skipCooldownRef.current = false; }, 250);
        return true;
    }, [remoteStream]);

    useEffect(() => {
        return () => { cleanup(); };
    }, []);

    return {
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
        skipToNext,
        cleanup,
    };
}
