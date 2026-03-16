import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ModernImage } from "../ModernImage";

describe("ModernImage vanish mode", () => {
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
