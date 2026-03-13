import React, { createContext, useContext, useCallback, useEffect, useRef } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { DmYjsManager, type YjsMessageData } from '../yjs/DmYjsManager';

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || 'wss://buzzu-signaling.md-wasif-faisal.workers.dev';

interface DmSignalingContextType {
    /** Add a message to the DM conversation. Auto-syncs to store + peer via Yjs. */
    sendDmMessage: (friendId: string, message: {
        id: string;
        senderName: string;
        avatarSeed: string;
        avatarUrl: string | null;
        timestamp: string;
        content: string;
        isVerified: boolean;
        replyToId?: string | null;
        replyToContent?: string | null;
        replyToSenderName?: string | null;
    }) => void;
    /** Edit a message content. Auto-syncs via Yjs CRDT. */
    editDmMessage: (friendId: string, messageId: string, newContent: string) => void;
    /** Delete a message. Auto-syncs via Yjs CRDT. */
    deleteDmMessage: (friendId: string, messageId: string) => void;
    /** Send typing status to a friend. */
    sendTyping: (friendId: string, isTyping: boolean) => void;
    /** Subscribe to typing events from any friend. */
    onTyping: (callback: (friendId: string, isTyping: boolean) => void) => () => void;
    /** Get active data channel for file transfers with a friend. */
    getDataChannel: (friendId: string) => RTCDataChannel | null;
    /** Register callback for new data channels. Returns cleanup function. */
    onDataChannel: (callback: (channel: RTCDataChannel, from: string) => void) => () => void;
    /** Initialize WebRTC connection for file transfers with a friend. */
    initWebRTC: (friendId: string) => void;
    /** Subscribe to profile updates from any friend. */
    onProfile: (callback: (friendId: string, username: string, avatarSeed: string, avatarUrl: string | null) => void) => () => void;
}

const DmSignalingContext = createContext<DmSignalingContextType | null>(null);

export function useDmSignaling() {
    const ctx = useContext(DmSignalingContext);
    if (!ctx) throw new Error('useDmSignaling must be used within DmSignalingProvider');
    return ctx;
}

/**
 * Convert a Yjs message to the shape the Zustand store / MessageList expects.
 * Messages sent by the local peer get username: 'Me'.
 */
function yjsToStoreMessage(yMsg: YjsMessageData, myPeerId: string) {
    return {
        id: yMsg.id,
        username: yMsg.senderId === myPeerId ? 'Me' : yMsg.senderName,
        avatarSeed: yMsg.avatarSeed,
        avatarUrl: yMsg.avatarUrl,
        timestamp: yMsg.timestamp,
        content: yMsg.content,
        isVerified: yMsg.isVerified,
        isEdited: yMsg.isEdited,
        replyToMessage: yMsg.replyToId
            ? { id: yMsg.replyToId, content: yMsg.replyToContent || '', username: yMsg.replyToSenderName || '' }
            : null,
    };
}

/**
 * DmSignalingProvider — Yjs-powered DM messaging over existing Cloudflare Worker.
 *
 * For each friend in the friend list:
 *  1. Creates/loads a Y.Doc persisted in IndexedDB (via y-indexeddb)
 *  2. Opens a WebSocket to the deterministic DM room on the signaling worker
 *  3. Runs the Yjs 2-step sync protocol:
 *     - On connect: send our state vector → peer responds with missing updates
 *     - On peer Join: re-send state vector → ensures late-joiners sync
 *  4. Ongoing: local Y.Doc changes → base64-encode → send as Chat WS message
 *  5. Incoming: Chat WS message → decode → apply Yjs update to local doc
 *  6. Y.Map observer → sync to Zustand store → React re-renders
 *
 * Transport: Yjs binary updates are base64-encoded inside the existing Chat
 * message type's payload field. No changes to the Cloudflare Worker needed.
 *
 * Payload format within Chat.payload:
 *   { _yjs: "sv",     data: "<base64 state vector>" }
 *   { _yjs: "update", data: "<base64 yjs update>" }
 */
