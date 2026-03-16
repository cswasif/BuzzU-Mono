import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MessageInput } from "../MessageInput";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

const baseProps = {
  replyingTo: null,
  editingMessage: null,
  onCancelReply: vi.fn(),
  onCancelEdit: vi.fn(),
  onStart: vi.fn(),
  onStop: vi.fn(),
  onSkip: vi.fn(),
  onSend: vi.fn(),
  onTyping: vi.fn(),
  onSelectFiles: vi.fn(),
  isGifPickerOpen: false,
};

describe("MessageInput", () => {
  it("disables input when not connected", () => {
    render(
      <MessageInput
        {...baseProps}
        connectionState="idle"
      />,
    );

    const textarea = screen.getByLabelText("Send a message");
    expect(textarea).toBeDisabled();
    expect(textarea).toHaveAttribute("placeholder", "Click START to chat...");
  });

  it("sends on enter and clears input", async () => {
    const onSend = vi.fn();
    render(
      <MessageInput
        {...baseProps}
        onSend={onSend}
        connectionState="connected"
      />,
    );

    const user = userEvent.setup();
    const textarea = screen.getByLabelText("Send a message");
    await user.type(textarea, "Hello{enter}");

    expect(onSend).toHaveBeenCalledWith("Hello", null);
    expect(textarea).toHaveValue("");
  });

  it("exposes busy and live status while searching", () => {
    render(
      <MessageInput
        {...baseProps}
        connectionState="searching"
      />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Searching for a partner");

    const actionButton = screen.getByRole("button", { name: "Stop searching" });
    expect(actionButton).toHaveAttribute("aria-busy", "true");
  });

  it("exposes accessible labels for attach, gif and emoji actions", () => {
    render(
      <MessageInput
        {...baseProps}
        connectionState="connected"
      />,
    );

    expect(screen.getByRole("button", { name: "Attach image" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open GIF picker" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open emoji picker" })).toBeInTheDocument();
  });

  it("renders vanish toggle only when handler is provided", () => {
    const { rerender } = render(
      <MessageInput
        {...baseProps}
        connectionState="connected"
      />,
    );

    expect(screen.queryByRole("button", { name: "Enable one-time image mode" })).not.toBeInTheDocument();

    rerender(
      <MessageInput
        {...baseProps}
        connectionState="connected"
        onToggleVanishMode={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Enable one-time image mode" })).toBeInTheDocument();
  });
});
