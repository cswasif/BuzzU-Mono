import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { useAutoCleanup } from "../useAutoCleanup";
import { useScreenShareStore } from "../../stores/screenShareStore";

const TestHarness = ({
  enabled,
  closePeerConnection,
  getPeerConnections,
  getConnectionState,
}: {
  enabled: boolean;
  closePeerConnection: (peerId: string) => void;
  getPeerConnections: () => Map<string, RTCPeerConnection>;
  getConnectionState: (peerId: string) => { type: string; timestamp?: number; startTime?: number };
}) => {
  useAutoCleanup({
    enabled,
    activeRoomId: "room-1",
    getPeerConnections,
    getConnectionState,
    closePeerConnection,
    config: {
      monitorIntervalMs: 10,
      minCleanupIntervalMs: 0,
      memorySoftMb: 1,
      memoryHardMb: 2,
    },
  });
  return <div />;
};

describe("useAutoCleanup integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useScreenShareStore.setState({
      isRemoteSharing: true,
      remoteStream: {
        getTracks: () => [{ readyState: "ended" }],
      } as any,
    });
    Object.defineProperty(performance, "memory", {
      configurable: true,
      value: {
        usedJSHeapSize: 1024 * 1024 * 9,
        jsHeapSizeLimit: 1024 * 1024 * 10,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    useScreenShareStore.setState({ isRemoteSharing: false, remoteStream: null });
  });

  it("closes stale peers and clears remote share on pressure", () => {
    const closePeerConnection = vi.fn();
    const pc = { connectionState: "failed" } as RTCPeerConnection;
    const map = new Map<string, RTCPeerConnection>([["peer-1", pc]]);
    const getPeerConnections = () => map;
    const getConnectionState = () => ({
      type: "failed",
      timestamp: Date.now() - 20000,
    });
    render(
      <TestHarness
        enabled
        closePeerConnection={closePeerConnection}
        getPeerConnections={getPeerConnections}
        getConnectionState={getConnectionState}
      />,
    );
    vi.advanceTimersByTime(50);
    expect(closePeerConnection).toHaveBeenCalledWith("peer-1");
    const state = useScreenShareStore.getState();
    expect(state.isRemoteSharing).toBe(false);
  });
});
