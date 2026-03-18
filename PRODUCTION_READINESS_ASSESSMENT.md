# BuzzU Signalling + Matchmaker Production Readiness Assessment

**Date:** 2026-03-14  
**Scope:** `apps/signaling-worker` and `apps/matchmaker-worker`  
**Method:** Static code review, architectural risk analysis, and benchmark comparison against established open-source systems using GitHub MCP research.

## Executive Summary

Current implementation quality is solid for early-stage deployment, but not yet production-grade for high concurrency or adversarial traffic.

- **Reliability readiness:** 6.5 / 10
- **Scalability readiness:** 5 / 10
- **Security readiness:** 6 / 10
- **Observability readiness:** 4 / 10

Primary blockers:

1. Single-shard bottleneck in matchmaker (`global_lobby` DO).
2. Weak origin/CORS trust model and optional websocket auth in critical paths.
3. Missing structured telemetry, SLO signals, and failure budgets.
4. Duplicate-connection teardown edge cases in matchmaker lifecycle.
5. No explicit circuit-breaker and retry-budget model around external/service boundaries.

## Current Architecture

## Signalling Worker (`apps/signaling-worker/src/lib.rs`)

- Cloudflare Worker entrypoint validates route and origin before dispatching to room Durable Object.
- One Durable Object instance per room (`ROOMS.id_from_name(room_id)`).
- Per-connection attachment persists hibernation-safe state (`peer_id`, rate-limit counters, room type, status).
- Message routing model:
  - Direct peer forwarding via websocket tags (`forward_to_peer`).
  - Room broadcast via `"all"` tag (`broadcast_except`).
  - Relay forwarding with max-hop guard.
- Reliability guardrails present:
  - Payload cap (`64KB`)
  - Per-socket message rate limit (`30 msg/s`)
  - Duplicate-socket eviction by `peer_id`
  - Leave propagation with multi-socket guard
  - Keepalive auto-response (`ping/pong`)

## Matchmaker Worker (`apps/matchmaker-worker/src/lib.rs`)

- Cloudflare Worker entrypoint dispatches all matchmaking paths to a **single** DO instance:
  - `MATCHMAKER_LOBBY.id_from_name("global_lobby")`
- In-memory queue/index:
  - `waiting_users: HashMap<peer_id, WaitingUserData>`
  - `interest_index: HashMap<interest, Vec<peer_id>>`
- Durable storage is used for:
  - `waiting:*` queue persistence
  - `active_match:*` state
  - user profile and social metadata
- Alarm loop performs periodic cleanup and stale record pruning.
- Matching strategy:
  - candidate prefilter by interests/index
  - compatibility checks (gender/filter, verified-only, chat mode)
  - sorting by verified priority, interest overlap, jaccard, trust, wait time

## Benchmark Research (GitHub MCP)

The following mature projects were used as production references:

1. **LiveKit** (`livekit/livekit`)
   - Distributed signaling/media architecture with Redis-backed multi-node routing.
   - Production config exposes retry windows, backoff limits, stream buffer controls, telemetry, strict ACK policy, JWT auth.
   - Reference files:
     - `README.md`
     - `config-sample.yaml`

2. **Open Match** (`googleforgames/open-match`)
   - Componentized matchmaking pipeline (frontend/backend/query/synchronizer/evaluator/MMF).
   - Explicit lock timeouts, pending release timeout, proposal collection windows, HPA and telemetry knobs.
   - Reference files:
     - `README.md`
     - `install/helm/open-match/values.yaml`

3. **Nakama** (`heroiclabs/nakama`)
   - Production-oriented distributed game backend with DB-backed durability, metrics, embedded console, and test/deployment guidance.
   - Reference file:
     - `README.md`

4. **Colyseus** (`colyseus/colyseus`)
   - Built-in matchmaking with reconnect semantics and Redis + LB horizontal scaling model.
   - Reference file:
     - `README.md`

5. **ion-sfu** (`ionorg/ion-sfu`)
   - Minimal SFU core with explicit signaling separation, ICE keepalive/failed timeouts, TURN auth options, and optional Prometheus stats.
   - Reference files:
     - `README.md`
     - `config.toml`

## Pattern Delta: BuzzU vs Production Baseline

## Strong Patterns Already Present

- Durable Object actor model reduces classic shared-memory races.
- Socket attachment-based rate limiting and metadata persistence.
- Queue hydration and alarm-based stale cleanup.
- Candidate indexing and bounded candidate evaluation (`MAX_CANDIDATES_TO_EVALUATE`).
- Defensive parsing and payload bounds.

## Missing or Underdeveloped Production Patterns

1. **Scalable partitioning**
   - Current matchmaker is single shard; production systems use region/function sharding and autoscaling pools.

