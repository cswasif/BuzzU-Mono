import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import Header from "../Header";

const { locationMock, storeState } = vi.hoisted(() => ({
  locationMock: { pathname: "/chat/new" },
  storeState: {
    friendRequestsReceived: {},
    avatarSeed: "avatar",
    isInChat: false,
    partnerName: null,
    activeDmFriend: null,
    partnerId: null,
  } as any,
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => locationMock,
}));

vi.mock("../../../stores/sessionStore", () => ({
  useSessionStore: () => storeState,
}));

vi.mock("../../Chat/ConnectionIndicator", () => ({
  ConnectionIndicator: () => <div data-testid="connection-indicator" />,
}));

async function tabTo(user: ReturnType<typeof userEvent.setup>, name: string) {
  for (let i = 0; i < 20; i += 1) {
    await user.tab();
    if (document.activeElement?.getAttribute("aria-label") === name) {
      return;
    }
  }
  throw new Error(`Unable to tab to ${name}`);
}

describe("Dashboard updated header keyboard interactions", () => {
  beforeEach(() => {
    locationMock.pathname = "/chat/new";
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null,
    });
    (document.documentElement as any).requestFullscreen = vi.fn().mockResolvedValue(undefined);
    (document as any).exitFullscreen = vi.fn().mockResolvedValue(undefined);
  });

  it("supports tab + enter activation for the menu button", async () => {
    const onMenuClick = vi.fn();
    render(
      <Header
        onMenuClick={onMenuClick}
        onHistoryClick={vi.fn()}
        onFriendRequestsClick={vi.fn()}
        onInboxClick={vi.fn()}
        theme="dark"
        toggleTheme={vi.fn()}
        isLeftSidebarOpen={false}
      />,
    );

    const user = userEvent.setup();
    await tabTo(user, "Open menu");
    await user.keyboard("{Enter}");
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });

  it("supports keyboard activation for friend requests and chat history buttons", async () => {
    const onFriendRequestsClick = vi.fn();
    const onHistoryClick = vi.fn();
    render(
      <Header
        onMenuClick={vi.fn()}
        onHistoryClick={onHistoryClick}
        onFriendRequestsClick={onFriendRequestsClick}
        onInboxClick={vi.fn()}
        theme="dark"
        toggleTheme={vi.fn()}
        isLeftSidebarOpen={false}
      />,
    );

    const user = userEvent.setup();
    const friendRequests = screen.getByRole("button", { name: "Open friend requests" });
    friendRequests.focus();
    await user.keyboard("{Enter}");
    expect(onFriendRequestsClick).toHaveBeenCalledTimes(1);

    const history = screen.getByRole("button", { name: "Open chat history" });
    history.focus();
    await user.keyboard(" ");
    expect(onHistoryClick).toHaveBeenCalledTimes(1);
  });
});
