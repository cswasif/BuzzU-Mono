import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Button } from "../button";

describe("video-match Button", () => {
  it("announces loading state and disables native button interactions", () => {
    render(
      <Button isLoading loadingText="Saving profile">
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: /save/i });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Saving profile");
  });

  it("does not mark button busy when not loading", () => {
    render(
      <Button>
        Profile
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Profile" });
    expect(button).not.toHaveAttribute("aria-busy");
    expect(button).toBeEnabled();
  });
});
