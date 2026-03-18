import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ModernImage } from "../ModernImage";
import { useSessionStore } from "../../../stores/sessionStore";

describe("ModernImage vanish mode", () => {
  beforeEach(() => {
    useSessionStore.setState({ blurImages: true });
  });

  it("shows reveal control when blur preference is enabled", () => {
    render(<ModernImage src="blob:test-blur-on" />);
    expect(screen.getByText("Click to View")).toBeInTheDocument();
  });

  it("shows image directly when blur preference is disabled", () => {
    useSessionStore.setState({ blurImages: false });
    render(<ModernImage src="blob:test-blur-off" />);
    expect(screen.queryByRole("button", { name: "Reveal image" })).not.toBeInTheDocument();
  });

  it("consumes one-time image on first open and blocks reopen", async () => {
    const onVanishOpen = vi.fn();
    const user = userEvent.setup();

    render(
      <ModernImage
        src="blob:test-once"
        isVanish
        onVanishOpen={onVanishOpen}
      />,
    );

    await user.click(screen.getByText("Open Once"));
    expect(onVanishOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Close full screen image" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close full screen image" }));
    expect(screen.getByText("Opened")).toBeInTheDocument();

    await user.click(screen.getByText("Open Once"));
    expect(onVanishOpen).toHaveBeenCalledTimes(1);
  });
});
