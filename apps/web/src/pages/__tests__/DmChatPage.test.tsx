import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { DmChatPage } from "../DmChatPage";

const {
  navigateMock,
  setDmFriendMock,
  storeState,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  setDmFriendMock: vi.fn(),
  storeState: {
    friendList: [],
    setDmFriend: vi.fn(),
    activeDmFriend: null,
    matchHistory: [],
    partnerId: null,
    partnerName: null,
    partnerAvatarSeed: null,
    partnerAvatarUrl: null,
    dmMessages: {},
  } as any,
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ friendId: "peer_123" }),
  useNavigate: () => navigateMock,
}));

vi.mock("../../stores/sessionStore", () => ({
  useSessionStore: Object.assign(
    () => storeState,
    {
      getState: () => ({ activeDmFriend: storeState.activeDmFriend }),
      persist: {
        hasHydrated: () => true,
        onHydrate: () => () => {},
        onFinishHydration: () => () => {},
      },
    },
  ),
}));

vi.mock("../../components/Chat/DmChatArea", () => ({
  DmChatArea: () => <div data-testid="dm-chat-area" />,
}));

describe("DmChatPage route resolution", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    setDmFriendMock.mockClear();
    storeState.setDmFriend = setDmFriendMock;
    storeState.friendList = [];
    storeState.activeDmFriend = null;
    storeState.matchHistory = [];
    storeState.partnerId = null;
    storeState.partnerName = null;
    storeState.partnerAvatarSeed = null;
    storeState.partnerAvatarUrl = null;
    storeState.dmMessages = {};
  });

  it("opens DM using a safe route fallback friend when list data is not yet available", async () => {
    render(<DmChatPage />);

    await waitFor(() => {
      expect(setDmFriendMock).toHaveBeenCalledWith({
        id: "peer_123",
        username: "Friend",
        avatarSeed: "peer_123",
        avatarUrl: null,
      });
    });
    expect(navigateMock).not.toHaveBeenCalledWith("/chat/new", { replace: true });
  });
});
