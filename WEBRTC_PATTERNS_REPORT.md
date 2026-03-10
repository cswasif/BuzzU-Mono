# WebRTC Production Patterns — Deep Research Report

> Extracted from: **feross/simple-peer**, **jeremyckahn/chitchatter**, **peers/peerjs**, **livekit/components-js**
> *(ianramzy/decentralized-video-chat source was removed — project acquired at 250k users)*

---

## Table of Contents

1. [Connection Resilience](#1-connection-resilience)
2. [Clean State Machines](#2-clean-state-machines)
3. [Memory Leak Prevention](#3-memory-leak-prevention)
4. [TypeScript Type Safety](#4-typescript-type-safety)
5. [Hook Architecture](#5-hook-architecture)
6. [Specific Patterns to Steal for BuzzU](#6-specific-patterns-to-steal-for-buzzu)

---

## 1. Connection Resilience

### 1.1 ICE Candidate Buffering (simple-peer)

The #1 production bug in WebRTC: receiving ICE candidates before the remote description is set. simple-peer solves this definitively:

```js
// simple-peer/index.js
signal(data) {
  if (data.candidate) {
    if (this._pc.remoteDescription && this._pc.remoteDescription.type) {
      this._addIceCandidate(data.candidate)
    } else {
      this._pendingCandidates.push(data.candidate)  // ← QUEUE IT
    }
  }
  if (data.sdp) {
    this._pc.setRemoteDescription(new RTCSessionDescription(data))
      .then(() => {
        // FLUSH the queue after SDP is set
        this._pendingCandidates.forEach(candidate => {
          this._addIceCandidate(candidate)
        })
        this._pendingCandidates = []

        if (this._pc.remoteDescription.type === 'offer') this._createAnswer()
      })
  }
}
```

**BuzzU action**: Your `useWebRTC` currently does NOT buffer candidates. If the signaling worker delivers ICE before the SDP (which Cloudflare Workers can do due to non-deterministic message ordering), you'll silently drop candidates.

### 1.2 Trickle ICE with Timeout Fallback (simple-peer)

simple-peer supports three ICE modes:
- **Trickle** (default): Send candidates as they arrive via `signal` events
- **Non-trickle**: Wait for all candidates, send one signal
- **Half-trickle**: One side trickles, the other doesn't

Critical: even with trickle enabled, there's a timeout:

```js
// simple-peer/index.js
const ICECOMPLETE_TIMEOUT = 5 * 1000

_startIceCompleteTimeout() {
  if (this.destroyed) return
  if (this._iceCompleteTimer) return
  this._iceCompleteTimer = setTimeout(() => {
    if (!this._iceComplete) {
      this._iceComplete = true
      this.emit('iceTimeout')
      this.emit('_iceComplete')
    }
  }, this.iceCompleteTimeout)
}
```

**BuzzU action**: Add an ICE complete timeout. If you wait forever for all candidates and one never arrives (mobile network switch), you're stuck.

### 1.3 Negotiation Queueing (simple-peer)

Concurrent renegotiations crash Chrome. simple-peer queues them:

```js
negotiate() {
  if (this.initiator) {
    if (this._isNegotiating) {
      this._queuedNegotiation = true     // ← QUEUE, don't fire
    } else {
      setTimeout(() => {                   // ← Chrome crash prevention
        this._createOffer()
      }, 0)
    }
  } else {
    // Non-initiator requests renegotiation via signaling
    this.emit('signal', { type: 'renegotiate', renegotiate: true })
  }
  this._isNegotiating = true
}

_onSignalingStateChange() {
  if (this._pc.signalingState === 'stable') {
    this._isNegotiating = false
    
    // Flush Firefox sender removal queue
    this._sendersAwaitingStable.forEach(sender => {
      this._pc.removeTrack(sender)
      this._queuedNegotiation = true
    })
    this._sendersAwaitingStable = []
    
    if (this._queuedNegotiation) {
      this._queuedNegotiation = false
      this._needsNegotiation()   // ← Fire the queued one
    }
  }
}
```

**Key insights**:
- Chrome crashes with `setTimeout(createOffer, 0)` workaround
- Firefox can't remove tracks unless `signalingState === 'stable'` — needs `_sendersAwaitingStable` queue
- Non-initiator peers request renegotiation via signaling (they can't create offers)

### 1.4 WebSocket Heartbeat (PeerJS)

PeerJS's signaling socket sends heartbeats every 5 seconds:

```ts
// peerjs/lib/socket.ts
private _scheduleHeartbeat(): void {
  this._wsPingTimer = setTimeout(() => {
    this._sendHeartbeat()
  }, this.pingInterval)  // default 5000ms
}

// Also has message queueing for when socket is reconnecting:
private _messagesQueue: Array<object> = []
private _sendQueuedMessages(): void {
  const copiedQueue = [...this._messagesQueue]
  this._messagesQueue = []
  for (const message of copiedQueue) {
    this.send(message)
  }
}
```

**BuzzU action**: Your `SignalingContext` doesn't have heartbeats. Cloudflare Durable Objects close idle WebSockets after ~30 seconds. You need ping/pong.

### 1.5 Reconnection Without Destroying Connections (PeerJS)

PeerJS separates signaling disconnect from P2P disconnect:

```ts
// peerjs/lib/peer.ts - Three distinct states
_destroyed: boolean   // permanent - can never reconnect
_disconnected: boolean // signaling lost - P2P survives!
_open: boolean         // signaling connected

reconnect(): void {
  if (this._disconnected && !this._destroyed) {
    // Reconnect to signaling server with same ID
    // All existing RTCPeerConnections stay alive
    this._initialize(this._lastServerId)
  }
}
```

**BuzzU action**: When your signaling WebSocket drops (network blip), don't destroy the RTCPeerConnection. It may still be connected peer-to-peer. Only destroy the WebRTC connection if the data channel or ICE connection actually fails.

### 1.6 Stream Queue with Race Prevention (Chitchatter)

Chitchatter's PeerRoom has a queue with a 1000ms delay between `addStream` calls:

```ts
// chitchatter/src/lib/PeerRoom/PeerRoom.ts
private streamQueue: (() => void)[] = []

addStream(stream: MediaStream, peerId?: string, type?: PeerStreamType) {
  this.streamQueue.push(() => {
    this.room?.addStream(stream, peerId, type)
  })
  this.processStreamQueue()
}

private async processStreamQueue() {
  if (this.isProcessingStreamQueue) return
  this.isProcessingStreamQueue = true
  while (this.streamQueue.length > 0) {
    const fn = this.streamQueue.shift()!
    fn()
    await new Promise(r => setTimeout(r, 1000))  // ← prevent metadata race
  }
  this.isProcessingStreamQueue = false
}
```

### 1.7 TURN Fallback Detection (PeerJS)

PeerJS detects whether a connection is relayed:

```ts
// Check getStats for relay candidate
getStats() => items.forEach(item => {
  if (item.type === 'candidate-pair' && item.state === 'succeeded') {
    if (item.candidateType === 'relay') {
      // Connection is going through TURN
    }
  }
})
```

### 1.8 Connection Throttling (Chitchatter)

Exponential backoff to prevent rapid reconnection storms:

```ts
// chitchatter/hooks/useThrottledRoomMount.ts
const baseBackoff = 2000
const backoffMultiplier = 2
const backoffResetPeriod = 5000

// Uses sessionStorage to persist backoff across component remounts
// Doubles delay each time, resets after 5s of stability
```

---

## 2. Clean State Machines

### 2.1 Dual-Flag Ready Check (simple-peer)

simple-peer doesn't use a state enum. Instead it uses a "both-must-be-true" pattern:

```js
_maybeReady() {
  // BOTH must be true before we're "connected"
  if (this._connected || this._connecting || !this._pcReady || !this._channelReady) return
  
  this._connecting = true
  
  // Then verify via getStats that we actually have a candidate pair
  const findCandidatePair = () => {
    if (this.destroyed) return
    this.getStats((err, items) => {
      if (this.destroyed) return  // ← Re-check after async
      
      // Parse candidates, find the selected pair
      if (!foundSelectedCandidatePair) {
        setTimeout(findCandidatePair, 100)  // ← Retry polling
        return
      }
      
      this._connecting = false
      this._connected = true
      this.emit('connect')
    })
  }
  findCandidatePair()
}
```

**State flags**:
| Flag | Meaning |
|------|---------|
| `destroyed` | Permanently dead, cannot recover |
| `destroying` | In the process of dying (async) |
| `_connected` | Fully connected and verified |
| `_connecting` | Verifying candidate pair |
| `_pcReady` | ICE connected/completed |
| `_channelReady` | Data channel is open |
| `_iceComplete` | ICE gathering done |
| `_isNegotiating` | SDP exchange in progress |

### 2.2 ICE State Handling (simple-peer vs PeerJS)

simple-peer (aggressive — destroys on failure):
```js
_onIceStateChange() {
  if (iceConnectionState === 'connected' || iceConnectionState === 'completed') {
    this._pcReady = true
    this._maybeReady()
  }
  if (iceConnectionState === 'failed') {
    this.destroy(errCode(new Error('Ice connection failed.'), 'ERR_ICE_CONNECTION_FAILURE'))
  }
  if (iceConnectionState === 'closed') {
    this.destroy(errCode(new Error('Ice connection closed.'), 'ERR_ICE_CONNECTION_CLOSED'))
  }
  // NOTE: 'disconnected' is NOT handled — it's often transient
}
```

PeerJS (more conservative):
```ts
// Negotiator
if (iceConnectionState === 'failed') { emitError + close }
if (iceConnectionState === 'closed') { emitError + close }
if (iceConnectionState === 'disconnected') { /* LOG ONLY since v1.3.0 */ }
```

**Key lesson**: `disconnected` is transient — do NOT destroy. `failed` and `closed` are terminal.

### 2.3 Discriminated Union Connection State (LiveKit)

LiveKit uses TypeScript discriminated unions for compile-time state safety:

```ts
// livekit/components-js — useSession types
type SessionStateConnecting = SessionStateCommon & {
  connectionState: ConnectionState.Connecting;
  isConnected: false;
  local: {
    cameraTrack: undefined;
    microphoneTrack: undefined;
    screenShareTrack: undefined;
  };
};

type SessionStateConnected = SessionStateCommon & {
  connectionState: ConnectionState.Connected | ConnectionState.Reconnecting | ConnectionState.SignalReconnecting;
  isConnected: true;
  local: {
    cameraTrack?: TrackReference;
    microphoneTrack?: TrackReference;
    screenShareTrack?: TrackReference;
  };
};

type SessionStateDisconnected = SessionStateCommon & {
  connectionState: ConnectionState.Disconnected;
  isConnected: false;
  local: {
    cameraTrack: undefined;
    microphoneTrack: undefined;
    screenShareTrack: undefined;
  };
};

// Usage — compiler enforces you handle all states:
switch (roomConnectionState) {
  case ConnectionState.Connecting: return { ...common, connectionState, isConnected: false, local: { cameraTrack: undefined, ... } }
  case ConnectionState.Connected:  return { ...common, connectionState, isConnected: true,  local: { cameraTrack: localCamera, ... } }
  case ConnectionState.Disconnected: return { ...common, connectionState, isConnected: false, local: { cameraTrack: undefined, ... } }
}
```

**BuzzU action**: Replace your `connectionStatus: string` with a discriminated union. The compiler will catch every place you forgot to handle a state.

### 2.4 Agent State Machine (LiveKit)

LiveKit's `useAgent` has the most sophisticated state machine in any of these repos:

```ts
type AgentState = 
  | 'disconnected' 
  | 'connecting' 
  | 'initializing' 
  | 'idle' 
  | 'pre-connect-buffering' 
  | 'listening' 
  | 'thinking' 
  | 'speaking'

// Each state has derived boolean properties:
function generateDerivedStateValues(state: AgentState) {
  return {
    isConnected: ['listening', 'thinking', 'speaking', 'pre-connect-buffering', 'idle', 'initializing'].includes(state),
    canListen: ['listening', 'thinking', 'speaking', 'pre-connect-buffering'].includes(state),
    isFinished: state === 'disconnected',
    isPending: ['connecting', 'initializing'].includes(state),
  }
}
```

---

## 3. Memory Leak Prevention

### 3.1 The Gold Standard: simple-peer's _destroy() (simple-peer)

This is the most thorough cleanup in any WebRTC library:

```js
_destroy(err, cb) {
  if (this.destroyed || this.destroying) return  // ← Idempotent guard
  this.destroying = true

  queueMicrotask(() => {  // ← Allow concurrent events to fire first
    this.destroyed = true
    this.destroying = false

    // 1. Reset all state
    this.readable = this.writable = false
    if (!this._readableState.ended) this.push(null)
    if (!this._writableState.finished) this.end()
    this._connected = false
    this._pcReady = false
    this._channelReady = false
    
    // 2. Null all collection references
    this._remoteTracks = null
    this._remoteStreams = null
    this._senderMap = null

    // 3. Clear ALL timers
    clearInterval(this._closingInterval)
    this._closingInterval = null
    clearInterval(this._interval)
    this._interval = null
    
    // 4. Remove all listeners
    if (this._onFinishBound) this.removeListener('finish', this._onFinishBound)
    this._onFinishBound = null

    // 5. Close and null data channel + all its handlers
    if (this._channel) {
      try { this._channel.close() } catch (err) {}
      this._channel.onmessage = null
      this._channel.onopen = null
      this._channel.onclose = null
      this._channel.onerror = null
    }
    
    // 6. Close and null peer connection + all its handlers
    if (this._pc) {
      try { this._pc.close() } catch (err) {}
      this._pc.oniceconnectionstatechange = null
      this._pc.onicegatheringstatechange = null
      this._pc.onsignalingstatechange = null
      this._pc.onicecandidate = null
      this._pc.ontrack = null
      this._pc.ondatachannel = null
    }
    this._pc = null
    this._channel = null

    // 7. Emit error (if any) then close
    if (err) this.emit('error', err)
    this.emit('close')
    cb()
  })
}
```

**Critical pattern**: The `queueMicrotask` wrapper allows events that are concurrent with destruction (e.g., `oniceconnectionstatechange` firing at the same time as `destroy()`) to complete before we null their handlers. Without this, you get `TypeError: Cannot read properties of null`.

**BuzzU action**: Your current cleanup is incomplete. You need to:
1. Null every handler on both `RTCPeerConnection` and `RTCDataChannel`
2. Clear every interval/timeout
3. Use try-catch around `.close()` calls (they throw if already closed)
4. Null the references themselves to allow GC
5. Guard every callback with `if (this.destroyed) return`

### 3.2 Destroyed Guard Pattern (simple-peer)

Every single async callback in simple-peer starts with:

```js
if (this.destroyed) return
```

This appears in: `_createOffer`, `_createAnswer`, `_maybeReady`, `_onIceStateChange`, `_onChannelMessage`, `_onChannelOpen`, `_onChannelClose`, `_onTrack`, `signal`, `_startIceCompleteTimeout`, and inside every `.then()` callback.

**BuzzU action**: Add `if (this.destroyed) return` to every callback in `useWebRTC`. You're getting stale closure bugs because callbacks fire after cleanup.

### 3.3 Data Channel Closing Detection (simple-peer)

Chrome has a bug where there's no `onclosing` event. simple-peer polls:

```js
_setupData(event) {
  // ... 
  let isClosing = false
  this._closingInterval = setInterval(() => {
    if (this._channel && this._channel.readyState === 'closing') {
      if (isClosing) this._onChannelClose()  // ← Second check = timed out
      isClosing = true
    } else {
      isClosing = false
    }
  }, CHANNEL_CLOSING_TIMEOUT)  // 5000ms
}
```

### 3.4 Observable Subscription Cleanup (LiveKit)

Every hook in LiveKit that creates a subscription cleans it up:

```ts
// Pattern used in EVERY LiveKit hook
React.useEffect(() => {
  const subscription = someObservable.subscribe(setState)
  return () => subscription.unsubscribe()  // ← Always
}, [dependency])
```

```ts
// Event-based variant:
React.useEffect(() => {
  const handler = (state: ConnectionState) => setState(state)
  room.on(RoomEvent.ConnectionStateChanged, handler)
  return () => {
    room.off(RoomEvent.ConnectionStateChanged, handler)  // ← Always
  }
}, [room])
```

### 3.5 Room Disconnect on Unmount (LiveKit)

```ts
// useLiveKitRoom
React.useEffect(() => {
  if (!room) return
  return () => {
    log.info('disconnecting on unmount')
    room.disconnect()
  }
}, [room])
```

### 3.6 Chitchatter Flush Pattern

```ts
// PeerRoom.flush() — called before leaving
flush() {
  this.peerHandlerMap.clear()     // Clear all handler Maps
  this.streamQueue = []            // Clear pending streams
  this.isProcessingStreamQueue = false
}
```

---

## 4. TypeScript Type Safety

### 4.1 Typed Error Codes (simple-peer + PeerJS)

simple-peer uses string error codes:
```js
this.destroy(errCode(new Error('Ice connection failed.'), 'ERR_ICE_CONNECTION_FAILURE'))
// Errors: ERR_DESTROYED, ERR_ICE_CONNECTION_FAILURE, ERR_ICE_CONNECTION_CLOSED,
//         ERR_DATA_CHANNEL, ERR_SIGNALING, ERR_SET_REMOTE_DESCRIPTION,
//         ERR_SET_LOCAL_DESCRIPTION, ERR_CREATE_OFFER, ERR_CREATE_ANSWER,
//         ERR_ADD_ICE_CANDIDATE, ERR_PC_CONSTRUCTOR, ERR_WEBRTC_SUPPORT,
//         ERR_ADD_TRANSCEIVER, ERR_REMOVE_TRACK, ERR_CONNECTION_FAILURE
```

PeerJS uses an enum:
```ts
enum PeerErrorType {
  BrowserIncompatible = "browser-incompatible",
  Disconnected = "disconnected",
  InvalidID = "invalid-id",
  Network = "network",
  PeerUnavailable = "peer-unavailable",
  SocketError = "socket-error",
  SocketClosed = "socket-closed",
  UnavailableID = "unavailable-id",
  WebRTC = "webrtc",
}
```

**BuzzU action**: Create a `WebRTCError` enum with typed error codes. Currently your errors are unstructured strings.

### 4.2 Generic Action Pattern (Chitchatter)

```ts
// Chitchatter — type-safe peer actions
interface DataPayload { /* serializable */ }

function usePeerAction<T extends DataPayload>({
  peerRoom,
  peerAction,
  onReceive,
  namespace,
}: {
  peerRoom: PeerRoom
  peerAction: PeerHookType
  onReceive: (data: T, peerId: string) => void
  namespace: string
}): [ActionSender<T>, ActionProgress] {
  const [sender, receiver, progress] = useState(() =>
    peerRoom.makeAction<T>(peerAction, namespace)
  )
  
  useEffect(() => {
    receiver(onReceive)
    return () => { /* disconnect */ }
  }, [receiver, onReceive])
  
  return [sender, progress]
}
```

**BuzzU action**: Your signaling messages are typed but the data channel messages aren't. Create a generic `useDataChannelAction<T>` hook.

### 4.3 Ensure-or-Error Context Pattern (LiveKit)

```ts
// LiveKit — guaranteed context or crash with useful message
export function useEnsureParticipant(participant?: Participant) {
  const context = useMaybeParticipantContext()
  const trackContext = useMaybeTrackRefContext()
  const p = participant ?? context ?? trackContext?.participant
  if (!p) {
    throw new Error(
      'No participant provided, make sure you are inside a participant context or pass the participant explicitly'
    )
  }
  return p
}

// Three-tier pattern:
// 1. useMaybeXContext()    → T | undefined (never throws)
// 2. useXContext()         → T (throws if missing)
// 3. useEnsureX(value?)   → T (uses param OR context, throws if both missing)
```

**BuzzU action**: Your `useSignaling()` returns undefined without helpful errors. Adopt the `useEnsure*` pattern.

### 4.4 Discriminated Union State (LiveKit)

Already covered in section 2.3, but the TypeScript benefit is critical:

```ts
// The compiler KNOWS that when connectionState is 'connected',
// tracks are TrackReference (not undefined)
if (state.isConnected) {
  // state.local.cameraTrack is TrackReference here, not undefined
  // TypeScript narrowing works because isConnected: true only exists 
  // on SessionStateConnected
}
```

### 4.5 updateOnlyOn Performance Typing (LiveKit)

```ts
interface UseRemoteParticipantsOptions {
  updateOnlyOn?: RoomEvent[]  // ← Only re-render on these events
  room?: Room
}

// Usage: skip expensive re-renders
const participants = useRemoteParticipants({
  updateOnlyOn: [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected]
})
```

---

## 5. Hook Architecture

### 5.1 The Observable-to-State Bridge (LiveKit) ⭐ Gold Standard

LiveKit's entire hook layer is built on ONE internal hook:

```ts
// packages/react/src/hooks/internal/useObservableState.ts
function useObservableState<T>(observable: Observable<T> | undefined, initialValue: T): T {
  const [state, setState] = React.useState(initialValue)
  
  React.useEffect(() => {
    if (!observable) return
    const subscription = observable.subscribe(setState)
    return () => subscription.unsubscribe()
  }, [observable])
  
  return state
}
```

Then every hook becomes trivial:
```ts
// useConnectionState — 5 lines of actual logic
function useConnectionState(room?: Room) {
  const r = useEnsureRoom(room)
  const observable = React.useMemo(() => connectionStateObserver(r), [r])
  return useObservableState(observable, r.state)
}

// useParticipantInfo
function useParticipantInfo(props = {}) {
  const p = useMaybeParticipantContext() ?? props.participant
  const infoObserver = React.useMemo(() => participantInfoObserver(p), [p])
  return useObservableState(infoObserver, { name: p?.name, identity: p?.identity, metadata: p?.metadata })
}

// useSpeakingParticipants
function useSpeakingParticipants(options?) {
  const room = useEnsureRoom(options?.room)
  const speakerObserver = React.useMemo(() => activeSpeakerObserver(room), [room])
  return useObservableState(speakerObserver, room.activeSpeakers)
}
```

**BuzzU action**: This is the pattern to adopt. Create a `useObservableState` and push all WebRTC state through observables. Your hooks become 5-line wrappers. No more refs-everywhere.

### 5.2 Core/React Separation (LiveKit)

LiveKit splits into two packages:
- `@livekit/components-core` — framework-agnostic observables, setup functions, helper functions
- `@livekit/components-react` — thin React wrappers around core

```ts
// CORE (no React imports):
export function setupMediaTrack(trackIdentifier: TrackIdentifier) {
  const trackObserver = observeParticipantMedia(trackIdentifier.participant).pipe(
    map(() => getTrackByIdentifier(trackIdentifier)),
    startWith(initialPub),
  )
  return { className, trackObserver }
}

// REACT (thin wrapper):
function useMediaTrackBySourceOrName(observerOptions, options = {}) {
  const { className, trackObserver } = React.useMemo(
    () => setupMediaTrack(observerOptions),
    [observerOptions.participant.sid, observerOptions.source]
  )
  // ... subscribe trackObserver to state
}
```

### 5.3 PeerRoom Abstraction (Chitchatter)

Chitchatter wraps the P2P library (Trystero) in a class that hooks consume:

```ts
// PeerRoom — handler Maps keyed by enum
enum PeerHookType { NEW_PEER, AUDIO, VIDEO, SCREEN, FILE_SHARE, MESSAGE, ... }

class PeerRoom {
  private peerHandlerMap = new Map<PeerHookType, Function[]>()
  
  makeAction<T>(hookType: PeerHookType, namespace: string) {
    const [sender, receiver, progress, disconnector] = this.room.makeAction<T>(namespace)
    this.peerHandlerMap.get(hookType)?.push(disconnector)
    return [sender, receiver, progress, disconnector]
  }
  
  flush() {
    this.peerHandlerMap.forEach(handlers => {
      handlers.forEach(disconnect => disconnect())
    })
    this.peerHandlerMap.clear()
  }
}
```

Then consumed by hooks:
```ts
// usePeerAction — generic, reusable
function usePeerAction<T>({ peerRoom, peerAction, onReceive, namespace }) {
  const [sender, receiver, progress] = useState(() =>
    peerRoom.makeAction<T>(peerAction, namespace)
  )
  useEffect(() => {
    receiver(onReceive)
    return () => { /* cleanup via PeerRoom's flush */ }
  }, [receiver, onReceive])
  return [sender, progress]
}
```

### 5.4 Composable Mega-Hooks (Chitchatter)

Chitchatter's `useRoom` is a ~600-line hook that composes smaller hooks:

```ts
function useRoom(peerRoom: PeerRoom, userId: string) {
  // Compose smaller actions
  const [sendMessage] = usePeerAction<ChatMessage>({ peerRoom, peerAction: PeerHookType.MESSAGE, ... })
  const [sendTyping]  = usePeerAction<TypingStatus>({ peerRoom, peerAction: PeerHookType.TYPING, ... })
  const [sendMeta]    = usePeerAction<PeerMetadata>({ peerRoom, peerAction: PeerHookType.META, ... })
  
  // Room lifecycle
  useEffect(() => {
    return () => {
      peerRoom.leaveRoom()
      // clear peerList
      // clear messageLog
    }
  }, [peerRoom])
  
  return { sendMessage, sendTyping, messageLog, peerList, ... }
}
```

### 5.5 Wait-Until Promise Pattern (LiveKit)

LiveKit has a reusable pattern for "wait until state X":

```ts
function useSessionWaitUntilConnectionState(emitter, connectionState) {
  const connectionStateRef = React.useRef(connectionState)
  React.useEffect(() => {
    connectionStateRef.current = connectionState
  }, [connectionState])

  return React.useCallback(
    async (targetState, signal?: AbortSignal) => {
      // Already in target state? Resolve immediately
      if (connectionStateRef.current === targetState) return

      return new Promise<void>((resolve, reject) => {
        const onStateChanged = (newState) => {
          if (newState !== targetState) return
          cleanup()
          resolve()
        }
        const abortHandler = () => {
          cleanup()
          reject(new Error('signal aborted'))
        }
        const cleanup = () => {
          emitter.off(SessionEvent.ConnectionStateChanged, onStateChanged)
          signal?.removeEventListener('abort', abortHandler)
        }
        
        emitter.on(SessionEvent.ConnectionStateChanged, onStateChanged)
        signal?.addEventListener('abort', abortHandler)
      })
    },
    [emitter]
  )
}

// Usage:
await session.waitUntilConnected(abortController.signal)
```

### 5.6 Backpressure Management (simple-peer)

```js
const MAX_BUFFERED_AMOUNT = 64 * 1024  // 64KB

_write(chunk, encoding, cb) {
  if (this._connected) {
    this.send(chunk)
    if (this._channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      // Stop writing — store callback for later
      this._cb = cb  // ← Backpressure signal
    } else {
      cb(null)  // ← Ready for more
    }
  } else {
    // Pre-connect: store chunk for later
    this._chunk = chunk
    this._cb = cb
  }
}

_onChannelBufferedAmountLow() {
  // Resume writing
  const cb = this._cb
  this._cb = null
  cb(null)
}

// Fallback for browsers without bufferedAmountLowThreshold:
if (typeof this._channel.bufferedAmountLowThreshold !== 'number') {
  this._interval = setInterval(() => this._onInterval(), 150)
}
```

---

## 6. Specific Patterns to Steal for BuzzU

### Priority 1: ICE Candidate Queue

```ts
// Add to useWebRTC
const pendingCandidates = useRef<RTCIceCandidateInit[]>([])

function handleSignalingMessage(msg: SignalingMessage) {
  if (msg.type === 'IceCandidate') {
    if (pc.current?.remoteDescription?.type) {
      pc.current.addIceCandidate(msg.candidate)
    } else {
      pendingCandidates.current.push(msg.candidate)  // ← Buffer
    }
  }
  if (msg.type === 'Answer' || msg.type === 'Offer') {
    await pc.current.setRemoteDescription(msg.sdp)
    // Flush buffered candidates
    for (const candidate of pendingCandidates.current) {
      await pc.current.addIceCandidate(candidate)
    }
    pendingCandidates.current = []
  }
}
```

### Priority 2: Heartbeat for Durable Object WebSocket

```ts
// Add to SignalingContext
const HEARTBEAT_INTERVAL = 25_000  // Under CF's 30s idle timeout

useEffect(() => {
  if (!ws) return
  const timer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'Ping' }))
    }
  }, HEARTBEAT_INTERVAL)
  return () => clearInterval(timer)
}, [ws])
```

### Priority 3: Discriminated Union Connection State

```ts
type WebRTCState =
  | { status: 'idle' }
  | { status: 'connecting'; pc: RTCPeerConnection }
  | { status: 'connected'; pc: RTCPeerConnection; dc: RTCDataChannel; isRelay: boolean }
  | { status: 'reconnecting'; pc: RTCPeerConnection; previousDc: RTCDataChannel | null }
  | { status: 'failed'; error: WebRTCError; code: WebRTCErrorCode }
  | { status: 'closed' }

enum WebRTCErrorCode {
  ICE_FAILURE = 'ERR_ICE_FAILURE',
  SIGNALING_TIMEOUT = 'ERR_SIGNALING_TIMEOUT',
  DATA_CHANNEL_ERROR = 'ERR_DATA_CHANNEL',
  NEGOTIATION_FAILURE = 'ERR_NEGOTIATION',
  BROWSER_UNSUPPORTED = 'ERR_BROWSER',
}
```

### Priority 4: Thorough Cleanup Function

```ts
function destroyPeerConnection(pc: RTCPeerConnection | null, dc: RTCDataChannel | null) {
  if (dc) {
    try { dc.close() } catch {}
    dc.onmessage = null
    dc.onopen = null
    dc.onclose = null
    dc.onerror = null
  }
  if (pc) {
    try { pc.close() } catch {}
    pc.oniceconnectionstatechange = null
    pc.onicegatheringstatechange = null
    pc.onsignalingstatechange = null
    pc.onconnectionstatechange = null
    pc.onicecandidate = null
    pc.ontrack = null
    pc.ondatachannel = null
    pc.onnegotiationneeded = null
  }
}
```

### Priority 5: useObservableState Bridge

```ts
// Adapt for BuzzU (no RxJS needed — use a simple event target)
function useObservableState<T>(
  subscribe: (cb: (val: T) => void) => () => void,
  initialValue: T,
): T {
  const [state, setState] = useState(initialValue)
  useEffect(() => {
    const unsubscribe = subscribe(setState)
    return unsubscribe
  }, [subscribe])
  return state
}
```

---

## Summary: What Each Repo Does Best

| Repo | Strength | Steal This |
|------|----------|------------|
| **simple-peer** | Bulletproof cleanup, negotiation queueing, ICE buffering | `_destroy()` pattern, `_pendingCandidates`, negotiation queue |
| **chitchatter** | Action system, throttled reconnection, stream queueing | `usePeerAction<T>`, `PeerRoom` class, exponential backoff |
| **peerjs** | Reconnection without P2P loss, heartbeat, buffer management | Signaling/P2P separation, `Socket._scheduleHeartbeat`, `BufferedConnection` |
| **livekit/components-js** | Observable-to-state bridge, discriminated unions, useEnsure pattern | `useObservableState`, discriminated connection state, `useEnsure*` |

---

*Generated for BuzzU — a decentralized anonymous video/text chat platform using Cloudflare Workers for signaling.*