export const DmSignalingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { peerId, friendList } = useSessionStore();
    const connectionsRef = useRef<Map<string, WebSocket>>(new Map());
    const cleanupRef = useRef<Map<string, (() => void)[]>>(new Map());
    const reconnectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const heartbeatTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
    const typingCallbacksRef = useRef<Set<(friendId: string, isTyping: boolean) => void>>(new Set());
    const profileCallbacksRef = useRef<Set<(friendId: string, username: string, avatarSeed: string, avatarUrl: string | null) => void>>(new Set());
    const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const dataChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map());
    const dataChannelCallbackRef = useRef<((channel: RTCDataChannel, from: string) => void) | null>(null);
    const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const candidateDedupRef = useRef<Map<string, Set<string>>>(new Map());

    const peerIdRef = useRef(peerId);
    peerIdRef.current = peerId;

    /** Sync Yjs messages → Zustand store for rendering. */
    const syncToStore = useCallback((friendId: string, roomId: string) => {
        const myPeerId = peerIdRef.current;
        const snapshot = DmYjsManager.getSnapshot(roomId);
        const storeMessages = snapshot.map(m => yjsToStoreMessage(m, myPeerId));
        console.log(`[DmYjs] 🔄 Syncing to Zustand store | friend=${friendId.slice(0, 15)}… messages=${storeMessages.length}`);
        useSessionStore.getState().syncDmMessages(friendId, storeMessages);
    }, []);

    /** Send a Yjs-encoded Chat message via WebSocket. */
    const sendYjsPayload = useCallback((ws: WebSocket, friendId: string, payload: object) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'Chat',
                from: peerIdRef.current,
                to: friendId,
                payload: JSON.stringify(payload),
            }));
        }
    }, []);

    const getCandidateKey = useCallback((candidate: RTCIceCandidateInit) => {
        return `${candidate.candidate ?? ''}|${candidate.sdpMid ?? ''}|${candidate.sdpMLineIndex ?? ''}`;
    }, []);

    const registerCandidate = useCallback((friendId: string, candidate: RTCIceCandidateInit) => {
        if (!candidate.candidate) {
            return false;
        }
        const key = getCandidateKey(candidate);
        let seen = candidateDedupRef.current.get(friendId);
        if (!seen) {
            seen = new Set();
            candidateDedupRef.current.set(friendId, seen);
        }
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    }, [getCandidateKey]);

    const flushPendingCandidates = useCallback(async (friendId: string, pc: RTCPeerConnection) => {
        const pending = pendingCandidatesRef.current.get(friendId);
        if (!pending || pending.length === 0) return;
        for (const candidate of pending) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.warn(`[DmWebRTC] Failed to add pending ICE candidate for friend: ${friendId.slice(0, 15)}…`, err);
            }
        }
        pendingCandidatesRef.current.delete(friendId);
    }, []);

    /** Handle incoming WebRTC offer from friend. */
    const handleWebRTCOffer = useCallback(async (friendId: string, offer: RTCSessionDescriptionInit) => {
        const myPeerId = peerIdRef.current;
        if (!myPeerId) return;

        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
            ]
        };

        let pc = peerConnectionsRef.current.get(friendId);
        if (!pc || pc.signalingState === 'closed') {
            pc = new RTCPeerConnection(config);
            peerConnectionsRef.current.set(friendId, pc);
        }
        if (typeof window !== 'undefined') {
            const globalConnections = (window as any).__peerConnections as Map<string, RTCPeerConnection> | undefined;
            if (globalConnections) {
                globalConnections.set(friendId, pc);
            } else {
                (window as any).__peerConnections = new Map([[friendId, pc]]);
            }
        }

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                const ws = connectionsRef.current.get(friendId);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'IceCandidate',
                        from: myPeerId,
                        to: friendId,
                        payload: JSON.stringify(event.candidate),
                    }));
                }
            }
        };

        pc.ondatachannel = (event) => {
            const incomingChannel = event.channel;
            if (incomingChannel.label === 'file-transfer') {
                dataChannelsRef.current.set(friendId, incomingChannel);
                const channelMap = (pc as any).dataChannels || new Map<string, RTCDataChannel>();
                channelMap.set(friendId, incomingChannel);
                (pc as any).dataChannels = channelMap;
                incomingChannel.onopen = () => {
                    console.log(`[DmWebRTC] Incoming data channel opened for friend: ${friendId.slice(0, 15)}…`);
                    dataChannelCallbackRef.current?.(incomingChannel, friendId);
                };
                incomingChannel.onclose = () => {
                    console.log(`[DmWebRTC] Incoming data channel closed for friend: ${friendId.slice(0, 15)}…`);
                    dataChannelsRef.current.delete(friendId);
                };
                incomingChannel.onerror = (err) => {
                    if (incomingChannel.readyState === 'closing' || incomingChannel.readyState === 'closed') {
                        return;
                    }
                    console.error(`[DmWebRTC] Incoming data channel error for friend: ${friendId.slice(0, 15)}…`, err);
                };
            }
        };

        const isPolite = myPeerId < friendId;
        const offerCollision = pc.signalingState !== 'stable';
        if (offerCollision && !isPolite) {
            console.warn(`[DmWebRTC] Ignoring offer collision from ${friendId.slice(0, 15)}… (impolite peer)`);
            return;
        }
        if (offerCollision) {
            try {
                await pc.setLocalDescription({ type: 'rollback' });
            } catch (err) {
                console.warn(`[DmWebRTC] Failed to rollback offer collision for friend: ${friendId.slice(0, 15)}…`, err);
                return;
            }
        }

        let answer: RTCSessionDescriptionInit;
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            await flushPendingCandidates(friendId, pc);
            answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
        } catch (err) {
            console.warn(`[DmWebRTC] Failed to handle offer from friend: ${friendId.slice(0, 15)}…`, err);
            return;
        }

        const ws = connectionsRef.current.get(friendId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'Answer',
                from: myPeerId,
                to: friendId,
                payload: JSON.stringify(answer),
            }));
        }
    }, [flushPendingCandidates]);

    /** Handle incoming WebRTC answer from friend. */
    const handleWebRTCAnswer = useCallback(async (friendId: string, answer: RTCSessionDescriptionInit) => {
        const pc = peerConnectionsRef.current.get(friendId);
        if (!pc || pc.signalingState === 'closed') return;
        if (pc.signalingState !== 'have-local-offer') {
            console.warn(`[DmWebRTC] Ignoring stale answer from friend: ${friendId.slice(0, 15)}… (state: ${pc.signalingState})`);
            return;
        }
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            await flushPendingCandidates(friendId, pc);
        } catch (err) {
            console.warn(`[DmWebRTC] Failed to handle answer from friend: ${friendId.slice(0, 15)}…`, err);
        }
    }, [flushPendingCandidates]);

    /** Handle ICE candidate from friend. */
    const handleIceCandidate = useCallback(async (friendId: string, candidate: RTCIceCandidateInit) => {
        const pc = peerConnectionsRef.current.get(friendId);
        if (!candidate?.candidate) {
            return;
        }
        if (!registerCandidate(friendId, candidate)) {
            return;
        }
        if (pc && pc.remoteDescription) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.warn(`[DmWebRTC] Failed to add ICE candidate for friend: ${friendId.slice(0, 15)}…`, err);
            }
            return;
        }
        const buffered = pendingCandidatesRef.current.get(friendId) || [];
        buffered.push(candidate);
        pendingCandidatesRef.current.set(friendId, buffered);
    }, [registerCandidate]);

    /** Connect to a friend: create Y.Doc, open WS, run Yjs sync protocol. */
    const connectToFriend = useCallback((friendId: string) => {
        const myPeerId = peerIdRef.current;
        if (!myPeerId) return;

        // Skip if already connected or connecting
        const existing = connectionsRef.current.get(friendId);
        if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const roomId = DmYjsManager.getDmRoomId(myPeerId, friendId);

        // Initialize Y.Doc + IndexedDB persistence
        DmYjsManager.getOrCreateDoc(roomId);

        // Observe Y.Map changes → sync to Zustand store
        const unobserve = DmYjsManager.observeMessages(roomId, () => {
            syncToStore(friendId, roomId);
        });

        // Load persisted messages from IndexedDB → sync to store
        DmYjsManager.waitForSync(roomId).then(() => {
            syncToStore(friendId, roomId);
        });

        try {
            const ws = new WebSocket(`${SIGNALING_URL}/room/${roomId}/websocket?peer_id=${myPeerId}`);

            ws.onopen = async () => {
                console.log(`[DmYjs] Connected to DM room: ${roomId}`);

                // Wait for IndexedDB to finish loading before syncing
                await DmYjsManager.waitForSync(roomId);

                // Sync step 1: send our state vector to peer
                const sv = DmYjsManager.getEncodedStateVector(roomId);
                sendYjsPayload(ws, friendId, { _yjs: 'sv', data: sv });

                const existing = heartbeatTimersRef.current.get(friendId);
                if (existing) clearInterval(existing);
                const timer = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send("ping");
                    }
                }, 25000);
                heartbeatTimersRef.current.set(friendId, timer);
            };

            ws.onmessage = (event) => {
                try {
                    if (event.data === "pong") {
                        return;
                    }
                    const msg = JSON.parse(event.data);

                    // When friend joins/reconnects: re-send state vector for sync
                    if (msg.type === 'Join' && msg.peer_id === friendId) {
                        const sv = DmYjsManager.getEncodedStateVector(roomId);
                        sendYjsPayload(ws, friendId, { _yjs: 'sv', data: sv });
                        return;
                    }

                    if (msg.type === 'Typing' && msg.from === friendId) {
                        typingCallbacksRef.current.forEach(cb => cb(friendId, !!msg.typing));
                        return;
                    }

                    if (msg.type === 'Profile' && msg.from === friendId) {
                        const payload = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload;
                        profileCallbacksRef.current.forEach(cb =>
                            cb(friendId, payload.username, payload.avatarSeed, payload.avatarUrl)
                        );
                        return;
                    }

                    // Handle WebRTC signaling
                    if (msg.type === 'Offer' && msg.from === friendId) {
                        console.log(`[DmWebRTC] Received offer from ${friendId.slice(0, 15)}…`);
                        const offer = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload;
                        handleWebRTCOffer(friendId, offer);
                        return;
                    }

                    if (msg.type === 'Answer' && msg.from === friendId) {
                        console.log(`[DmWebRTC] Received answer from ${friendId.slice(0, 15)}…`);
                        const answer = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload;
                        handleWebRTCAnswer(friendId, answer);
                        return;
                    }

                    if (msg.type === 'IceCandidate' && msg.from === friendId) {
                        const candidate = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload;
                        handleIceCandidate(friendId, candidate);
                        return;
                    }

                    if (msg.type !== 'Chat' || msg.from !== friendId) return;

                    const payload = JSON.parse(msg.payload);

                    if (payload._yjs === 'sv') {
                        // Peer sent their state vector → respond with missing updates
                        console.log(`[DmYjs] 📨 Received state vector from ${friendId.slice(0, 15)}… | room=${roomId}`);
                        const update = DmYjsManager.computeUpdate(roomId, payload.data);
                        console.log(`[DmYjs] 📤 Sending missing updates to ${friendId.slice(0, 15)}… | base64len=${update.length}`);
                        sendYjsPayload(ws, friendId, { _yjs: 'update', data: update });

                    } else if (payload._yjs === 'update') {
                        // Peer sent Yjs update → apply to local Y.Doc
                        console.log(`[DmYjs] 📥 Received Yjs update from ${friendId.slice(0, 15)}… | base64len=${payload.data.length}`);
                        const map = DmYjsManager.getMessagesMap(roomId);
                        const countBefore = map.size;

                        DmYjsManager.applyRemoteUpdate(roomId, payload.data);

                        const countAfter = map.size;

                        // Notify if new messages arrived and this DM is not active
                        if (countAfter > countBefore) {
                            try {
                                new Audio('/sounds/message.mp3').play().catch(() => { });
                            } catch (e) { }

                            const state = useSessionStore.getState();
                            if (state.activeDmFriend?.id !== friendId) {
                                state.setHasNewDmMessage(true);
                            }
                        }

                    } else if (payload.id && payload.content && !payload._yjs) {
                        // Legacy pre-Yjs chat message — migrate into Y.Doc
                        const existingMap = DmYjsManager.getMessagesMap(roomId);
                        if (!existingMap.has(payload.id)) {
                            try {
                                new Audio('/sounds/message.mp3').play().catch(() => { });
                            } catch (e) { }
                            DmYjsManager.addMessage(roomId, {
                                id: payload.id,
                                senderId: friendId,
                                senderName: payload.username || 'Friend',
                                avatarSeed: payload.avatarSeed || friendId,
                                avatarUrl: payload.avatarUrl || null,
                                timestamp: payload.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                order: Date.now(),
                                content: payload.content,
                                isVerified: payload.isVerified || false,
                                isEdited: false,
                                replyToId: payload.replyToMessage?.id || null,
                                replyToContent: payload.replyToMessage?.content || null,
                                replyToSenderName: payload.replyToMessage?.username || null,
                            });
                        }
                    }
                } catch (e) {
                    console.error('[DmYjs] Message parse error', e);
                }
            };

            // Local Y.Doc updates → send to peer via existing Chat WS
            const unsubUpdate = DmYjsManager.onLocalUpdate(roomId, (encodedUpdate) => {
                sendYjsPayload(ws, friendId, { _yjs: 'update', data: encodedUpdate });
            });

            ws.onclose = (event) => {
                console.log(`[DmYjs] Connection closed for friend: ${friendId}`, event.code);
                connectionsRef.current.delete(friendId);
                const heartbeatTimer = heartbeatTimersRef.current.get(friendId);
                if (heartbeatTimer) {
                    clearInterval(heartbeatTimer);
                    heartbeatTimersRef.current.delete(friendId);
                }

                // Auto-reconnect on abnormal closure if friend is still in list
                if (event.code === 1006 || event.code === 1001) {
                    const state = useSessionStore.getState();
                    if (state.friendList.some(f => f.id === friendId)) {
                        const timer = setTimeout(() => {
                            reconnectTimersRef.current.delete(friendId);
                            connectToFriend(friendId);
                        }, 3000);
                        reconnectTimersRef.current.set(friendId, timer);
                    }
                }
            };

            ws.onerror = () => {
                console.error(`[DmYjs] WS error for friend: ${friendId}`);
            };

            connectionsRef.current.set(friendId, ws);
            cleanupRef.current.set(friendId, [unobserve, unsubUpdate]);

        } catch (e) {
            console.error('[DmYjs] Failed to connect', e);
            unobserve();
        }
    }, [syncToStore, sendYjsPayload]);

    // Sync WebSocket connections with friend list
    useEffect(() => {
        if (!peerId) return;

        const currentFriendIds = new Set(friendList.map(f => f.id));

        // Close connections for removed friends
        for (const [friendId, ws] of connectionsRef.current) {
            if (!currentFriendIds.has(friendId)) {
                ws.close();
                connectionsRef.current.delete(friendId);
                const cleanups = cleanupRef.current.get(friendId);
                if (cleanups) cleanups.forEach(fn => fn());
                cleanupRef.current.delete(friendId);
                const timer = reconnectTimersRef.current.get(friendId);
                if (timer) {
                    clearTimeout(timer);
                    reconnectTimersRef.current.delete(friendId);
                }
            }
        }

        // Open connections for new friends
        for (const friend of friendList) {
            connectToFriend(friend.id);
        }
    }, [peerId, friendList, connectToFriend]);

    // Cleanup all on unmount
    useEffect(() => {
        return () => {
            for (const [, ws] of connectionsRef.current) ws.close();
            connectionsRef.current.clear();
            for (const [, timer] of heartbeatTimersRef.current) clearInterval(timer);
            heartbeatTimersRef.current.clear();
            for (const [, cleanups] of cleanupRef.current) cleanups.forEach(fn => fn());
            cleanupRef.current.clear();
            for (const [, timer] of reconnectTimersRef.current) clearTimeout(timer);
            reconnectTimersRef.current.clear();
        };
    }, []);

    /** Add a message via Yjs. Auto-syncs to store + peer. */
    const sendDmMessage = useCallback((friendId: string, message: {
        id: string;
        senderName: string;
        avatarSeed: string;
        avatarUrl: string | null;
        timestamp: string;
        content: string;
        isVerified: boolean;
        replyToId?: string | null;
        replyToContent?: string | null;
        replyToSenderName?: string | null;
    }) => {
        const myPeerId = peerIdRef.current;
        if (!myPeerId) return;

        const roomId = DmYjsManager.getDmRoomId(myPeerId, friendId);
        console.log(`[DmYjs] 💬 sendDmMessage | to=${friendId.slice(0, 15)}… room=${roomId} content="${message.content.slice(0, 50)}"`);
        DmYjsManager.addMessage(roomId, {
            ...message,
            senderId: myPeerId,
            order: Date.now(),
            isEdited: false,
            replyToId: message.replyToId ?? null,
            replyToContent: message.replyToContent ?? null,
            replyToSenderName: message.replyToSenderName ?? null,
        });
    }, []);

    /** Edit a message via Yjs. Auto-syncs. */
    const editDmMessage = useCallback((friendId: string, messageId: string, newContent: string) => {
        const myPeerId = peerIdRef.current;
        if (!myPeerId) return;
        const roomId = DmYjsManager.getDmRoomId(myPeerId, friendId);
        DmYjsManager.updateMessage(roomId, messageId, newContent);
    }, []);

    /** Delete a message via Yjs. Auto-syncs. */
    const deleteDmMessage = useCallback((friendId: string, messageId: string) => {
        const myPeerId = peerIdRef.current;
        if (!myPeerId) return;
        const roomId = DmYjsManager.getDmRoomId(myPeerId, friendId);
        DmYjsManager.deleteMessage(roomId, messageId);
    }, []);

    /** Send typing status to a friend. */
    const sendTyping = useCallback((friendId: string, isTyping: boolean) => {
        const ws = connectionsRef.current.get(friendId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'Typing',
                from: peerIdRef.current,
                to: friendId,
                typing: isTyping,
            }));
        }
    }, []);

    /** Subscribe to typing events from any friend. */
    const onTyping = useCallback((callback: (friendId: string, isTyping: boolean) => void) => {
        typingCallbacksRef.current.add(callback);
        return () => {
            typingCallbacksRef.current.delete(callback);
        };
    }, []);

    /** Subscribe to profile events from any friend. */
    const onProfile = useCallback((callback: (friendId: string, username: string, avatarSeed: string, avatarUrl: string | null) => void) => {
        profileCallbacksRef.current.add(callback);
        return () => {
            profileCallbacksRef.current.delete(callback);
        };
    }, []);

    /** Get active data channel for file transfers with a friend. */
    const getDataChannel = useCallback((friendId: string) => {
        return dataChannelsRef.current.get(friendId) || null;
    }, []);

    /** Register callback for new data channels. */
    const onDataChannel = useCallback((callback: (channel: RTCDataChannel, from: string) => void) => {
        dataChannelCallbackRef.current = callback;
        return () => {
            dataChannelCallbackRef.current = null;
        };
    }, []);

    const waitForWebSocketOpen = useCallback(async (friendId: string, timeoutMs = 20000) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const ws = connectionsRef.current.get(friendId);
            if (ws && ws.readyState === WebSocket.OPEN) {
                return ws;
            }
            if (!ws || ws.readyState === WebSocket.CLOSED) {
                connectToFriend(friendId);
            }
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
        return null;
    }, [connectToFriend]);

    /** Initialize WebRTC connection for file transfers with a friend. */
    const initWebRTC = useCallback(async (friendId: string) => {
        const myPeerId = peerIdRef.current;
        if (!myPeerId) return;

        const existingPc = peerConnectionsRef.current.get(friendId);
        if (existingPc && existingPc.signalingState !== 'closed') {
            return;
        }
        if (existingPc && existingPc.signalingState === 'closed') {
            peerConnectionsRef.current.delete(friendId);
        }

        const ws = await waitForWebSocketOpen(friendId);
        if (!ws) {
            console.warn(`[DmWebRTC] WebSocket not ready for friend: ${friendId.slice(0, 15)}…`);
            return;
        }

        const preExistingPc = peerConnectionsRef.current.get(friendId);
        if (preExistingPc && preExistingPc.signalingState !== 'closed') {
            return;
        }
        if (preExistingPc && preExistingPc.signalingState === 'closed') {
            peerConnectionsRef.current.delete(friendId);
        }

        console.log(`[DmWebRTC] Initializing WebRTC connection for friend: ${friendId.slice(0, 15)}…`);

        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
            ]
        };

        const pc = new RTCPeerConnection(config);
        peerConnectionsRef.current.set(friendId, pc);
        if (typeof window !== 'undefined') {
            const globalConnections = (window as any).__peerConnections as Map<string, RTCPeerConnection> | undefined;
            if (globalConnections) {
                globalConnections.set(friendId, pc);
            } else {
                (window as any).__peerConnections = new Map([[friendId, pc]]);
            }
        }

        const dataChannel = pc.createDataChannel('file-transfer', { ordered: true });
        dataChannelsRef.current.set(friendId, dataChannel);
        const channelMap = (pc as any).dataChannels || new Map<string, RTCDataChannel>();
        channelMap.set(friendId, dataChannel);
        (pc as any).dataChannels = channelMap;

        dataChannel.onopen = () => {
            console.log(`[DmWebRTC] Data channel opened for friend: ${friendId.slice(0, 15)}…`);
            dataChannelCallbackRef.current?.(dataChannel, friendId);
        };

        dataChannel.onclose = () => {
            console.log(`[DmWebRTC] Data channel closed for friend: ${friendId.slice(0, 15)}…`);
            dataChannelsRef.current.delete(friendId);
        };

        dataChannel.onerror = (err) => {
            if (dataChannel.readyState === 'closing' || dataChannel.readyState === 'closed') {
                return;
            }
            console.error(`[DmWebRTC] Data channel error for friend: ${friendId.slice(0, 15)}…`, err);
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'IceCandidate',
                        from: myPeerId,
                        to: friendId,
                        payload: JSON.stringify(event.candidate),
                    }));
                }
            }
        };

        pc.ondatachannel = (event) => {
            const incomingChannel = event.channel;
            if (incomingChannel.label === 'file-transfer') {
                dataChannelsRef.current.set(friendId, incomingChannel);
                const channelMap = (pc as any).dataChannels || new Map<string, RTCDataChannel>();
                channelMap.set(friendId, incomingChannel);
                (pc as any).dataChannels = channelMap;
                incomingChannel.onopen = () => {
                    console.log(`[DmWebRTC] Incoming data channel opened for friend: ${friendId.slice(0, 15)}…`);
                    dataChannelCallbackRef.current?.(incomingChannel, friendId);
                };
                incomingChannel.onclose = () => {
                    console.log(`[DmWebRTC] Incoming data channel closed for friend: ${friendId.slice(0, 15)}…`);
                    dataChannelsRef.current.delete(friendId);
                };
                incomingChannel.onerror = (err) => {
                    console.error(`[DmWebRTC] Incoming data channel error for friend: ${friendId.slice(0, 15)}…`, err);
                };
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'Offer',
                from: myPeerId,
                to: friendId,
                payload: JSON.stringify(offer),
            }));
        }
    }, [waitForWebSocketOpen]);

    const value = React.useMemo(
        () => ({ sendDmMessage, editDmMessage, deleteDmMessage, sendTyping, onTyping, onProfile, getDataChannel, onDataChannel, initWebRTC }),
        [sendDmMessage, editDmMessage, deleteDmMessage, sendTyping, onTyping, onProfile, getDataChannel, onDataChannel, initWebRTC]
    );

    return (
        <DmSignalingContext.Provider value={value}>
            {children}
        </DmSignalingContext.Provider>
    );
};
