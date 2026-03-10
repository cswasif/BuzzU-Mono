# WebRTC Screen Share — Common Bugs & Patterns from Production Projects

> Research compiled from **Jitsi Meet**, **LiveKit client-sdk-js**, **Matrix JS SDK**, and GitHub issues/code searches across hundreds of open-source WebRTC projects.

---

## 1. Track Ended Handler Patterns ("Stop Sharing" Button)

The browser's native "Stop sharing" button calls `MediaStreamTrack.stop()` which fires the `ended` event. Handling this correctly is surprisingly tricky.

### Bug: Track stops before inactive handler fires (Jitsi)

Jitsi's `functions.any.ts` has an explicit comment:
> "Ignore the check for desktop track muted operation. When the screenshare is terminated by clicking on the browser's 'Stop sharing' button, **the local stream is stopped before the inactive stream handler is fired**."

This means if you check `track.readyState` inside the ended handler, it's already `"ended"`, and any async cleanup that depends on the track being alive will fail.

### Pattern A: LiveKit — Emit event, auto-unpublish

```typescript
// LocalTrack.ts
private handleEnded = () => {
  if (this.isInBackground) {
    this.reacquireTrack = true;  // Mobile: mark for re-acquisition on foreground
  }
  this._mediaStreamTrack.removeEventListener('mute', this.handleTrackMuteEvent);
  this._mediaStreamTrack.removeEventListener('unmute', this.handleTrackUnmuteEvent);
  this.emit(TrackEvent.Ended, this);
};

// LocalParticipant.ts — the handler that auto-unpublishes
private handleTrackEnded = async (track: LocalTrack) => {
  if (track.source === Track.Source.ScreenShare || 
      track.source === Track.Source.ScreenShareAudio) {
    // Auto-unpublish when user clicks "Stop sharing"
    await this.unpublishTrack(track);
  }
};
```

**Key insight**: LiveKit explicitly **cannot mute** screen share tracks — the only operation is unpublish. This avoids the entire class of bugs where a muted screenshare is accidentally shown as a black frame.

### Pattern B: Jitsi — Listen on native event, dispatch to state

```typescript
// actions.any.ts (React Native)
mediaStreamTrack.addEventListener('ended', () => {
  dispatch(toggleScreensharing(false));
});

// actions.web.ts — for audio-only screenshare tracks
desktopAudioTrack.on(JitsiTrackEvents.LOCAL_TRACK_STOPPED, () => {
  dispatch(toggleScreensharing(false));
});
```

### Pattern C: Matrix — Listen on MediaStream `removetrack` event (receiver side)

```typescript
// call.ts — onTrack handler
private onTrack = (ev: RTCTrackEvent): void => {
  const stream = ev.streams[0];
  if (!this.removeTrackListeners.has(stream)) {
    const onRemoveTrack = (): void => {
      if (stream.getTracks().length === 0) {
        this.deleteFeedByStream(stream);
        stream.removeEventListener("removetrack", onRemoveTrack);
        this.removeTrackListeners.delete(stream);
      }
    };
    stream.addEventListener("removetrack", onRemoveTrack);
    this.removeTrackListeners.set(stream, onRemoveTrack);
  }
};
```

### Common mistakes to avoid