2. **Circuit breaker / retry-budget model**
   - No explicit open/half-open breaker state for external calls or internal overloaded paths.

3. **Structured observability**
   - Limited metrics; no correlation IDs across websocket lifecycle and no central error taxonomy.

4. **Strong trust boundary enforcement**
   - Weak origin matching and broad CORS behavior.
   - Optional websocket auth in matchmaker.

5. **Operational controls**
   - No SLO-driven alerting and no backpressure policy beyond per-socket rate limits.

## Detailed Risk Analysis

## A. Reliability & Failure Handling

### A1. Duplicate-socket close can remove active queue entries (matchmaker)

When a duplicate socket is replaced, the older socket close handler deletes `waiting:{peer_id}` unconditionally. If the new socket has already re-queued, old-close teardown can erase active state.

**Impact:** Intermittent phantom dequeues and user-visible “stuck searching” behavior after reconnect bursts.

### A2. Alarm scheduling gap for REST-only queue paths

Websocket path calls `ensure_alarm()`, but REST `/match` enqueue flow does not. If queue is populated through REST paths only, stale entries can persist longer than intended.

**Impact:** Queue hygiene degradation and stale candidate inflation.

### A3. Silent delivery failure handling

Signaling forwarding ignores send errors and does not quarantine failing peers.

**Impact:** Repeated failed sends waste CPU and hide delivery degradation from operators.

## B. Race Conditions & Consistency

### B1. Global singleton queue introduces fairness contention

Single actor serialization (`global_lobby`) is safe for consistency but causes throughput collapse at higher request rates.

**Impact:** Increased matchmaking latency and long-tail queue times.

### B2. In-memory vs storage consistency windows

The implementation is mostly careful, but lifecycle edges still exist where in-memory and storage state can diverge during reconnect churn and duplicate socket replacement.

**Impact:** Rare but user-visible queue/match state drift.

## C. Scalability Bottlenecks

### C1. Single DO hot spot

All matchmaking traffic converges to one durable object.

**Impact:** Hard ceiling on match throughput and p95 latency.

### C2. O(n) scans in cleanup and candidate handling

Periodic storage scans and queue-wide checks are acceptable at low scale but expensive with large ticket volume.

### C3. No adaptive load shedding

No queue-level circuit breaker or shed policy during overload.

## D. Security Gaps

### D1. Origin validation is permissive by substring

`origin_allowed` allows any origin containing `"buzzu"` and allows empty origin in some paths.

**Impact:** Elevated abuse surface for browser-originated credential endpoints.

### D2. Matchmaker CORS reflects arbitrary origin

`apply_cors` effectively permits broad origins and credentials behavior, lacking strict allowlist.

### D3. Websocket auth is optional for matchmaker

If `WS_AUTH_REQUIRED` is false or misconfigured, peer identity can be spoofed via query params.

### D4. Token model lacks expiry semantics

Issued token payload uses `iat` only, with no `exp`.

**Impact:** Long-lived bearer replay risk.

## E. Observability & Error Propagation

- No durable event schema for connection lifecycle transitions.
- Error classes are inconsistent (`Error { message }` only).
- Missing per-room and per-lobby metrics:
  - websocket accepts/rejects
  - queue depth histogram
  - match latency histogram
  - stale cleanup counts
  - relay drop counters
- No direct SLO instrumentation for p95 match time, signal delivery success, reconnect success.

## Recommendations

## P0 (Immediate, 1-2 weeks)

1. **Fix duplicate-close teardown semantics**
   - Apply signaling’s “other sockets remain” pattern to matchmaker close/error handlers before deleting queue state.

2. **Enforce strict auth/origin model**
   - Require websocket auth in all environments except explicit local dev.
   - Replace substring origin checks with exact allowlist matching.
   - Restrict CORS to known frontend origins only.

3. **Add token expiry and validation hardening**
   - Include `exp`, reject expired tokens, and rotate signing secret with dual-key grace window.

4. **Introduce structured logging envelope**
   - Standard fields: `request_id`, `peer_id`, `room_id`, `event`, `status`, `error_code`, `latency_ms`.

## P1 (Short term, 2-6 weeks)

1. **Shard matchmaker**
   - Route by region + chat mode + optional interest hash:
     - `lobby:{region}:{mode}:{shard}`
   - Preserve fallback cross-shard reconciliation for low-traffic buckets.

2. **Add overload controls / circuit breaker**
   - Queue-depth and processing-latency based breaker states:
     - Closed: normal
     - Open: reject new search with retry-after hint
     - Half-open: sampled admission

3. **Implement delivery health feedback**
   - Track send failures per peer and quarantine sockets exceeding error threshold.

