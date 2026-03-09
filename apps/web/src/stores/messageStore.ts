/**
 * messageStore.ts — Ephemeral, in-memory message cache keyed by roomId.
 *
 * Follows the same pattern as Rocket.Chat's global document store and
 * Element's MatrixClient room timeline: messages live in a singleton
 * outside the React tree so they survive route changes (DM ↔ chat).
 *
 * NOT persisted to localStorage — E2E encrypted P2P messages should
 * never touch disk. The store is purely in-RAM and clears when the
 * page is closed.
 */

import { create } from 'zustand';
import type { Message } from '../components/Chat/types';

/**
 * Stable empty array — returned by selectors when a room has no messages.
 * Using a constant avoids creating a new [] on every render, which would
 * break Zustand's Object.is equality check and cause infinite re-renders.
 */
export const EMPTY_MESSAGES: Message[] = [];

/**
 * Max rooms to keep in memory (Rocket.Chat LRU pattern).
 * Oldest rooms are evicted when this limit is exceeded.
 */
const MAX_ROOMS = 5;

/**
 * Max messages per room before oldest messages are dropped.
 * Prevents unbounded memory growth in long chat sessions.
 */
const MAX_MESSAGES_PER_ROOM = 500;

interface MessageState {
    /** messages[roomId] → ordered array of Message objects */
    messages: Record<string, Message[]>;

    /** LRU order — most recently accessed roomId is at the end */
    roomOrder: string[];

    /** Append a single message to a room's history */
    addMessage: (roomId: string, message: Message) => void;

    /** Replace the entire message list for a room (bulk restore, etc.) */
    setMessages: (roomId: string, messages: Message[]) => void;

    /** Update a single message in-place (edit, progress update, etc.) */
    updateMessage: (roomId: string, messageId: string, updater: (msg: Message) => Message) => void;

    /** Remove a single message by id */
    removeMessage: (roomId: string, messageId: string) => void;

    /** Clear all messages for a room (on stop/skip/leave) */
    clearRoom: (roomId: string) => void;

    /** Get messages for a room (returns [] if none) */
    getMessages: (roomId: string) => Message[];
}

export const useMessageStore = create<MessageState>()((set, get) => ({
    messages: {},
    roomOrder: [],

    addMessage: (roomId, message) =>
        set((state) => {
            // LRU: move this room to end of order
            const newOrder = state.roomOrder.filter(r => r !== roomId);
            newOrder.push(roomId);

            const newMessages = { ...state.messages };
            const existing = newMessages[roomId] || [];
            let updated = [...existing, message];

            // Cap messages per room (drop oldest, revoke their blob URLs)
            if (updated.length > MAX_MESSAGES_PER_ROOM) {
                const dropped = updated.slice(0, updated.length - MAX_MESSAGES_PER_ROOM);
                dropped.forEach(m => {
                    const urlMatch = m.content.match(/\((blob:.*?)\)/);
                    if (urlMatch?.[1]) URL.revokeObjectURL(urlMatch[1]);
                });
                updated = updated.slice(-MAX_MESSAGES_PER_ROOM);
            }
            newMessages[roomId] = updated;

            // LRU eviction: drop oldest rooms beyond MAX_ROOMS
            while (newOrder.length > MAX_ROOMS) {
                const evictedId = newOrder.shift()!;
                const evictedMsgs = newMessages[evictedId];
                if (evictedMsgs) {
                    evictedMsgs.forEach(m => {
                        const urlMatch = m.content.match(/\((blob:.*?)\)/);
                        if (urlMatch?.[1]) URL.revokeObjectURL(urlMatch[1]);
                    });
                    delete newMessages[evictedId];
                }
            }

            return { messages: newMessages, roomOrder: newOrder };
        }),

    setMessages: (roomId, messages) =>
        set((state) => {
            // Also update LRU order so this room is tracked for eviction
            const newOrder = state.roomOrder.filter(r => r !== roomId);
            newOrder.push(roomId);
            return {
                messages: {
                    ...state.messages,
                    [roomId]: messages,
                },
                roomOrder: newOrder,
            };
        }),

    updateMessage: (roomId, messageId, updater) =>
        set((state) => {
            const roomMessages = state.messages[roomId];
            if (!roomMessages) return state;
            return {
                messages: {
                    ...state.messages,
                    [roomId]: roomMessages.map((m) =>
                        m.id === messageId ? updater(m) : m
                    ),
                },
            };
        }),

    removeMessage: (roomId, messageId) =>
        set((state) => {
            const roomMessages = state.messages[roomId];
            if (!roomMessages) return state;
            return {
                messages: {
                    ...state.messages,
                    [roomId]: roomMessages.filter((m) => m.id !== messageId),
                },
            };
        }),

    clearRoom: (roomId) =>
        set((state) => {
            const roomMessages = state.messages[roomId];
            if (!roomMessages) return state;
            // Revoke any blob URLs before clearing
            roomMessages.forEach((m) => {
                const urlMatch = m.content.match(/\((blob:.*?)\)/);
                if (urlMatch?.[1]) URL.revokeObjectURL(urlMatch[1]);
            });
            const newMessages = { ...state.messages };
            delete newMessages[roomId];
            return {
                messages: newMessages,
                roomOrder: state.roomOrder.filter(r => r !== roomId),
            };
        }),

    getMessages: (roomId) => get().messages[roomId] || [],
}));
