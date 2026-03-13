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
});
