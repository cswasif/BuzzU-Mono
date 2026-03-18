# BuzzU Matrix + PQ-Ready E2EE Implementation Plan

## 1) Goal

Design a future-proof end-to-end encryption roadmap for BuzzU that:

- Preserves current low-latency matchmaker + signaling + WebRTC architecture
- Improves real-world E2EE safety now
- Adds a practical post-quantum migration path
- Keeps implementation incremental and testable

This document provides two parallel tracks for later implementation:

- Track A: Matrix-inspired / Matrix-rust-crypto-backed hardening
- Track B: PQ-ready hybrid E2EE over BuzzU’s existing protocol

## 2) Current BuzzU Baseline

### Architecture touchpoints

- Signaling transport: WebSocket + Cloudflare Durable Objects in `apps/signaling-worker/src/lib.rs`
- Browser signaling hooks: `apps/web/src/context/SignalingContext.tsx`, `apps/web/src/hooks/useSignaling.ts`
- Crypto/session logic: `apps/web/src/hooks/useCrypto.ts` and `packages/wasm/src/crypto/*`
- Shared signaling contracts: `packages/shared-contracts/src/index.ts`

### Known constraints

- Existing Signal-like sessions are ephemeral in frontend hook lifecycle
- Signal-related control messages exist (`PublishKeys`, `RequestKeys`, `KeysResponse`, `SignalHandshake`)
- `Encrypted` message envelope and `useEncryptedSignaling` exist but are not fully wired as mandatory path

## 3) GitHub Research Summary

## 3.1 Matrix ecosystem references

- `matrix-org/matrix-js-sdk`
  - Browser E2EE uses Rust crypto WASM (`@matrix-org/matrix-sdk-crypto-wasm`)
  - `initRustCrypto()` and IndexedDB-backed crypto store support are first-class
  - Ref: https://github.com/matrix-org/matrix-js-sdk
  - Ref: https://github.com/matrix-org/matrix-js-sdk/blob/develop/src/rust-crypto/index.ts

- `matrix-org/matrix-rust-sdk` (`matrix-sdk-crypto`)
  - Explicitly documented as no-network-IO E2EE state machine for embedding
  - Ref: https://github.com/matrix-org/matrix-rust-sdk/tree/main/crates/matrix-sdk-crypto

- `matrix-org/matrix-spec` E2EE module
  - Current mainstream Matrix E2EE key algorithms still include Curve25519/Ed25519
  - Ref: https://github.com/matrix-org/matrix-spec/blob/main/content/client-server-api/modules/end_to_end_encryption.md

## 3.2 Post-quantum references

- `signalapp/SparsePostQuantumRatchet`
  - Rust implementation of Signal’s SPQR ratchet, intended as hybrid integration component
  - Not a full messenger protocol by itself; outputs message keys
  - Ref: https://github.com/signalapp/SparsePostQuantumRatchet

- `openmls/openmls`
  - Mature MLS implementation in Rust (RFC 9420)
  - Current supported ciphersuites in README are classical (no explicit PQ suite listed)
  - Ref: https://github.com/openmls/openmls

- `zks-protocol/zks`
  - Interesting R&D project with PQ claims and multiple crates
  - Early-stage profile, self-reported security docs, custom protocol stack
  - Suitable for research inspiration; high risk as direct production dependency
  - Ref: https://github.com/zks-protocol/zks

## 4) Threat Model and Security Targets

### Required properties (BuzzU)

- Confidentiality: only matched peers decrypt chat/control payloads
- Integrity/authentication: tamper detection and sender authenticity
- Forward secrecy: compromise now should not expose previous sessions
- Post-compromise recovery: protocol can recover after short-lived compromise
- Replay resistance and bounded out-of-order tolerance
- Metadata minimization: relay should not see plaintext SDP/ICE/chat

### Out-of-scope guarantees

- No cryptosystem can guarantee absolute “unbreakable forever”
- Endpoint compromise (malware, XSS, rooted device) can still leak plaintext
- Traffic-analysis resistance is limited in direct 1:1 WebRTC + signaling design

## 5) Decision Framework

### Option A: Full Matrix client migration

- Pros: mature ecosystem, device model, strong verification UX patterns
- Cons: large architecture shift, homeserver semantics, sync/device-list complexity
- Decision: not primary path for BuzzU stranger-chat stack

