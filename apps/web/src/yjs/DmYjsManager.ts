/**
 * DmYjsManager — Manages Yjs Y.Doc instances for DM conversations.
 *
 * Architecture:
 *  - One Y.Doc per DM conversation (identified by deterministic room ID)
 *  - Y.Map<string, YjsMessageData> stores messages (keyed by message ID)
 *  - y-indexeddb persists each doc to IndexedDB (replaces localStorage)
 *  - Yjs CRDT handles merge/conflict resolution automatically
 *  - Sync with peers via encoded state vectors and incremental updates
 *    transported as base64 within existing Chat WebSocket messages
 *
 * This implements the same bidirectional Yjs ↔ state sync pattern as
 * zustand-middleware-yjs, but scoped per-conversation rather than per-store.
 */
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

export interface YjsMessageData {
    id: string;
    senderId: string;
    senderName: string;
    avatarSeed: string;
    avatarUrl: string | null;
    timestamp: string;
    order: number; // epoch ms — used for sorting
    content: string;
    isVerified: boolean;
    replyToId: string | null;
    replyToContent: string | null;
    replyToSenderName: string | null;
}

/** Encode Uint8Array to base64 string for WebSocket transport. */
export function uint8ToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/** Decode base64 string back to Uint8Array. */
export function base64ToUint8(base64: string): Uint8Array {
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i);
    }
    return bytes;
}

class DmYjsManagerClass {
    private docs = new Map<string, Y.Doc>();
    private idbProviders = new Map<string, IndexeddbPersistence>();

    /** Deterministic room ID for a DM pair. Sorting ensures both peers compute the same ID. */
    getDmRoomId(peerA: string, peerB: string): string {
        const sorted = [peerA, peerB].sort();
        return `dm_${sorted[0]}_${sorted[1]}`;
    }

    /** Get or create a Y.Doc for a conversation. Automatically sets up IndexedDB persistence. */
    getOrCreateDoc(roomId: string): Y.Doc {
        let doc = this.docs.get(roomId);
        if (doc) return doc;

        doc = new Y.Doc();
        this.docs.set(roomId, doc);

        // Persist to IndexedDB — survives page refresh, ~unlimited storage
        const idb = new IndexeddbPersistence(`buzzu-dm-${roomId}`, doc);
        this.idbProviders.set(roomId, idb);

        return doc;
    }

    /** Wait for IndexedDB to finish loading stored data into the Y.Doc. */
    async waitForSync(roomId: string): Promise<void> {
        const idb = this.idbProviders.get(roomId);
        if (idb) {
            await idb.whenSynced;
        }
    }

    /** Get the messages Y.Map for a conversation. */
    getMessagesMap(roomId: string): Y.Map<YjsMessageData> {
        const doc = this.getOrCreateDoc(roomId);
        return doc.getMap<YjsMessageData>('messages');
    }

    /** Get all messages as a sorted array (by order field). */
    getSnapshot(roomId: string): YjsMessageData[] {
        const map = this.getMessagesMap(roomId);
        const messages: YjsMessageData[] = [];
        map.forEach((value) => messages.push(value));
        return messages.sort((a, b) => a.order - b.order);
    }

    /** Add a new message to the conversation. Origin 'local' triggers WS sync. */
    addMessage(roomId: string, msg: YjsMessageData): void {
        const doc = this.getOrCreateDoc(roomId);
        doc.transact(() => {
            const map = doc.getMap<YjsMessageData>('messages');
            map.set(msg.id, msg);
            console.log(`[DmYjs] ✅ Message added to Y.Map | room=${roomId} id=${msg.id} from=${msg.senderId} mapSize=${map.size}`);
        }, 'local');
    }

    /** Edit a message's content. CRDT handles conflict via last-writer-wins. */
    updateMessage(roomId: string, messageId: string, newContent: string): void {
        const doc = this.getOrCreateDoc(roomId);
        doc.transact(() => {
            const map = doc.getMap<YjsMessageData>('messages');
            const existing = map.get(messageId);
            if (existing) {
                map.set(messageId, { ...existing, content: newContent });
                console.log(`[DmYjs] ✏️ Message edited | room=${roomId} id=${messageId}`);
            } else {
                console.warn(`[DmYjs] ⚠️ Edit failed — message not found | room=${roomId} id=${messageId}`);
            }
        }, 'local');
    }

    /** Delete a message from the conversation. */
    deleteMessage(roomId: string, messageId: string): void {
        const doc = this.getOrCreateDoc(roomId);
        doc.transact(() => {
            const map = doc.getMap<YjsMessageData>('messages');
            const existed = map.has(messageId);
            map.delete(messageId);
            console.log(`[DmYjs] 🗑️ Message deleted | room=${roomId} id=${messageId} existed=${existed} mapSize=${map.size}`);
        }, 'local');
    }

    /**
     * Register a handler for local Y.Doc updates (origin === 'local').
     * Used to send incremental Yjs updates over WebSocket to the peer.
     * Returns an unsubscribe function.
     */
    onLocalUpdate(roomId: string, callback: (encodedUpdate: string) => void): () => void {
        const doc = this.getOrCreateDoc(roomId);
        const handler = (update: Uint8Array, origin: any) => {
            if (origin === 'local') {
                const encoded = uint8ToBase64(update);
                console.log(`[DmYjs] 📤 Local update to send | room=${roomId} bytes=${update.byteLength} base64len=${encoded.length}`);
                callback(encoded);
            }
        };
        doc.on('update', handler);
        return () => doc.off('update', handler);
    }

    /**
     * Observe the messages Y.Map for any changes (all origins).
     * Used to sync Y.Map state → Zustand store for React rendering.
     * Returns an unsubscribe function.
     */
    observeMessages(roomId: string, callback: () => void): () => void {
        const map = this.getMessagesMap(roomId);
        map.observe(callback);
        return () => map.unobserve(callback);
    }

    /** Apply a base64-encoded remote Yjs update to the local Y.Doc. */
    applyRemoteUpdate(roomId: string, encodedUpdate: string): void {
        const doc = this.getOrCreateDoc(roomId);
        const update = base64ToUint8(encodedUpdate);
        const mapBefore = doc.getMap<YjsMessageData>('messages').size;
        Y.applyUpdate(doc, update, 'remote');
        const mapAfter = doc.getMap<YjsMessageData>('messages').size;
        console.log(`[DmYjs] 📥 Remote update applied | room=${roomId} bytes=${update.byteLength} mapSize=${mapBefore}→${mapAfter}`);
    }

    /** Get the base64-encoded state vector for the sync protocol. */
    getEncodedStateVector(roomId: string): string {
        const doc = this.getOrCreateDoc(roomId);
        return uint8ToBase64(Y.encodeStateVector(doc));
    }

    /** Compute a base64-encoded update containing changes the remote peer is missing. */
    computeUpdate(roomId: string, encodedRemoteSV: string): string {
        const doc = this.getOrCreateDoc(roomId);
        const remoteSV = base64ToUint8(encodedRemoteSV);
        const update = Y.encodeStateAsUpdate(doc, remoteSV);
        return uint8ToBase64(update);
    }

    /** Destroy a Y.Doc and its IndexedDB persistence. Frees memory. */
    destroyDoc(roomId: string): void {
        const doc = this.docs.get(roomId);
        if (doc) {
            doc.destroy();
            this.docs.delete(roomId);
        }
        const idb = this.idbProviders.get(roomId);
        if (idb) {
            idb.destroy();
            this.idbProviders.delete(roomId);
        }
    }
}

/** Singleton Yjs DM manager — shared across the app. */
export const DmYjsManager = new DmYjsManagerClass();
