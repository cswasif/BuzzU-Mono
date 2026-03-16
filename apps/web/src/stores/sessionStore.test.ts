import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { SessionState } from './sessionStore';

// Mock localStorage for Node environment (Zustand persist needs it)
// Must be set up BEFORE the store module is imported (ESM hoists imports)
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();
vi.stubGlobal('localStorage', localStorageMock);

let useSessionStore: typeof import('./sessionStore')['useSessionStore'];

beforeAll(async () => {
  const mod = await import('./sessionStore');
  useSessionStore = mod.useSessionStore;
});

// Reset store between tests
function resetStore() {
  useSessionStore.getState().resetSession();
}

describe('sessionStore', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('identity', () => {
    it('generates a peer ID on creation', () => {
      const { peerId } = useSessionStore.getState();
      expect(peerId).toBeTruthy();
      expect(peerId).toMatch(/^peer_/);
    });

    it('generates a display name on creation', () => {
      const { displayName } = useSessionStore.getState();
      expect(displayName).toBeTruthy();
      expect(displayName.length).toBeGreaterThan(0);
    });

    it('generates an avatar seed on creation', () => {
      const { avatarSeed } = useSessionStore.getState();
      expect(avatarSeed).toBeTruthy();
      expect(avatarSeed.length).toBe(24); // hex string
    });
  });

  describe('setGender / setGenderFilter', () => {
    it('defaults gender to U', () => {
      expect(useSessionStore.getState().gender).toBe('U');
    });

    it('sets gender', () => {
      useSessionStore.getState().setGender('M');
      expect(useSessionStore.getState().gender).toBe('M');
    });

    it('defaults genderFilter to both', () => {
      expect(useSessionStore.getState().genderFilter).toBe('both');
    });

    it('sets genderFilter', () => {
      useSessionStore.getState().setGenderFilter('female');
      expect(useSessionStore.getState().genderFilter).toBe('female');
    });
  });

  describe('genderModalDismissed', () => {
    it('defaults to false', () => {
      expect(useSessionStore.getState().genderModalDismissed).toBe(false);
    });

    it('can be set to true', () => {
      useSessionStore.getState().setGenderModalDismissed(true);
      expect(useSessionStore.getState().genderModalDismissed).toBe(true);
    });

    it('resets to false on resetSession', () => {
      useSessionStore.getState().setGenderModalDismissed(true);
      useSessionStore.getState().resetSession();
      expect(useSessionStore.getState().genderModalDismissed).toBe(false);
    });
  });

  describe('joinRoom / leaveRoom', () => {
    it('joinRoom sets room state', () => {
      useSessionStore.getState().joinRoom('room_123', 'partner_456', true, 'Alice', 'abc', null);
      const state = useSessionStore.getState();
      expect(state.currentRoomId).toBe('room_123');
      expect(state.isInChat).toBe(true);
      expect(state.partnerId).toBe('partner_456');
      expect(state.partnerName).toBe('Alice');
      expect(state.partnerAvatarSeed).toBe('abc');
      expect(state.partnerIsVerified).toBe(true);
    });

    it('leaveRoom clears room state', () => {
      useSessionStore.getState().joinRoom('room_123', 'partner_456', true);
      useSessionStore.getState().leaveRoom();
      const state = useSessionStore.getState();
      expect(state.currentRoomId).toBeNull();
      expect(state.isInChat).toBe(false);
      expect(state.partnerId).toBeNull();
      expect(state.partnerIsVerified).toBe(false);
    });
  });

  describe('initSession', () => {
    it('clears stale in-chat state on fresh page load', () => {
      // Simulate a stale state (e.g. from previous session persisted in localStorage)
      useSessionStore.getState().joinRoom('room_old', 'partner_old', false);
      useSessionStore.getState().initSession();
      const state = useSessionStore.getState();
      expect(state.currentRoomId).toBeNull();
      expect(state.isInChat).toBe(false);
      expect(state.partnerId).toBeNull();
    });

    it('preserves peerId across initSession', () => {
      const { peerId } = useSessionStore.getState();
      useSessionStore.getState().initSession();
      expect(useSessionStore.getState().peerId).toBe(peerId);
    });

    it('preserves active room on reload at chat landing route', () => {
      window.history.pushState({}, '', '/chat/new');
      const navSpy = vi
        .spyOn(window.performance, 'getEntriesByType')
        .mockReturnValue([{ type: 'reload' } as PerformanceNavigationTiming]);

      useSessionStore.getState().joinRoom('room_keep', 'partner_keep', false);
      useSessionStore.getState().initSession();

      const state = useSessionStore.getState();
      expect(state.currentRoomId).toBe('room_keep');
      expect(state.isInChat).toBe(true);
      expect(state.partnerId).toBe('partner_keep');
      navSpy.mockRestore();
    });
  });

  describe('friends', () => {
    it('handles friend request flow', () => {
      const store = useSessionStore.getState();
      store.handleReceivedFriendRequest({ id: 'peer_A', username: 'Alice', avatarSeed: 'seed_a', avatarUrl: null });
      expect(useSessionStore.getState().friendRequestsReceived['peer_A']).toBeDefined();

      useSessionStore.getState().acceptFriendRequest('peer_A');
      const state = useSessionStore.getState();
      expect(state.friendList).toHaveLength(1);
      expect(state.friendList[0].id).toBe('peer_A');
      expect(state.friendRequestsReceived['peer_A']).toBeUndefined();
    });

    it('prevents duplicate friend adds', () => {
      useSessionStore.getState().handleReceivedFriendRequest({ id: 'peer_A', username: 'Alice', avatarSeed: 'seed_a', avatarUrl: null });
      useSessionStore.getState().acceptFriendRequest('peer_A');

      // Try to accept again (should not add duplicate)
      useSessionStore.getState().handleReceivedFriendRequest({ id: 'peer_A', username: 'Alice', avatarSeed: 'seed_a', avatarUrl: null });
      useSessionStore.getState().acceptFriendRequest('peer_A');
      expect(useSessionStore.getState().friendList).toHaveLength(1);
    });

    it('removeFriend cleans up DMs', () => {
      useSessionStore.getState().handleReceivedFriendRequest({ id: 'peer_B', username: 'Bob', avatarSeed: 'seed_b', avatarUrl: null });
      useSessionStore.getState().acceptFriendRequest('peer_B');
      useSessionStore.getState().addDmMessage('peer_B', {
        id: 'msg_1', username: 'Bob', avatarSeed: 'seed_b', avatarUrl: null,
        timestamp: new Date().toISOString(), content: 'Hello', isVerified: false,
      });
      expect(useSessionStore.getState().dmMessages['peer_B']).toHaveLength(1);

      const friendCountBefore = useSessionStore.getState().friendList.length;
      useSessionStore.getState().removeFriend('peer_B');
      expect(useSessionStore.getState().friendList).toHaveLength(friendCountBefore - 1);
      expect(useSessionStore.getState().friendList.find(f => f.id === 'peer_B')).toBeUndefined();
      expect(useSessionStore.getState().dmMessages['peer_B']).toBeUndefined();
    });
  });

  describe('DM messages', () => {
    it('addDmMessage appends to friend conversation', () => {
      const msg = { id: '1', username: 'A', avatarSeed: 's', avatarUrl: null, timestamp: '', content: 'hi', isVerified: false };
      useSessionStore.getState().addDmMessage('friend_1', msg);
      expect(useSessionStore.getState().dmMessages['friend_1']).toHaveLength(1);
    });

    it('updateDmMessage modifies message content', () => {
      const msg = { id: 'msg_1', username: 'A', avatarSeed: 's', avatarUrl: null, timestamp: '', content: 'original', isVerified: false };
      useSessionStore.getState().addDmMessage('f1', msg);
      useSessionStore.getState().updateDmMessage('f1', 'msg_1', 'edited');
      expect(useSessionStore.getState().dmMessages['f1'][0].content).toBe('edited');
    });

    it('deleteDmMessage removes the message', () => {
      const msg = { id: 'msg_1', username: 'A', avatarSeed: 's', avatarUrl: null, timestamp: '', content: 'bye', isVerified: false };
      useSessionStore.getState().addDmMessage('f1', msg);
      useSessionStore.getState().deleteDmMessage('f1', 'msg_1');
      expect(useSessionStore.getState().dmMessages['f1']).toHaveLength(0);
    });

    it('tracks and clears per-friend unread DM counts', () => {
      useSessionStore.getState().incrementDmUnread('friend_1');
      useSessionStore.getState().incrementDmUnread('friend_1', 2);
      expect(useSessionStore.getState().dmUnreadCounts['friend_1']).toBe(3);
      expect(useSessionStore.getState().hasNewDmMessage).toBe(true);

      useSessionStore.getState().clearDmUnread('friend_1');
      expect(useSessionStore.getState().dmUnreadCounts['friend_1']).toBeUndefined();
      expect(useSessionStore.getState().hasNewDmMessage).toBe(false);
    });

    it('clears unread count for the DM when it is opened', () => {
      useSessionStore.getState().incrementDmUnread('friend_2', 4);
      useSessionStore.getState().setDmFriend({ id: 'friend_2', username: 'Friend 2', avatarSeed: 'friend_2', avatarUrl: null });
      expect(useSessionStore.getState().dmUnreadCounts['friend_2']).toBeUndefined();
    });
  });

  describe('resetSession', () => {
    it('generates new peerId and resets all state', () => {
      const oldId = useSessionStore.getState().peerId;
      useSessionStore.getState().setGender('F');
      useSessionStore.getState().setInterests(['coding', 'music']);
      useSessionStore.getState().joinRoom('room_x', 'partner_y', true);
      useSessionStore.getState().incrementDmUnread('partner_y', 2);

      useSessionStore.getState().resetSession();
      const state = useSessionStore.getState();
      expect(state.peerId).not.toBe(oldId);
      expect(state.gender).toBe('U');
      expect(state.interests).toEqual([]);
      expect(state.currentRoomId).toBeNull();
      expect(state.isInChat).toBe(false);
      expect(state.hasNewDmMessage).toBe(false);
      expect(state.dmUnreadCounts).toEqual({});
    });
  });
});