4. **Instrument core SLO metrics**
   - p50/p95/p99 matchmaking latency
   - signaling fanout delivery success
   - reconnect success rate
   - queue timeout ratio

## P2 (Medium term, 6-12 weeks)

1. **Decouple control-plane components**
   - Move toward Open Match style separation:
     - ticket intake
     - candidate generation
     - evaluator
     - assignment

2. **Introduce bounded queues and fairness policy**
   - Cap per-shard queue depth and add per-device/account admission budget.

3. **Add dead-letter and replay-safe flows**
   - For failed assignment or signaling events, persist into dead-letter keys with retry metadata.

4. **Operational hardening**
   - Canary rollout strategy with rapid rollback, per-release error budget guardrails.

## Circuit Breaker Design (Target State)

Implement breaker at two levels:

1. **Match Intake Breaker**
   - Trip conditions:
     - queue depth > threshold
     - p95 matchmaking latency > threshold for N windows
   - Action:
     - reject new searches with deterministic retry-after.

2. **External Dependency Breaker**
   - For TURN credential generation and any future reputation/profile upstream calls.
   - Retry with capped exponential backoff + jitter.
   - Open breaker on consecutive failures; half-open probe after cooldown.

## Logging, Monitoring, and Alerting Plan

## Minimum Production Dashboard

- **Signalling**
  - active rooms, peers/room, join/leave rate
  - relay hop-limit drops
  - parse errors by message type
  - send failure ratio
- **Matchmaker**
  - queue depth by shard
  - match completion latency histogram
  - timeout/abandon ratio
  - hydration and cleanup durations
- **Security**
  - auth failures by reason
  - origin/CORS rejections
  - token expiry failures

## Alert Rules

- p95 matchmaking latency > SLO for 10 minutes
- queue timeout ratio > 5%
- signaling delivery failure ratio > 1%
- auth failure spike > baseline + 3σ

## Migration Plan (Phased)

## Phase 0: Safety Baseline (Week 1)

- Ship auth/origin/CORS hardening.
- Patch duplicate-close queue deletion bug.
- Add token `exp`.
- Add structured logs and basic counters.

**Exit criteria:** no regression in connect/match success for 7 days.

## Phase 1: Observability + Control (Weeks 2-4)

- Add full SLO dashboards and alerts.
- Implement intake circuit breaker and load shedding.
- Add retry budgets and standardized error propagation schema.

**Exit criteria:** alert quality validated, on-call runbook finalized.

## Phase 2: Scalability (Weeks 4-8)

- Deploy sharded lobby topology.
- Add shard-aware routing and failover.
- Load-test to target CCU and match throughput.

**Exit criteria:** p95 latency and throughput meet target under 2x expected peak.

## Phase 3: Resilience Validation (Weeks 8-10)

- Chaos tests for DO restarts, websocket churn, and injected storage faults.
- Validate breaker behavior and recovery curves.

**Exit criteria:** all chaos scenarios recover within defined MTTR.

## Testing Strategy

## Load Testing

Use staged tests (small, nominal, stress, spike, soak):

- **Signalling load profiles**
  - many rooms with low fanout
  - few rooms with high fanout
  - reconnect storms
- **Matchmaker load profiles**
  - burst search intake
  - skewed interests (hot-key pressure)
  - mixed verified/chat-mode partitions

KPIs:

- websocket connect success %
- match assignment latency (p50/p95/p99)
- queue timeout %
- CPU time/request and storage op rates

## Chaos Engineering Scenarios

1. Force DO restarts during active websocket sessions.
2. Simulate storage read/write latency spikes.
3. Inject websocket close/error storms for duplicate peer IDs.
4. Randomly fail external TURN credential calls.
5. Drop a shard and verify reroute behavior.

Success criteria:

- No data corruption in queue/match state.
- Recovery within MTTR target.
- Error propagation remains actionable and bounded.

## Production Readiness Success Metrics

Define concrete gates before full rollout:

- **SLO 1:** Match assignment p95 < 1.5s at 2x forecast peak.
- **SLO 2:** Signaling delivery success > 99.9%.
- **SLO 3:** Queue timeout ratio < 2% at peak.
- **SLO 4:** Auth bypass incidents = 0.
- **SLO 5:** Mean time to detect < 2 minutes; mean time to recover < 10 minutes.

## Prioritized Action Checklist

1. Patch duplicate-close queue deletion race.
2. Enforce strict origin allowlist and mandatory WS auth.
3. Add JWT expiry and key rotation strategy.
4. Introduce structured logs + SLO dashboards.
5. Add intake circuit breaker and overload shedding.
6. Shard `global_lobby` into region/mode buckets.
7. Execute load and chaos test matrix before production promotion.
