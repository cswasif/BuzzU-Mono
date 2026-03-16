import React, { createContext, useContext, useCallback, useEffect, useRef } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { DmYjsManager, type YjsMessageData } from '../yjs/DmYjsManager';

const SIGNALING_URL = process.env.SIGNALING_URL || import.meta.env.VITE_SIGNALING_URL || 'wss://buzzu-signaling.buzzu.workers.dev';
const DM_WS_HEARTBEAT_INTERVAL = 20000;
const DM_WS_HEARTBEAT_TIMEOUT = 45000;
const DM_WS_RECONNECT_BASE_DELAY = 1500;
const DM_WS_RECONNECT_MAX_DELAY = 20000;
const DM_WS_MAX_PAYLOAD_BYTES = 128 * 1024;

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
    /** Send profile updates to a friend. */
    sendProfile: (friendId: string, profile: { username: string; avatarSeed: string; avatarUrl: string | null }) => void;
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

function extractProfileFields(msg: any) {
    const payload = (() => {
        if (typeof msg?.payload === 'string') {
            try {
                return JSON.parse(msg.payload);
            } catch {
                return {};
            }
        }
        if (msg?.payload && typeof msg.payload === 'object') {
            return msg.payload;
        }
        return msg ?? {};
    })();
    return {
        username: payload.username ?? msg?.username ?? '',
        avatarSeed: payload.avatarSeed ?? msg?.avatarSeed ?? '',
        avatarUrl: payload.avatarUrl ?? msg?.avatarUrl ?? null,
    };
}