| Mistake | Consequence |
|---------|-------------|
| Not removing `mute`/`unmute` listeners in `ended` handler | Phantom mute events fire on dead tracks |
| Calling async operations on a stopped track | Silent failures or exceptions |
| Not cleaning up the event listener itself (memory leak) | Listener accumulates on repeated share/stop cycles |
| Relying only on `ended` event for iOS Safari | iOS sometimes doesn't fire `ended` — use `readyState` polling as fallback |
| Not handling mobile backgrounding | Track gets killed by OS, `ended` fires but you want to re-acquire on foreground (see LiveKit's `reacquireTrack` flag) |

---

## 2. Renegotiation Race Conditions

### Bug: Glare — simultaneous offers from both peers

When both peers try to renegotiate at the same time (e.g., both start screen sharing), you get "glare" — both send offers and both are in `have-local-offer` state when the remote offer arrives.

### Pattern: Matrix — Explicit signaling state check + rollback

Matrix's `call.ts` tracks `signalingState` and implements glare resolution by having one side (the "polite" peer) roll back its offer:

```typescript
// If we receive a negotiate while we're in have-local-offer,
// the polite side rolls back and accepts the remote's offer instead
```

Their test suite explicitly tests this:
```typescript
describe("should handle glare in negotiation process", () => { ... });
```

### Pattern: Jitsi — Task queues per track type

Jitsi's `conference.js` uses **separate async task queues** for audio and video track replacement:

```javascript
_replaceLocalAudioTrackQueue  // Audio replacements serialized here
_replaceLocalVideoTrackQueue  // Video replacements serialized here
```

This prevents two operations (e.g., stop screenshare + switch mic device) from racing with each other's SDP negotiation.

### Pattern: LiveKit — Mutex locks everywhere

LiveKit uses `@livekit/mutex` extensively:

```typescript
protected muteLock: Mutex;
protected pauseUpstreamLock: Mutex;
protected trackChangeLock: Mutex;
```

Every operation that touches the sender or negotiation acquires the relevant lock:

```typescript
async replaceTrack(track: MediaStreamTrack, options?: ReplaceTrackOptions) {
  const unlock = await this.trackChangeLock.lock();
  try {
    await this.setMediaStreamTrack(track);
  } finally {
    unlock();
  }
}
```

### Common race condition scenarios

| Scenario | What goes wrong |
|----------|----------------|
| Start screenshare while ICE restart is happening | Offer created in `have-local-offer` → `InvalidStateError` |
| Both peers start screenshare at same time | Glare — both create offers simultaneously |
| Stop screenshare + network reconnect | `removeTrack` triggers renegotiation that races with ICE reconnect offer |
| Multiple rapid toggle on/off | Previous negotiation not complete when next one starts |
| `negotiationneeded` fires multiple times | Creating multiple offers before the first one completes |

### Best practice: Negotiation queue

```typescript
// Pseudocode — serialize all negotiation
const negotiationQueue: Array<() => Promise<void>> = [];
let isNegotiating = false;

pc.onnegotiationneeded = () => {
  negotiationQueue.push(async () => {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignaling({ type: 'offer', sdp: pc.localDescription });
    // Wait for answer...
  });
  processQueue();
};

async function processQueue() {
  if (isNegotiating) return;
  isNegotiating = true;
  while (negotiationQueue.length > 0) {
    await negotiationQueue.shift()!();
  }
  isNegotiating = false;
}
```

---

## 3. `replaceTrack` vs `removeTrack`+`addTrack`

This is the single most impactful architectural decision for screen sharing.

### `replaceTrack()` — No renegotiation needed

**Pros:**
- Instant — no SDP exchange required
- No "flicker" — remote side sees smooth transition from camera to screen
- Reuses existing transceiver

**Cons:**
- Remote peer has **no way to know** the track changed purpose (camera → screenshare)
- Cannot change codec parameters (e.g., switch to higher-res screenshare settings)
- Keeps the same `mid` in SDP, so no metadata change signaled

**Who uses it:**

- **Matrix (fallback mode)**: When opponent doesn't support `SDPStreamMetadata`, Matrix falls back to `replaceTrack`:
  ```typescript
  // setScreensharingEnabledWithoutMetadataSupport()
  const sender = this.transceivers.get(
    getTransceiverKey(SDPStreamMetadataPurpose.Usermedia, "video")
  )?.sender;
  sender?.replaceTrack(track ?? null);
  ```

- **LiveKit (for pause/resume upstream)**: Uses `sender.replaceTrack(null)` to pause sending without renegotiation:
  ```typescript
  async pauseUpstream() {
    await this.sender.replaceTrack(null);  // Stop sending without removing track
  }
  async resumeUpstream() {
    await this.sender.replaceTrack(this.mediaStreamTrack);  // Resume
  }
  ```

### `removeTrack`+`addTrack` (or new transceiver) — Full renegotiation

**Pros:**
- Remote peer sees a new stream/track with metadata
- Can signal purpose change (camera → screenshare) via SDP stream metadata
- Can set different codec preferences for screenshare

**Cons:**
- Triggers `negotiationneeded` → full offer/answer exchange
- Brief interruption while renegotiation completes (possible black frame)
- More complex — must handle negotiation races

**Who uses it:**

- **Matrix (primary mode)**: With `SDPStreamMetadata` support, Matrix adds a new transceiver for screenshare and signals its purpose:
  ```typescript
  // setScreensharingEnabled() — with metadata support
  this.peerConn!.removeTrack(transceiver.sender);  // Remove screenshare
  // triggers negotiation → sends CallNegotiate with sdp_stream_metadata
  ```

- **Jitsi (with a twist)**: Jitsi adds the screenshare track but **mutes** instead of removing to avoid source-remove:
  ```typescript
  // Instead of removing:
  dispatch(setScreenshareMuted(true));  // Mute keeps transceiver alive
  ```

### Hybrid approach (recommended for BuzzU)

```
Initial share:  addTrack()  →  triggers negotiation → remote knows it's screenshare
During share:   replaceTrack()  →  no negotiation → seamless source switches  
Stop share:     replaceTrack(cameraTrack) or removeTrack()  →  depends on architecture
```

### Matrix's transceiver reuse pattern

Matrix tests confirm transceivers are **reused** when re-enabling screen share:
```typescript
it("re-uses transceiver when screen sharing is re-enabled", async () => {
  // Start screenshare → creates transceiver #2
  await call.setScreensharingEnabled(true);
  expect(mockPeerConn.transceivers.length).toEqual(2);
  
  // Stop screenshare → transceiver #2 still exists (inactive)
  await call.setScreensharingEnabled(false);
  expect(mockPeerConn.transceivers.length).toEqual(2);
  
  // Re-start screenshare → reuses transceiver #2!
  await call.setScreensharingEnabled(true);
  expect(mockPeerConn.transceivers.length).toEqual(2);  // NOT 3
});
```

This is important because **you cannot remove a transceiver** from a `RTCPeerConnection`. If you keep creating new ones, the SDP grows forever.

---

## 4. Screen Share Detection on Receiver Side

### The problem

`RTCTrackEvent` gives you a `MediaStreamTrack` with `kind: "video"` — there's nothing in the WebRTC API itself that distinguishes a camera track from a screen share track.

### Pattern A: SDP Stream Metadata (Matrix/MSC3077)

Matrix sends out-of-band metadata mapping `streamId → purpose`:
```typescript
interface SDPStreamMetadata {
  [streamId: string]: {
    purpose: "m.usermedia" | "m.screenshare";
    audio_muted: boolean;
    video_muted: boolean;
  };
}
```

This is sent inside `CallNegotiate` events and `SDPStreamMetadataChanged` events.

### Pattern B: Signaling channel message (LiveKit, most SFU-based)

LiveKit's server tells each client the source of each track via its signaling protocol:
```typescript
enum Source {
  CAMERA = 0,
  MICROPHONE = 1,
  SCREEN_SHARE = 2,
  SCREEN_SHARE_AUDIO = 3,
}
```

### Pattern C: Content hints + `displaySurface` (native API)

```typescript
// Sender side — set content hint for optimization
screenTrack.contentHint = "detail";  // or "text" for text-heavy content

// Sender side — check what was captured
const settings = screenTrack.getSettings();
// settings.displaySurface: "monitor" | "window" | "browser" | "application"
```

However, `contentHint` is only a hint to the encoder — it is **not transmitted to the receiver**. The receiver has no native API way to know.

### Pattern D: Track label heuristic (fragile, don't rely on)

```typescript
// Some implementations check track.label as a heuristic
// Chrome: "screen:0:0" or "window:12345:0" 
// Firefox: "Primary Monitor" etc.
// This is NOT standardized and varies by browser/OS
```

### Recommendation for BuzzU

Since you have a signaling channel, add a message type:
```typescript
{ type: "ScreenShareStarted", peer_id: string, track_id: string }
{ type: "ScreenShareStopped", peer_id: string }
```

---

## 5. Audio Track Handling During Screen Share

### Bug: System audio not captured or lost

`getDisplayMedia({ audio: true })` captures system audio **only on Chromium** (not Firefox/Safari). Even on Chromium, it only works for tab/window sharing, not monitor sharing.

### Pattern: LiveKit — Separate `ScreenShareAudio` source

```typescript
// LocalParticipant.ts
async createScreenTracks(options?: ScreenShareCaptureOptions) {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: options?.audio ?? false,
  });
  
  const tracks: LocalTrack[] = [];
  const videoTrack = new LocalVideoTrack(stream.getVideoTracks()[0], {
    source: Track.Source.ScreenShare,  // Marked as screen share
  });
  tracks.push(videoTrack);
  
  const audioTrack = stream.getAudioTracks()[0];
  if (audioTrack) {
    tracks.push(new LocalAudioTrack(audioTrack, {
      source: Track.Source.ScreenShareAudio,  // Separate source type!
    }));
  }
  return tracks;
}
```

When stopping screen share, LiveKit also unpublishes the audio:
```typescript
// Also unpublish ScreenShareAudio when stopping screen share
if (source === Track.Source.ScreenShare) {
  const audioTrack = this.getTrackPublication(Track.Source.ScreenShareAudio);
  if (audioTrack) {
    await this.unpublishTrack(audioTrack.track);
  }
}
```

### Pattern: Jitsi — Audio mixer effect

Jitsi mixes the microphone audio with the desktop audio using a custom `AudioMixerEffect`:
```typescript
// actions.web.ts
const mixerEffect = new AudioMixerEffect(desktopAudioTrack);
localAudio.setEffect(mixerEffect);
```

This way the existing audio transceiver carries both mic + system audio without needing to add a new audio track (which would require renegotiation).

### Bug: Screen share audio outlives video (Jitsi)

When the user clicks "Stop sharing" on a screenshare that has audio, the **video** track's `ended` event fires, but the **audio** track from the same `getDisplayMedia()` stream may not immediately end:
```typescript
// Jitsi explicitly listens for audio track stopped
desktopAudioTrack.on(JitsiTrackEvents.LOCAL_TRACK_STOPPED, () => {
  dispatch(toggleScreensharing(false));
});
```

### Common audio bugs

| Bug | Root cause |
|-----|-----------|
| No system audio on Firefox/Safari | `getDisplayMedia({ audio: true })` is Chromium-only for system audio |
| Audio continues after screen share stops | Forgot to stop audio tracks when video track ends |
| Echo when sharing tab playing audio | System audio fed back through mic → infinite loop. Need to detect and mute mic or system audio appropriately |
| Audio track not sent to remote | Added audio track but forgot to add it to the peer connection |
| `getDisplayMedia` rejected when `audio: true` on some platforms | Must handle the constraint gracefully — try with audio, fall back without |

---

## 6. Other Common Screen Share Bugs

### 6a. RTX Codec crash (Chromium ↔ Firefox)

Matrix discovered a severe cross-browser bug:
> **Steps**: Chromium calls Firefox → Firefox answers → Firefox starts screen-sharing → Chromium starts screen-sharing → **Call crashes for Chromium** with:
> `RTX codec (PT=97) mapped to PT=96 which is not in the codec list`

Matrix's fix: **Strip RTX codecs from screensharing transceivers**:
```typescript
// call.ts — getRidOfRTXCodecs()
// Removes all video/rtx codecs from screensharing video transceivers
// to prevent cross-browser crashes
```

### 6b. Black screen after network reconnect (Jitsi #15089)

After a network disconnect + reconnect on iOS, the screen share track may be in a "live" state but producing no frames. Remote users see a black screen. The fix is to **restart the screen share** after reconnection rather than reusing the old track.

### 6c. Black screen when 3rd participant joins (Jitsi Docker #1376)

Screen share goes blank when a new participant joins. Root cause: the `capScreenshareBitrate` config setting was capping bitrate too aggressively when more participants required bandwidth splitting.

### 6d. Chromium fires spurious `mute`/`unmute` on screen capture tracks

W3C spec issue #141: Chromium fires `mute` and `unmute` events on screen capture tracks based on **cursor activity** — when the user isn't interacting with the captured surface, Chrome "mutes" the track (stops sending new frames since nothing changed).

LiveKit's mitigation: **5-second debounce** on mute handler:
```typescript
private debouncedTrackMuteHandler = debounce(async () => {
  await this.pauseUpstream();
}, 5000);  // Wait 5s before treating mute as real

private handleTrackUnmuteEvent = async () => {
  this.debouncedTrackMuteHandler.cancel('unmute');  // Cancel if unmute arrives
  await this.resumeUpstream();
};
```

Without this debounce, the track would be marked as "muted" every time the user stopped moving their cursor over the shared screen.

### 6e. `getDisplayMedia` permission prompt blocks the event loop

`getDisplayMedia()` opens a system-level permission dialog. While this dialog is open:
- The page's event loop may be blocked on some browsers
- WebSocket connections can timeout
- Existing peer connections may trigger ICE disconnection

**Mitigation**: Set a generous ICE disconnect timeout, and handle the case where the peer briefly disappears during the `getDisplayMedia` prompt.

### 6f. iOS Safari — `ended` event not reliable

On iOS Safari, the `ended` event on `getDisplayMedia` tracks is not always fired (see Jitsi #14438). The screen share UI may show as active but the track is already dead.

**Mitigation**: Poll `track.readyState` periodically, or use `track.muted` as a secondary signal:
```typescript
const checkInterval = setInterval(() => {
  if (screenTrack.readyState === 'ended') {
    clearInterval(checkInterval);
    handleScreenShareEnded();
  }
}, 1000);
```

### 6g. Safari < 12 — `sender.replaceTrack(null)` crashes

LiveKit explicitly guards against this:
```typescript
async pauseUpstream() {
  const browser = getBrowser();
  if (browser?.name === 'Safari' && compareVersions(browser.version, '12.0') < 0) {
    throw new DeviceUnsupportedError('pauseUpstream is not supported on Safari < 12.');
  }
  await this.sender.replaceTrack(null);
}
```

### 6h. Mobile background kills screen share tracks

When the app goes to background on mobile, the OS may kill the media track. LiveKit handles this elegantly:
```typescript
private handleEnded = () => {
  if (this.isInBackground) {
    this.reacquireTrack = true;  // Don't cleanup, mark for re-acquisition
  }
  // ...
};

protected async handleAppVisibilityChanged() {
  if (!this.isInBackground && this.needsReAcquisition && !this.isUserProvided) {
    await this.restart();  // Re-acquire when returning to foreground
    this.reacquireTrack = false;
  }
}
```

---

## 7. Summary: Recommendations for BuzzU

| Area | Recommendation |
|------|---------------|
| **Track ended handling** | Register `ended` listener immediately after `getDisplayMedia()`. In the handler: remove mute/unmute listeners, update store via `useSessionStore`, signal partner via signaling channel. |
| **Renegotiation** | Use a negotiation queue or mutex. Since BuzzU is P2P with a single partner, the risk is lower, but still serialize `addTrack`/`removeTrack` operations. |
| **replaceTrack vs addTrack** | For simple 1:1, `replaceTrack` is simpler and avoids renegotiation. Signal screen share state through the signaling channel (add `ScreenShareStarted`/`ScreenShareStopped` message types). |
| **Receiver detection** | Add signaling message types. Don't rely on track metadata or labels. |
| **Audio** | Try `getDisplayMedia({ audio: true })` but handle rejection gracefully. Consider mixing with mic audio (Jitsi approach) or sending as separate track (LiveKit approach). |
| **Cross-browser** | Test Chromium ↔ Firefox screen share extensively. Watch out for RTX codec issues. |
| **Mobile** | Handle background/foreground transitions. Poll `track.readyState` on iOS Safari as `ended` event may not fire. |
| **Mute debouncing** | Debounce track `mute` events (5s like LiveKit) to avoid treating Chromium's cursor-activity muting as real muting. |
