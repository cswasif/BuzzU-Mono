import React from "react";
import { render, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DmSignalingProvider, useDmSignaling } from "../DmSignalingContext";

const wsInstances: MockWebSocket[] = [];
const wsSendMock = vi.fn();

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    wsInstances.push(this);
  }

  send(data: string) {
    wsSendMock(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}

const storeState: any = {
  peerId: "peer_self",
  friendList: [{ id: "friend_1", username: "Friend", avatarSeed: "seed_1", avatarUrl: null }],
  activeDmFriend: { id: "friend_1", username: "Friend", avatarSeed: "seed_1", avatarUrl: null },
  syncDmMessages: vi.fn(),
  setHasNewDmMessage: vi.fn(),
  incrementDmUnread: vi.fn(),
};

vi.mock("../../stores/sessionStore", () => ({
  useSessionStore: Object.assign(
    () => storeState,
    {
      getState: () => storeState,
    },
  ),
}));

vi.mock("../../yjs/DmYjsManager", () => ({
  DmYjsManager: {
    getDmRoomId: (a: string, b: string) => `dm_${[a, b].sort().join("_")}`,
    getOrCreateDoc: vi.fn(),
    observeMessages: vi.fn(() => vi.fn()),
    waitForSync: vi.fn(() => Promise.resolve()),
    getEncodedStateVector: vi.fn(() => "sv"),
    onLocalUpdate: vi.fn(() => vi.fn()),
    getSnapshot: vi.fn(() => []),
    computeUpdate: vi.fn(() => "u"),
    applyRemoteUpdate: vi.fn(),
    getMessagesMap: vi.fn(() => ({ size: 0, has: () => false })),
    addMessage: vi.fn(),
    updateMessage: vi.fn(),
    deleteMessage: vi.fn(),
  },
}));

describe("DmSignalingProvider heartbeat protocol", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    wsInstances.length = 0;
    wsSendMock.mockClear();
    storeState.activeDmFriend = {
      id: "friend_1",
      username: "Friend",
      avatarSeed: "seed_1",
      avatarUrl: null,
    };
    (globalThis as any).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends structured Ping heartbeat messages", async () => {
    render(
      <DmSignalingProvider>
        <div>ok</div>
      </DmSignalingProvider>,
    );

    expect(wsInstances).toHaveLength(1);

    await act(async () => {
      wsInstances[0].onopen?.(new Event("open"));
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(20050);
    });

    expect(wsSendMock).toHaveBeenCalled();
    const heartbeatPayload = wsSendMock.mock.calls
      .map((call) => call[0])
      .find((payload) => typeof payload === "string" && payload.includes('"type":"Ping"'));
    expect(heartbeatPayload).toBeTruthy();
  });

  it("responds to Ping with Pong", async () => {
    render(
      <DmSignalingProvider>
        <div>ok</div>
      </DmSignalingProvider>,
    );

    expect(wsInstances).toHaveLength(1);

    await act(async () => {
      wsInstances[0].onopen?.(new Event("open"));
      await Promise.resolve();
    });

    await act(async () => {
      wsInstances[0].onmessage?.({
        data: JSON.stringify({ type: "Ping", from: "friend_1", to: "peer_self" }),
      } as MessageEvent);
      await Promise.resolve();
    });

    const pongPayload = wsSendMock.mock.calls
      .map((call) => call[0])
      .find((payload) => typeof payload === "string" && payload.includes('"type":"Pong"'));
    expect(pongPayload).toBeTruthy();
  });

  it("keeps DM sockets connected even without an active friend", () => {
    storeState.activeDmFriend = null;
    render(
      <DmSignalingProvider>
        <div>ok</div>
      </DmSignalingProvider>,
    );
    expect(wsInstances).toHaveLength(1);
  });

  it("sends Profile updates for active DM friend", async () => {
    let triggerSendProfile: (() => void) | null = null;
    function ProfileSender() {
      const { sendProfile } = useDmSignaling();
      triggerSendProfile = () => {
        sendProfile("friend_1", {
          username: "Me",
          avatarSeed: "seed_new",
          avatarUrl: "https://cdn.example/avatar.png",
        });
      };
      return <div>ok</div>;
    }

    render(
      <DmSignalingProvider>
        <ProfileSender />
      </DmSignalingProvider>,
    );

    expect(wsInstances).toHaveLength(1);
    await act(async () => {
      wsInstances[0].onopen?.(new Event("open"));
      triggerSendProfile?.();
      await Promise.resolve();
    });

    const profilePayload = wsSendMock.mock.calls
      .map((call) => call[0])
      .find((payload) => typeof payload === "string" && payload.includes('"type":"Profile"'));
    expect(profilePayload).toBeTruthy();
    expect(profilePayload).toContain('"avatarSeed":"seed_new"');
  });

  it("handles incoming Profile with top-level fields", async () => {
    const onProfileMock = vi.fn();

    function ProfileReceiver() {
      const { onProfile } = useDmSignaling();
      React.useEffect(() => onProfile(onProfileMock), [onProfile]);
      return <div>ok</div>;
    }

    render(
      <DmSignalingProvider>
        <ProfileReceiver />
      </DmSignalingProvider>,
    );

    expect(wsInstances).toHaveLength(1);
    await act(async () => {
      wsInstances[0].onopen?.(new Event("open"));
      await Promise.resolve();
    });

    await act(async () => {
      wsInstances[0].onmessage?.({
        data: JSON.stringify({
          type: "Profile",
          from: "friend_1",
          to: "peer_self",
          username: "Friend Updated",
          avatarSeed: "seed_new_friend",
          avatarUrl: "https://cdn.example/friend.png",
        }),
      } as MessageEvent);
      await Promise.resolve();
    });

    expect(onProfileMock).toHaveBeenCalledWith(
      "friend_1",
      "Friend Updated",
      "seed_new_friend",
      "https://cdn.example/friend.png",
    );
  });
});
