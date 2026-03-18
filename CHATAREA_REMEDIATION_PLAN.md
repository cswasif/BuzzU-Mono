# ChatArea Remediation Plan

## Scope

- Primary file: `apps/web/src/components/Chat/ChatArea.tsx`
- Related files:
  - `apps/web/src/components/Chat/VideoChatArea.tsx`
  - `apps/web/src/hooks/useSignaling.ts`
  - `apps/web/src/context/SignalingContext.tsx`
  - `apps/signaling-worker/src/lib.rs`

## Objectives

- Eliminate security and behavior inconsistencies in chat encryption and skip/reconnect flows.
- Reduce race conditions and timer-related ghost behavior.
- Improve lifecycle safety and type safety.
- Add regression tests that lock behavior and prevent recurrence.

## External Benchmarks (GitHub MCP)

- matrix-org/matrix-js-sdk
  - `src/models/typed-event-emitter.ts`
  - `src/client.ts` (`usingExternalCrypto` option documents explicit encryption expectations)
- signalapp/Signal-Desktop
  - project-level strong typing and fail-safe messaging posture for secure chat surfaces
- mattermost/mattermost-webapp
  - clear websocket client boundaries and event-driven architecture patterns

## Priority Plan

### P0 — Security and Behavioral Consistency

1. Enforce one encryption policy across chat surfaces:
   - Remove plaintext fallback in `VideoChatArea`.
   - Keep fail-closed behavior where encryption is expected.
2. Align user feedback for encryption failure:
   - Show clear local system message.
   - Do not transmit plaintext when encrypted mode is expected.

**Deliverables**
- Unified send-path behavior in `ChatArea` and `VideoChatArea`.
- Tests proving encrypted-required mode never sends plaintext.

### P1 — Lifecycle and Race Condition Hardening

1. Replace untracked `setTimeout` usage with tracked timers or utility wrapper.
2. Ensure all timer refs are cleared in:
   - unmount cleanup
   - skip/stop transitions
   - reconnection cancellation paths
3. Remove fragile dependency suppressions where possible by extracting stable callbacks.

**Deliverables**
- Timer lifecycle map and cleaned implementation.
- Effects with explicit dependencies or extracted stable handlers.

### P2 — API and Type Safety

1. Refactor `useSignaling` callback registration from `any` setters to typed subscription APIs.
2. Replace critical `as any` usage in key exchange and messaging payload pathways.
3. Normalize explicit broadcast semantics (`"all"` constant) instead of empty-string conventions in app code.

**Deliverables**
- Typed callback contracts.
- Reduced unsafe casts in critical paths.
- Clear target semantics for direct-connect broadcasts.

### P3 — Maintainability and Data Hygiene

1. Break `ChatArea` into focused modules/hooks:
   - skip + leave controller
   - encryption/key-exchange controller
   - media/session persistence controller
2. Revisit session cache policy:
   - retention limits
   - media persistence behavior
   - optional privacy mode that disables local persistence

**Deliverables**
- Smaller, cohesive units with clearer ownership.
- Safer and more explicit cache policy.

## Testing Requirements

### Unit Tests

- Encryption:
  - verify no plaintext send when encryption-required mode is active.
  - verify local failure messages on encryption failure.
- Skip/Leave:
  - verify partner exits active chat on skip signal and on leave fallback timeout.
  - verify no duplicate skip transitions.
- Timers:
  - fake-timer tests for cleanup on unmount/stop/skip/reconnect transitions.

### Integration Tests

- Dual-peer scenario tests:
  - skip-confirm during active session
  - partner disconnect + rejoin race
  - delayed/missed skip message fallback path
- Direct-connect room behavior:
  - typing/profile broadcast semantics to all peers.

### Static and Quality Gates

- `npm run lint`
- Targeted Vitest suites for signaling/chat/session flows.
- Add assertions around event listener cleanup and timer leak prevention.

## Rollout Strategy

1. Land P0 first behind no behavior flag (immediate security consistency).
2. Land P1 in small PRs per subsystem (timers, effect dependencies, skip/reconnect).
3. Land P2 typing refactor with adapter shims to reduce blast radius.
4. Land P3 modularization incrementally; keep parity tests green between each extraction.

## Exit Criteria

- No plaintext fallback in encryption-required flows.
- Skip/leave behavior deterministic for both peers across packet delay/loss.
- No dangling timers or post-unmount state writes in tested flows.
- Critical signaling/chat paths free of `any`-based runtime ambiguity.
- All quality gates and regression suites pass.
