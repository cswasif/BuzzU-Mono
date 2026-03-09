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

    const peerIdRef = useRef(peerId);
    peerIdRef.current = peerId;

    /** Sync Yjs messages → Zustand store for rendering. */
    const syncToStore = useCallback((friendId: string, roomId: string) => {
        const myPeerId = peerIdRef.current;
        const snapshot = DmYjsManager.getSnapshot(roomId);
        const storeMessages = snapshot.map(m => yjsToStoreMessage(m, myPeerId));
        console.log(`[DmYjs] 🔄 Syncing to Zustand store | friend=${friendId.slice(0,15)}… messages=${storeMessages.length}`);
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
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);

                    // When friend joins/reconnects: re-send state vector for sync
                    if (msg.type === 'Join' && msg.peer_id === friendId) {
                        const sv = DmYjsManager.getEncodedStateVector(roomId);
                        sendYjsPayload(ws, friendId, { _yjs: 'sv', data: sv });
                        return;
                    }

                    if (msg.type !== 'Chat' || msg.from !== friendId) return;

                    const payload = JSON.parse(msg.payload);

                    if (payload._yjs === 'sv') {
                        // Peer sent their state vector → respond with missing updates
                        console.log(`[DmYjs] 📨 Received state vector from ${friendId.slice(0,15)}… | room=${roomId}`);
                        const update = DmYjsManager.computeUpdate(roomId, payload.data);
                        console.log(`[DmYjs] 📤 Sending missing updates to ${friendId.slice(0,15)}… | base64len=${update.length}`);
                        sendYjsPayload(ws, friendId, { _yjs: 'update', data: update });

                    } else if (payload._yjs === 'update') {
                        // Peer sent Yjs update → apply to local Y.Doc
                        console.log(`[DmYjs] 📥 Received Yjs update from ${friendId.slice(0,15)}… | base64len=${payload.data.length}`);
                        const map = DmYjsManager.getMessagesMap(roomId);
                        const countBefore = map.size;

                        DmYjsManager.applyRemoteUpdate(roomId, payload.data);

                        const countAfter = map.size;

                        // Notify if new messages arrived and this DM is not active
                        if (countAfter > countBefore) {
                            const state = useSessionStore.getState();
                            if (state.activeDmFriend?.id !== friendId) {
                                state.setHasNewDmMessage(true);
                            }
                        }

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
        console.log(`[DmYjs] 💬 sendDmMessage | to=${friendId.slice(0,15)}… room=${roomId} content="${message.content.slice(0,50)}"`);
        DmYjsManager.addMessage(roomId, {
            ...message,
            senderId: myPeerId,
            order: Date.now(),
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

    const value = React.useMemo(
        () => ({ sendDmMessage, editDmMessage, deleteDmMessage }),
        [sendDmMessage, editDmMessage, deleteDmMessage]
    );

    return (
        <DmSignalingContext.Provider value={value}>
            {children}
        </DmSignalingContext.Provider>
    );
};
