import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { MessageInput } from "../MessageInput";
import { useSessionStore } from "../../../stores/sessionStore";

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
  beforeEach(() => {
    useSessionStore.setState({ convertEmoticons: true });
  });

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

  it("respects convert emoticons preference", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();

    render(
      <MessageInput
        {...baseProps}
        onSend={onSend}
        connectionState="connected"
      />,
    );

    const textarea = screen.getByLabelText("Send a message");
    await user.type(textarea, "Hi :) {enter}");
    expect(onSend).toHaveBeenLastCalledWith("Hi 😃", null);

    act(() => {
      useSessionStore.setState({ convertEmoticons: false });
    });
    await user.type(textarea, "Hi :) {enter}");
    expect(onSend).toHaveBeenLastCalledWith("Hi :)", null);
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

  it("attempts to restore fullscreen after selecting images", async () => {
    let fullscreenElement: Element | null = document.documentElement;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    const requestFullscreen = vi.fn().mockImplementation(async () => {
      fullscreenElement = document.documentElement;
    });
    (document.documentElement as any).requestFullscreen = requestFullscreen;

    const onSelectFiles = vi.fn();
    const { container } = render(
      <MessageInput
        {...baseProps}
        onSelectFiles={onSelectFiles}
        connectionState="connected"
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Attach image" }));
    fullscreenElement = null;

    const fileInput = container.querySelector("#image-upload") as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["data"], "photo.png", { type: "image/png" })],
      },
    });

    await waitFor(() => expect(onSelectFiles).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(requestFullscreen).toHaveBeenCalledTimes(1));
  });

  it("shows manual fullscreen restore action when auto-restore is blocked", async () => {
    let fullscreenElement: Element | null = document.documentElement;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    const requestFullscreen = vi
      .fn()
      .mockRejectedValueOnce(new Error("gesture required"))
      .mockImplementation(async () => {
        fullscreenElement = document.documentElement;
      });
    (document.documentElement as any).requestFullscreen = requestFullscreen;

    const { container } = render(
      <MessageInput
        {...baseProps}
        connectionState="connected"
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Attach image" }));
    fullscreenElement = null;

    const fileInput = container.querySelector("#image-upload") as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["data"], "photo.png", { type: "image/png" })],
      },
    });

    const restoreButton = await screen.findByRole("button", { name: "Restore fullscreen" });
    await user.click(restoreButton);
    await waitFor(() => expect(requestFullscreen).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Restore fullscreen" })).not.toBeInTheDocument();
    });
  });
});