function playDmMessageSound() {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    const globalState = window as unknown as { __dmLastSoundAt?: number };
    if (globalState.__dmLastSoundAt && now - globalState.__dmLastSoundAt < 700) {
        return;
    }
    globalState.__dmLastSoundAt = now;
    try {
        const audio = new Audio('/sounds/message.mp3');
        audio.volume = 0.7;
        audio.play().catch(() => { });
    } catch { }
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
    const { peerId, friendList, activeDmFriend } = useSessionStore();
    const connectionsRef = useRef<Map<string, WebSocket>>(new Map());
    const cleanupRef = useRef<Map<string, (() => void)[]>>(new Map());
    const reconnectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const reconnectAttemptsRef = useRef<Map<string, number>>(new Map());
    const heartbeatTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
    const heartbeatDeadlineTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const intentionalCloseRef = useRef<Set<string>>(new Set());
    const typingCallbacksRef = useRef<Set<(friendId: string, isTyping: boolean) => void>>(new Set());
    const profileCallbacksRef = useRef<Set<(friendId: string, username: string, avatarSeed: string, avatarUrl: string | null) => void>>(new Set());
    const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const dataChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map());
    const dataChannelCallbackRef = useRef<((channel: RTCDataChannel, from: string) => void) | null>(null);
    const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const candidateDedupRef = useRef<Map<string, Set<string>>>(new Map());
    const connectToFriendRef = useRef<(friendId: string) => void>(() => { });
    const lastActivityRef = useRef<Map<string, number>>(new Map());
    const knownRemoteMessageIdsRef = useRef<Map<string, Set<string>>>(new Map());
    const unreadTrackingReadyRef = useRef<Map<string, boolean>>(new Map());

    const peerIdRef = useRef(peerId);
    peerIdRef.current = peerId;

    const markActivity = useCallback((friendId: string) => {
        if (!friendId) return;
        lastActivityRef.current.set(friendId, Date.now());
    }, []);

    const snapshotRemoteMessageIds = useCallback((friendId: string, roomId: string) => {
        const snapshot = DmYjsManager.getSnapshot(roomId);
        const remoteIds = new Set<string>();
        for (const message of snapshot) {
            if (message.senderId === friendId && message.id) {
                remoteIds.add(message.id);
            }
        }
        return remoteIds;
    }, []);

    const markRemoteBaseline = useCallback((friendId: string, roomId: string) => {
        knownRemoteMessageIdsRef.current.set(friendId, snapshotRemoteMessageIds(friendId, roomId));
        unreadTrackingReadyRef.current.set(friendId, true);
    }, [snapshotRemoteMessageIds]);

    const countNewRemoteMessages = useCallback((friendId: string, roomId: string) => {
        const nextRemoteIds = snapshotRemoteMessageIds(friendId, roomId);
        const previousRemoteIds = knownRemoteMessageIdsRef.current.get(friendId) || new Set<string>();
        let newCount = 0;
        for (const id of nextRemoteIds) {
            if (!previousRemoteIds.has(id)) {
                newCount += 1;
            }
        }
        knownRemoteMessageIdsRef.current.set(friendId, nextRemoteIds);
        return newCount;
    }, [snapshotRemoteMessageIds]);

    const handleRemoteUnreadDelta = useCallback((friendId: string, roomId: string) => {
        if (!unreadTrackingReadyRef.current.get(friendId)) return;
        const newRemoteMessageCount = countNewRemoteMessages(friendId, roomId);
        if (newRemoteMessageCount <= 0) return;
        playDmMessageSound();
        const state = useSessionStore.getState();
        if (state.activeDmFriend?.id !== friendId) {
            state.incrementDmUnread(friendId, newRemoteMessageCount);
        }
    }, [countNewRemoteMessages]);

    const collectDesiredConnectionIds = useCallback((
        currentFriendList: { id: string }[],
        _currentActiveFriendId: string | null,
    ): Set<string> => {
        return new Set(currentFriendList.map((friend) => friend.id));
    }, []);

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

    const clearReconnectTimer = useCallback((friendId: string) => {
        const timer = reconnectTimersRef.current.get(friendId);
        if (timer) {
            clearTimeout(timer);
            reconnectTimersRef.current.delete(friendId);
        }
    }, []);

    const clearHeartbeatTimers = useCallback((friendId: string) => {
        const heartbeatTimer = heartbeatTimersRef.current.get(friendId);
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimersRef.current.delete(friendId);
        }
        const deadlineTimer = heartbeatDeadlineTimersRef.current.get(friendId);
        if (deadlineTimer) {
            clearTimeout(deadlineTimer);
            heartbeatDeadlineTimersRef.current.delete(friendId);
        }
    }, []);

    const clearConnectionCallbacks = useCallback((friendId: string) => {
        const cleanups = cleanupRef.current.get(friendId);
        if (cleanups) {
            cleanups.forEach(fn => fn());
            cleanupRef.current.delete(friendId);
        }
    }, []);

    const scheduleReconnect = useCallback((friendId: string) => {
        clearReconnectTimer(friendId);
        const attempts = (reconnectAttemptsRef.current.get(friendId) || 0) + 1;
        reconnectAttemptsRef.current.set(friendId, attempts);
        const baseDelay = Math.min(
            DM_WS_RECONNECT_MAX_DELAY,
            DM_WS_RECONNECT_BASE_DELAY * Math.pow(2, Math.max(0, attempts - 1)),
        );
        const jitter = Math.floor(Math.random() * 600);
        const timer = setTimeout(() => {
            reconnectTimersRef.current.delete(friendId);
            const state = useSessionStore.getState();
            const desired = collectDesiredConnectionIds(
                state.friendList,
                state.activeDmFriend?.id ?? null,
            );
            if (desired.has(friendId)) {
                connectToFriendRef.current(friendId);
            }
        }, baseDelay + jitter);
        reconnectTimersRef.current.set(friendId, timer);
    }, [clearReconnectTimer, collectDesiredConnectionIds]);

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
        clearReconnectTimer(friendId);

        const roomId = DmYjsManager.getDmRoomId(myPeerId, friendId);

        // Initialize Y.Doc + IndexedDB persistence
        DmYjsManager.getOrCreateDoc(roomId);

        // Observe Y.Map changes → sync to Zustand store
        const unobserve = DmYjsManager.observeMessages(roomId, () => {
            syncToStore(friendId, roomId);
            handleRemoteUnreadDelta(friendId, roomId);
        });

        // Load persisted messages from IndexedDB → sync to store
        DmYjsManager.waitForSync(roomId).then(() => {
            syncToStore(friendId, roomId);
            markRemoteBaseline(friendId, roomId);
        });

        try {
            const ws = new WebSocket(`${SIGNALING_URL}/room/${roomId}/websocket?peer_id=${myPeerId}`);

            ws.onopen = async () => {
                console.log(`[DmYjs] Connected to DM room: ${roomId}`);
                markActivity(friendId);
                reconnectAttemptsRef.current.set(friendId, 0);
                clearHeartbeatTimers(friendId);

                // Wait for IndexedDB to finish loading before syncing
                await DmYjsManager.waitForSync(roomId);
                markRemoteBaseline(friendId, roomId);

                // Sync step 1: send our state vector to peer
                const sv = DmYjsManager.getEncodedStateVector(roomId);
                sendYjsPayload(ws, friendId, { _yjs: 'sv', data: sv });

                const timer = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'Ping',
                            from: myPeerId,
                            to: friendId,
                            ts: Date.now(),
                        }));
                        const existingDeadline = heartbeatDeadlineTimersRef.current.get(friendId);
                        if (existingDeadline) {
                            clearTimeout(existingDeadline);
                        }
                        const deadline = setTimeout(() => {
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.close(4001, 'ping-timeout');
                            }
                        }, DM_WS_HEARTBEAT_TIMEOUT);
                        heartbeatDeadlineTimersRef.current.set(friendId, deadline);
                    }
                }, DM_WS_HEARTBEAT_INTERVAL);
                heartbeatTimersRef.current.set(friendId, timer);
            };

            ws.onmessage = (event) => {
                try {
                    if (event.data === "pong") {
                        const deadline = heartbeatDeadlineTimersRef.current.get(friendId);
                        if (deadline) {
                            clearTimeout(deadline);
                            heartbeatDeadlineTimersRef.current.delete(friendId);
                        }
                        return;
                    }
                    if (typeof event.data === 'string' && event.data.length > DM_WS_MAX_PAYLOAD_BYTES) {
                        return;
                    }
                    const msg = JSON.parse(event.data);
                    markActivity(friendId);
                    if (msg.type === 'Pong') {
                        const deadline = heartbeatDeadlineTimersRef.current.get(friendId);
                        if (deadline) {
                            clearTimeout(deadline);
                            heartbeatDeadlineTimersRef.current.delete(friendId);
                        }
                        return;
                    }
                    if (msg.type === 'Ping') {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'Pong',
                                from: myPeerId,
                                to: friendId,
                                ts: Date.now(),
                            }));
                        }
                        return;
                    }

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
                        const payload = extractProfileFields(msg);
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
                        DmYjsManager.applyRemoteUpdate(roomId, payload.data);

                    } else if (payload.id && payload.content && !payload._yjs) {
                        // Legacy pre-Yjs chat message — migrate into Y.Doc
                        const existingMap = DmYjsManager.getMessagesMap(roomId);
                        if (!existingMap.has(payload.id)) {
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
                clearHeartbeatTimers(friendId);
                clearConnectionCallbacks(friendId);

                if (intentionalCloseRef.current.has(friendId)) {
                    intentionalCloseRef.current.delete(friendId);
                    clearReconnectTimer(friendId);
                    reconnectAttemptsRef.current.delete(friendId);
                    return;
                }

                if (event.code === 1000) {
                    reconnectAttemptsRef.current.delete(friendId);
                    clearReconnectTimer(friendId);
                    return;
                }
                scheduleReconnect(friendId);
            };

            ws.onerror = () => {
                console.error(`[DmYjs] WS error for friend: ${friendId}`);
            };

            connectionsRef.current.set(friendId, ws);
            clearConnectionCallbacks(friendId);
            cleanupRef.current.set(friendId, [unobserve, unsubUpdate]);

        } catch (e) {
            console.error('[DmYjs] Failed to connect', e);
            unobserve();
            scheduleReconnect(friendId);
        }
    }, [syncToStore, handleRemoteUnreadDelta, markRemoteBaseline, sendYjsPayload, clearReconnectTimer, clearHeartbeatTimers, clearConnectionCallbacks, scheduleReconnect, markActivity]);

    useEffect(() => {
        connectToFriendRef.current = connectToFriend;
    }, [connectToFriend]);

    // Sync WebSocket connections with friend list
    useEffect(() => {
        if (!peerId) return;

        const currentFriendIds = new Set(friendList.map(f => f.id));
        const desiredFriendIds = collectDesiredConnectionIds(
            friendList,
            activeDmFriend?.id ?? null,
        );

        for (const [friendId, ws] of connectionsRef.current) {
            if (!currentFriendIds.has(friendId) || !desiredFriendIds.has(friendId)) {
                intentionalCloseRef.current.add(friendId);
                ws.close();
                connectionsRef.current.delete(friendId);
                clearHeartbeatTimers(friendId);
                clearConnectionCallbacks(friendId);
                clearReconnectTimer(friendId);
                reconnectAttemptsRef.current.delete(friendId);
            }
        }

        for (const friendId of currentFriendIds) {
            if (!desiredFriendIds.has(friendId)) {
                lastActivityRef.current.delete(friendId);
            }
        }
        for (const trackedFriendId of Array.from(knownRemoteMessageIdsRef.current.keys())) {
            if (!currentFriendIds.has(trackedFriendId)) {
                knownRemoteMessageIdsRef.current.delete(trackedFriendId);
            }
        }
        for (const trackedFriendId of Array.from(unreadTrackingReadyRef.current.keys())) {
            if (!currentFriendIds.has(trackedFriendId)) {
                unreadTrackingReadyRef.current.delete(trackedFriendId);
            }
        }

        for (const friend of friendList) {
            if (desiredFriendIds.has(friend.id)) {
                connectToFriend(friend.id);
            }
        }
    }, [peerId, friendList, activeDmFriend?.id, connectToFriend, clearHeartbeatTimers, clearConnectionCallbacks, clearReconnectTimer, collectDesiredConnectionIds]);

    // Cleanup all on unmount
    useEffect(() => {
        return () => {
            for (const [friendId, ws] of connectionsRef.current) {
                intentionalCloseRef.current.add(friendId);
                ws.close();
            }
            connectionsRef.current.clear();
            for (const [, timer] of heartbeatTimersRef.current) clearInterval(timer);
            heartbeatTimersRef.current.clear();
            for (const [, timer] of heartbeatDeadlineTimersRef.current) clearTimeout(timer);
            heartbeatDeadlineTimersRef.current.clear();
            for (const [, cleanups] of cleanupRef.current) cleanups.forEach(fn => fn());
            cleanupRef.current.clear();
            for (const [, timer] of reconnectTimersRef.current) clearTimeout(timer);
            reconnectTimersRef.current.clear();
            reconnectAttemptsRef.current.clear();
            intentionalCloseRef.current.clear();
            lastActivityRef.current.clear();
            knownRemoteMessageIdsRef.current.clear();
            unreadTrackingReadyRef.current.clear();
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
        markActivity(friendId);

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
    }, [markActivity]);

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
        markActivity(friendId);
        const ws = connectionsRef.current.get(friendId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'Typing',
                from: peerIdRef.current,
                to: friendId,
                typing: isTyping,
            }));
        }
    }, [markActivity]);

    /** Send profile updates to a friend. */
    const sendProfile = useCallback((friendId: string, profile: { username: string; avatarSeed: string; avatarUrl: string | null }) => {
        markActivity(friendId);
        const ws = connectionsRef.current.get(friendId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'Profile',
                from: peerIdRef.current,
                to: friendId,
                username: profile.username,
                avatarSeed: profile.avatarSeed,
                avatarUrl: profile.avatarUrl,
            }));
        }
    }, [markActivity]);

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
        markActivity(friendId);

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
    }, [waitForWebSocketOpen, markActivity]);

    const value = React.useMemo(
        () => ({ sendDmMessage, editDmMessage, deleteDmMessage, sendTyping, sendProfile, onTyping, onProfile, getDataChannel, onDataChannel, initWebRTC }),
        [sendDmMessage, editDmMessage, deleteDmMessage, sendTyping, sendProfile, onTyping, onProfile, getDataChannel, onDataChannel, initWebRTC]
    );

    return (
        <DmSignalingContext.Provider value={value}>
            {children}
        </DmSignalingContext.Provider>
    );
};
