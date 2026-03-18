import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { InterestsModal } from "../Modals";
import { useSessionStore } from "../../../stores/sessionStore";

describe("InterestsModal", () => {
  beforeEach(() => {
    useSessionStore.setState({
      interests: ["music"],
      matchWithInterests: true,
      verifiedOnly: false,
      isVerified: true,
      genderFilter: "both",
      interestTimeoutSec: 10,
    });
  });

  it("shows existing interests from store", () => {
    render(<InterestsModal onClose={() => {}} />);
    expect(screen.getByText("music")).toBeInTheDocument();
  });

  it("adds an interest through the add button", async () => {
    const user = userEvent.setup();
    render(<InterestsModal onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText("Add an interest..."), "coding");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(useSessionStore.getState().interests).toContain("coding");
  });
});
