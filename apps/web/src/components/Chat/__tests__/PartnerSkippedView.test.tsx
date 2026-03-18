import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { PartnerSkippedView } from "../PartnerSkippedView";
import { useSessionStore } from "../../../stores/sessionStore";

describe("PartnerSkippedView wiring", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    useSessionStore.setState({
      interests: ["music"],
      matchWithInterests: true,
      interestTimeoutSec: 10,
      genderFilter: "both",
    });
  });

  it("toggles match with interests in store", async () => {
    const user = userEvent.setup();
    render(<PartnerSkippedView />);

    const switchButton = screen.getByRole("switch");
    await user.click(switchButton);
    expect(useSessionStore.getState().matchWithInterests).toBe(false);
  });

  it("updates wait duration and gender filter", async () => {
    const user = userEvent.setup();
    render(<PartnerSkippedView />);

    await user.click(screen.getByRole("button", { name: "Interests (ON)" }));
    await user.click(screen.getByRole("button", { name: "Forever" }));
    expect(useSessionStore.getState().interestTimeoutSec).toBe(600);

    await user.click(screen.getByRole("button", { name: "Gender Filter" }));
    await user.click(screen.getByText("Male"));
    expect(useSessionStore.getState().genderFilter).toBe("male");
  });

  it("adds interests via input using store logic", async () => {
    const user = userEvent.setup();
    render(<PartnerSkippedView />);

    await user.click(screen.getByRole("button", { name: "Interests (ON)" }));
    const input = screen.getByPlaceholderText("Add an interest...");
    await user.type(input, "coding{enter}");

    expect(useSessionStore.getState().interests).toContain("coding");
  });
});