### Option B: Matrix-rust-crypto-inspired embedding without full Matrix client

- Pros: leverage mature Rust crypto design patterns
- Cons: requires adapter layer because matrix-rust-crypto expects Matrix data model
- Decision: feasible but moderate/high integration complexity

### Option C: BuzzU-native protocol with proven PQ/hybrid components

- Pros: preserves architecture, incremental rollout, focused scope
- Cons: higher design burden for protocol correctness and audits
- Decision: best near-term implementation path

## 6) Target Architecture (Recommended)

Hybrid plan:

1. Keep current signaling/matchmaker/WebRTC topology
2. Make encrypted envelope mandatory for sensitive signaling
3. Replace current custom Signal-like session bootstrap with audited key-schedule strategy
4. Add optional PQ layer in key agreement (hybrid classical + PQ)

Protocol shape:

- Session key = KDF(classical_shared_secret || pq_shared_secret || transcript_hash)
- Per-message keys from ratchet chain
- AEAD payloads for all sensitive message types
- Authenticated handshake transcript with explicit key confirmation

## 7) Implementation Roadmap

## Phase 0 — Preflight and Safety Rails (1–2 weeks)

- Freeze protocol schema version and add migration window
- Add crypto feature flags:
  - `E2EE_MANDATORY_ENVELOPE`
  - `E2EE_HYBRID_PQ_ENABLED`
  - `E2EE_REQUIRE_VERIFIED_PEER`
- Add protocol-version field to signaling envelopes in `shared-contracts`
- Define kill-switch rollback plan

Deliverables:

- Versioned signaling contracts
- Feature-flag matrix
- Rollback playbook

## Phase 1 — Mandatory Encrypted Signaling Transport (1–2 weeks)

- Wire `useEncryptedSignaling` as primary path for:
  - `Offer`, `Answer`, `IceCandidate`
  - `Chat`, `Typing`
  - Key exchange control messages
- Keep only routing metadata plaintext (`Join`, `PeerList`, `Leave`, errors)
- Reject plaintext fallback for sensitive types in both client and signaling worker
- Add telemetry counters for plaintext rejection attempts

Deliverables:

- Encrypted signaling mandatory path
- Backward compatibility shim for one release

## Phase 2 — Identity and Session Trust Hardening (2–3 weeks)

- Add TOFU identity pinning (per peer stable identity key fingerprint)
- Warn/block on identity key changes depending on policy
- Persist trust material in IndexedDB with explicit rotation policy
- Add handshake transcript hash verification
- Add replay window + message number monotonic checks

Deliverables:

- Identity trust store
- Key-change handling UX
- Replay/out-of-order guardrails

## Phase 3 — Matrix-Grade Crypto Lifecycle Patterns (2–4 weeks)

Adopt patterns inspired by matrix-js-sdk + matrix-rust-sdk:

- Single crypto instance ownership per browser profile/session
- Durable encrypted local crypto store with explicit initialization
- Strict startup ordering for crypto readiness before message send
- Structured callbacks for key updates and withheld keys equivalent events

Deliverables:

- Stable crypto initialization state machine
- Store encryption key management policy

## Phase 4 — PQ-Ready Hybrid Handshake (3–6 weeks)

- Add hybrid KEM stage:
  - Classical X25519 + PQ KEM secret
  - Combine via HKDF with transcript binding
- Start with optional mode (`PQ-preferred`, fallback classical)
- Add negotiation extension in handshake capabilities
- Reject downgrade attempts when both peers support PQ mode

Deliverables:

- Hybrid key agreement implementation
- Downgrade protection logic
- Capability negotiation tests

## Phase 5 — Ratchet Upgrade and PCS Improvements (4–8 weeks)

Two candidate paths:

- Path 5A: Integrate SPQR-style chunked PQ ratchet ideas with BuzzU transport
- Path 5B: Keep existing ratchet but add periodic hybrid rekey and PCS recovery triggers

Recommendation:

- Start with 5B for lower risk
- Evaluate 5A only after interop + audit budget confirmed

Deliverables:

- Periodic rekey protocol
- Compromise-recovery procedure
- Formalized session reset semantics

## Phase 6 — Security Validation and Rollout (2–4 weeks)

