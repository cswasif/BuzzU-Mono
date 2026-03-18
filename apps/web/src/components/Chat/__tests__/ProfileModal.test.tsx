import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { ProfileModal } from "../ProfileModal";
import { useSessionStore } from "../../../stores/sessionStore";

describe("ProfileModal preferences", () => {
  beforeEach(() => {
    useSessionStore.setState({
      displayName: "Will",
      joinedAt: "2026-02-25T12:00:00.000Z",
      interests: ["coding", "music"],
      interestsVisibility: "Everyone",
      badgeVisibility: "Everyone",
      friendList: [],
    });
  });

  it("shows self interests when interests visibility allows it", () => {
    render(
      <MemoryRouter>
        <ProfileModal
          isOpen
          onClose={() => {}}
          username="Will"
          avatarSeed="seed-will"
          isVerified
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("coding")).toBeInTheDocument();
    expect(screen.getByText("Visible to Everyone")).toBeInTheDocument();
  });

  it("keeps self interests visible while showing nobody visibility state", () => {
    render(
      <MemoryRouter>
        <ProfileModal
          isOpen
          onClose={() => {}}
          username="Will"
          avatarSeed="seed-will"
          isVerified
        />
      </MemoryRouter>,
    );

    act(() => {
      useSessionStore.setState({ interestsVisibility: "Nobody" });
    });

    expect(screen.getByText("Visible to Nobody")).toBeInTheDocument();
    expect(screen.getByText("coding")).toBeInTheDocument();
  });

  it("keeps own verified badge visible when badge visibility is nobody", () => {
    const { container } = render(
      <MemoryRouter>
        <ProfileModal
          isOpen
          onClose={() => {}}
          username="Will"
          avatarSeed="seed-will"
          isVerified
        />
      </MemoryRouter>,
    );

    act(() => {
      useSessionStore.setState({ badgeVisibility: "Nobody" });
    });
    expect(container.querySelector("svg.lucide-shield-check")).not.toBeNull();

    act(() => {
      useSessionStore.setState({ badgeVisibility: "Everyone" });
    });
    expect(container.querySelector("svg.lucide-shield-check")).not.toBeNull();
  });
});
