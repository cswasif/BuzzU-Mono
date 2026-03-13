import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MessageList } from "../MessageList";
import { useSessionStore } from "../../../stores/sessionStore";
import type { Message } from "../types";

const baseMessage: Message = {
  id: "m1",
  username: "Alex",
  avatarSeed: "seed",
  avatarUrl: null,
  timestamp: "2025-01-01T00:00:00.000Z",
  content: "Hello there",
  type: "message",
};

const baseProps = {
  messages: [baseMessage],
  partnerName: "Alex",
  onReply: vi.fn(),
  onEdit: vi.fn(),
  onReport: vi.fn(),
  onDelete: vi.fn(),
};

describe("MessageList", () => {
  beforeEach(() => {
    useSessionStore.setState({
      avatarUrl: null,
      avatarSeed: "self-seed",
      partnerName: "Alex",
      partnerAvatarSeed: "seed",
      partnerAvatarUrl: null,
    });
  });

  it("shows encryption ready status and partner name", () => {
    const { container } = render(
      <MessageList
        {...baseProps}
        partnerIsVerified
        isSignalReady
      />,
    );

    expect(screen.getByText(/You are now chatting with/i)).toBeInTheDocument();
    const partnerEl = container.querySelector("span.text-emerald-400");
    expect(partnerEl).not.toBeNull();
    if (partnerEl) {
      expect(partnerEl).toHaveTextContent("Alex");
    }
    expect(screen.getByText("Messages End-to-End Encrypted")).toBeInTheDocument();
  });

  it("calls onProfileClick when partner name is clicked", () => {
    const onProfileClick = vi.fn();
    const { container } = render(
      <MessageList
        {...baseProps}
        messages={[]}
        onProfileClick={onProfileClick}
      />,
    );

    const partnerEl = container.querySelector("span.text-emerald-400");
    expect(partnerEl).not.toBeNull();
    if (partnerEl) {
      fireEvent.click(partnerEl);
    }
    expect(onProfileClick).toHaveBeenCalledWith("Alex", "seed", null, undefined);
  });
});