- External crypto design review and code audit
- Fuzzing and property-based testing on parser + state transitions
- MITM simulation, replay simulation, reorder simulation
- Staged rollout:
  - Dev/internal
  - 5% canary
  - 25%
  - 100%

Deliverables:

- Audit report
- Security test evidence pack
- Production rollout signoff

## 8) Detailed Work Breakdown by Repo Area

## 8.1 `packages/shared-contracts`

- Add `protocol_version`, `cipher_suite`, `pq_mode`, `handshake_hash`
- Add explicit `capabilities` object for negotiation
- Add backward-compatible parsing rules and strict validation

## 8.2 `apps/web/src/context/SignalingContext.tsx`

- Enforce sensitive-type plaintext block
- Add protocol version negotiation bootstrap
- Add observability counters for rejected/invalid frames

## 8.3 `apps/web/src/hooks/useSignaling.ts`

- Route all sensitive send methods through encrypted path
- Remove remaining implicit plaintext assumptions
- Integrate per-session anti-replay and duplicate windows

## 8.4 `apps/web/src/hooks/useCrypto.ts`

- Persist identity/trust metadata
- Add hybrid handshake API surface
- Add key rotation and session invalidation semantics

## 8.5 `packages/wasm/src/crypto`

- Add/extend KEM module for hybrid agreement
- Add transcript-binding APIs
- Enforce zeroization and explicit error types

## 8.6 `apps/signaling-worker/src/lib.rs`

- Enforce envelope policy for sensitive message families
- Keep server as opaque relay for encrypted payloads
- Add protocol-version compatibility checks and metrics

## 9) Testing Strategy

## Unit tests

- KDF composition correctness
- Transcript hash stability
- Replay guard correctness
- TOFU pinning and key-change policy

## Integration tests

- End-to-end message exchange across reconnects
- Cross-version compatibility (N/N-1)
- PQ-capable peer + non-PQ peer negotiation
- Downgrade attack attempts

## Adversarial tests

- Active MITM key substitution attempt
- Message reordering bursts
- Duplicate/replay floods
- Corrupted ciphertext and malformed envelopes

## Performance tests

- Handshake latency delta (classical vs hybrid)
- Message throughput and CPU on low-end browsers
- Memory profile for long sessions

## 10) Observability and Operations

- Metrics:
  - Handshake success/failure by reason
  - Decrypt failure rates
  - Replay drop counts
  - Key-change warning counts
  - PQ negotiation success rate
- Logging:
  - No plaintext payload logs
  - No key material logs
  - Structured event IDs for incident correlation
- Alerting:
  - Spike in decrypt failures
  - Spike in downgrade-block events
  - Handshake failure SLO breach

## 11) Risk Register

- Protocol complexity growth
  - Mitigation: strict versioning + phased rollout + audit gates
- Browser performance regression
  - Mitigation: worker offload + benchmark gates
- Interop drift between web/wasm/worker
  - Mitigation: shared test vectors and contract tests
- False confidence in PQ claims
  - Mitigation: explicit “hybrid computational security” wording and independent review

## 12) Recommended Dependency Policy

- Prefer widely reviewed cryptographic crates/libraries with active maintenance
- Avoid production dependence on experimental full protocol stacks unless externally audited
- Pin versions and maintain SBOM for crypto dependencies
- Track upstream advisories and CVEs for selected primitives

## 13) Milestones and Exit Criteria

M1: Encrypted signaling mandatory

- All sensitive signaling types encrypted
- Plaintext sensitive messages rejected

M2: Trust and replay hardening complete

- TOFU pinning enabled
- Replay/out-of-order tests pass

M3: Hybrid PQ negotiation in production canary

- PQ-enabled peers complete hybrid handshake
- Downgrade attacks blocked in tests

M4: Audit-complete full rollout

- External review accepted
- No Sev-1 crypto incidents in canary window

## 14) Practical Recommendation

For BuzzU’s current architecture, implement:

1. Mandatory encrypted signaling and trust hardening immediately
2. Matrix-grade lifecycle/store patterns next
3. PQ hybrid handshake behind feature flag
4. Full ratchet replacement only after stability + audit budget

This sequence gives near-term security improvement without breaking core matchmaking and realtime UX.

