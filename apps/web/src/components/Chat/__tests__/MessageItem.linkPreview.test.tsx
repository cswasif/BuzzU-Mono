import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MessageItem } from "../MessageItem";
import { useSessionStore } from "../../../stores/sessionStore";
import type { Message } from "../types";

const baseMessage: Message = {
  id: "m-preview-1",
  username: "Alex",
  avatarSeed: "seed-alex",
  avatarUrl: null,
  timestamp: "10:00 AM",
  content: "check this https://imgbb.com/",
  type: "message",
};

describe("MessageItem link preview", () => {
  beforeEach(() => {
    useSessionStore.setState({
      avatarUrl: null,
      avatarSeed: "seed-me",
      linkPreviewsEnabled: true,
      partnerName: "Alex",
      partnerAvatarSeed: "seed-alex",
      partnerAvatarUrl: null,
    });
    vi.restoreAllMocks();
  });

  it("renders high-quality preview metadata from preview endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "https://imgbb.com/",
          title: "ImgBB — Upload Image — Free Image Hosting",
          description: "Upload and share your images.",
          siteName: "ImgBB",
          displayUrl: "imgbb.com/",
          image: "https://i.ibb.co/example/cover.png",
          favicon: "https://imgbb.com/favicon.ico",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(<MessageItem message={baseMessage} />);

    expect(screen.getByRole("link", { name: "https://imgbb.com/" })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("ImgBB — Upload Image — Free Image Hosting")).toBeInTheDocument();
    });

    expect(screen.getByText("Upload and share your images.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/link-preview?url=https%3A%2F%2Fimgbb.com%2F");
  });

  it("falls back to host preview when endpoint is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network failure"));

    render(
      <MessageItem
        message={{
          ...baseMessage,
          id: "m-preview-2",
          content: "check this https://imgbb.com/demo-preview",
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Demo preview")).toBeInTheDocument();
    });
  });

  it("renders direct image preview fallback for proxy image links", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network failure"));

    const directImageUrl = "https://encrypted-tbn.gstatic.com/images?q=tbn:ANd9GcQkYTFDdtwPBeoytFX2z56g";
    render(
      <MessageItem
        message={{
          ...baseMessage,
          id: "m-preview-3",
          content: `check this ${directImageUrl}`,
        }}
      />,
    );

    await waitFor(() => {
      const previewImage = screen.getByRole("img", { name: "Images" });
      expect(previewImage).toHaveAttribute("src", directImageUrl);
    });
  });

  it("skips preview fetch and card when link previews are disabled", async () => {
    act(() => {
      useSessionStore.setState({ linkPreviewsEnabled: false });
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
    );

    render(
      <MessageItem
        message={{
          ...baseMessage,
          id: "m-preview-4",
          content: "see https://imgbb.com/",
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "https://imgbb.com/" })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).not.toHaveBeenCalled();
    });
    expect(screen.queryByText("ImgBB — Upload Image — Free Image Hosting")).not.toBeInTheDocument();
    act(() => {
      useSessionStore.setState({ linkPreviewsEnabled: true });
    });
  });
});
