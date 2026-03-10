# Production-Grade Cloudflare Worker Patterns — Research Report

> Research compiled from `cloudflare/workers-rs`, `jeastham1993/serverless-cloudflare`, Cloudflare official docs, and GitHub-wide code search across 20+ Rust CF Worker repos.

---

## Table of Contents

1. [WebSocket Management in Durable Objects](#1-websocket-management-in-durable-objects)
2. [Free Tier Optimization Strategies](#2-free-tier-optimization-strategies)
3. [Security Patterns for CF Workers](#3-security-patterns-for-cf-workers)
4. [Matchmaking in Durable Objects](#4-matchmaking-in-durable-objects)
5. [Anti-Patterns to Avoid](#5-anti-patterns-to-avoid)
6. [Recommendations for BuzzU](#6-recommendations-for-buzzu)

---

## 1. WebSocket Management in Durable Objects

### 1.1 Hibernation API (Critical — Use This)

The **Hibernation WebSocket API** is the single most important pattern. It allows the DO to sleep while clients stay connected.

**Key difference**: Use `state.accept_web_socket(&server)` instead of `server.accept()`.

```rust
// ✅ CORRECT — Hibernation-enabled accept
async fn fetch(&self, req: Request) -> Result<Response> {
    let pair = WebSocketPair::new()?;
    let server = pair.server;
    
    // This is the hibernation API — DO can sleep between messages
    self.state.accept_web_socket(&server);
    
    // Attach per-connection metadata that survives hibernation
    server.serialize_attachment(&ConnectionMeta {
        peer_id: peer_id.clone(),
        joined_at: Date::now().as_millis(),
    })?;

    Ok(ResponseBuilder::new()
        .with_status(101)
        .with_websocket(pair.client)
        .empty())
}
```

```rust
// ❌ WRONG — Standard accept prevents hibernation entirely
server.accept(); // DO stays in memory for entire WS lifetime = $$$$
```

**Source**: `cloudflare/workers-rs` — `test/src/counter.rs` L31-57, `worker/src/durable.rs` L280

### 1.2 WebSocket Tags (Avoids O(n) Broadcast)

Tags let you filter WebSockets without iterating all connections. This is crucial for BuzzU's room-based messaging.

```rust
// Accept with tags — e.g., tag by room_id and peer_id
self.state.accept_websocket_with_tags(&server, &["room:abc123", "peer:xyz789"]);

// Later: broadcast only to peers in a specific room
let room_sockets = self.state.get_websockets_with_tag("room:abc123");
for ws in room_sockets {
    let _ = ws.send(&message);
}

// Retrieve tags from a specific websocket
let tags: Vec<String> = self.state.get_tags(&some_ws);
```

**Source**: `worker/src/durable.rs` L285-310 — `accept_websocket_with_tags`, `get_websockets_with_tag`, `get_tags`

### 1.3 serialize/deserializeAttachment (Per-Connection State)

Attachments persist through hibernation. Max size: **2,048 bytes**. For larger data, store a key reference instead.

```rust
// On connect: attach metadata
server.serialize_attachment(&WebsocketConnectionAttachments {
    user_id: user_id.clone(),
})?;

// In websocket_message or websocket_close: recover metadata
let attachments: Option<WebsocketConnectionAttachments> = ws.deserialize_attachment()?;
let user_id = attachments.map(|a| a.user_id).unwrap_or_default();
```

**Source**: `jeastham1993/serverless-cloudflare` — `chatroom.rs` L126-155 (full production example)

### 1.4 Auto-Response (Ping/Pong Without Waking DO)

Configure automatic responses that don't wake the DO — **zero CPU billing**.

```rust
async fn fetch(&self, req: Request) -> Result<Response> {
    // Set up auto-response for heartbeat — DO stays asleep
    let pair = WebSocketRequestResponsePair::new("ping", "pong")?;
    self.state.set_websocket_auto_response(&pair);
    
    // ... accept websocket
}
```

**Key facts**:
- Ping/pong auto-responses do NOT incur wall-clock time charges
- The runtime also automatically handles WebSocket protocol-level ping frames without waking the DO
- One auto-response pair is shared across all WebSockets in the DO

**Source**: `test/src/auto_response.rs` L5-36, CF Docs pricing footnote 3

### 1.5 WebSocket Relay Pattern (Worker ↔ DO ↔ DO)

For proxying WebSocket messages between a client and a Durable Object via a Worker:

```rust
// Worker creates a WebSocketPair, connects one end to the DO
let pair = WebSocketPair::new()?;
let server = pair.server;
server.accept()?;

// Connect to DO via another WS
let stub = namespace.id_from_name("A")?.get_stub()?;
let mut req = Request::new("https://fake-host/ws", Method::Get)?;
req.headers_mut()?.set("upgrade", "websocket")?;
let res = stub.fetch_with_request(req).await?;
let do_ws = res.websocket().expect("server did not accept");
do_ws.accept()?;

// Relay between client WS and DO WS using StreamMap
let mut map = StreamMap::new();
map.insert("client", server.events()?);
map.insert("durable", do_ws.events()?);

while let Some((key, event)) = map.next().await {
    match key {
        "client" => { /* forward to DO */ }
        "durable" => { /* forward to client */ }
    }
}
```

**Source**: `test/src/counter.rs` L114-158

### 1.6 DurableObject Trait — Handler Methods

```rust
pub trait DurableObject {
    fn new(state: State, env: Env) -> Self;
    async fn fetch(&self, req: Request) -> Result<Response>;
    async fn alarm(&self) -> Result<Response>;
    async fn websocket_message(&self, ws: WebSocket, message: WebSocketIncomingMessage) -> Result<()>;
    async fn websocket_close(&self, ws: WebSocket, code: usize, reason: String, was_clean: bool) -> Result<()>;
    async fn websocket_error(&self, ws: WebSocket, error: Error) -> Result<()>;
}
```

Use `#[durable_object(websocket)]` attribute to reduce generated JS/WASM if you only need WebSocket events:

```rust
#[durable_object(websocket)]  // Only generates websocket + core bindings
pub struct SignalingRoom { ... }
```

**Source**: `worker/src/durable.rs` L883-920, `worker-macros/src/durable_object.rs` L175-200

### 1.7 Alarm-Based Cleanup (Chat Expiry Pattern)

```rust
async fn fetch(&mut self, req: Request) -> Result<Response> {
    // Reset the chat expiry timer on every interaction
    self.state.storage()
        .set_alarm(Duration::from_secs(300)) // 5-minute rolling window
        .await;
    // ...
}

async fn alarm(&mut self) -> Result<Response> {
    // Clean up: close all WebSockets, delete chat from D1
    let web_socket_conns = self.state.get_websockets();
    let msg = MessageWrapper::new(MessageTypes::ChatroomEnded, ChatroomEnded::new(chat_id));
    for conn in web_socket_conns {
        let _ = conn.send(&msg);
    }
    // Also delete from database...
    Response::ok("ALARMED")
}
```

**Source**: `jeastham1993/serverless-cloudflare` — `chatroom.rs` L68-91, L158-166

---

## 2. Free Tier Optimization Strategies

### 2.1 Pricing Model (Workers Free Plan)

| Resource | Free Tier (Daily) | Paid Tier (Monthly) |
|---|---|---|
| **Requests** (HTTP + WS messages + alarms) | 100,000/day | 1M included, then $0.15/M |
| **Duration** (GB-s) | 13,000 GB-s/day | 400,000 GB-s included, then $12.50/M |
| **SQLite Rows Read** | 5M/day | 25B/month included |
| **SQLite Rows Written** | 100,000/day | 50M/month included |
| **SQL Stored Data** | 5 GB total | 5 GB-month included |

### 2.2 The 20:1 WebSocket Message Billing Ratio

**Critical**: Incoming WebSocket messages are billed at a **20:1 ratio**. 100 incoming WS messages = 5 billed requests.

- Outgoing WS messages: **FREE** (no charge)
- WebSocket protocol pings: **FREE** (no charge)
- Initial WS connection request: billed as 1 request
- `setWebSocketAutoResponse` messages: **FREE** (no wall-clock time)

### 2.3 Optimization Strategies

#### Strategy 1: Hibernation API (90%+ cost reduction on duration)

**Without hibernation** (Example 2 from CF docs):
- 100 DOs × 50 connections × 8hrs/day = **$138.65/month**

**With hibernation** (Example 4 from CF docs):
- 100 DOs × 100 connections × 24hrs/day = **$10.00/month**

That's **93% cheaper** with 2× the connections and 3× the hours.

#### Strategy 2: Batch Messages (Reduce WS message count)

```javascript
// Client-side: batch multiple logical messages into one WS frame
function sendBatch(ws, messages) {
    ws.send(JSON.stringify({ messages, timestamp: Date.now() }));
}

// DO-side: unpack in a single handler invocation
async webSocketMessage(ws, message) {
    const batch = JSON.parse(message);
    for (const msg of batch.messages) {
        this.handleMessage(ws, msg);
    }
}
```

CF recommends batching every **50-100ms** or every **50-100 messages**, whichever comes first.

#### Strategy 3: Auto-Response for Heartbeats

```rust
let pair = WebSocketRequestResponsePair::new("ping", "pong")?;
self.state.set_websocket_auto_response(&pair);
```

This handles keep-alive without waking the DO = zero CPU = zero duration charges.

#### Strategy 4: Lazy Storage Initialization

```rust
// Only load from storage on first access, not every fetch
if !*self.initialized.borrow() {
    *self.initialized.borrow_mut() = true;
    *self.count.borrow_mut() = self.state.storage().get("count").await?.unwrap_or(0);
}
```

After hibernation, the constructor runs again — keep it minimal. Load state only when needed.

#### Strategy 5: Minimize Storage Operations

- Use `put_multiple` / `get_multiple` instead of individual calls (same billing, fewer round-trips)
- Each `setAlarm()` = 1 row written. Don't reset alarms on every single message.
- Cap stored message history (e.g., keep last 100 messages):
  ```rust
  if messages.len() > 100 {
      messages = messages.split_off(messages.len() - 100);
  }
  ```

#### Strategy 6: Validate in Worker, Not in DO

> "Both Workers and Durable Objects are billed based on the number of requests. Validate requests in your Worker to avoid billing for invalid requests against a Durable Object."

```rust
// Worker layer: reject bad requests BEFORE hitting the DO
let upgrade_header = req.headers().get("Upgrade");
if upgrade_header.is_err() || upgrade_header.unwrap().unwrap() != "websocket" {
    return Response::error("Expected Upgrade: websocket", 426);
}
```

### 2.4 Free Tier Budget Math for BuzzU

On the free plan (100K requests/day):
- With the 20:1 WS ratio: **100,000 × 20 = 2,000,000 WS messages/day**
- At 1 msg/sec per connection: that's ~555 connection-hours/day
- Or ~23 simultaneous 1:1 chat pairs for 24 hours

With the paid plan ($5/mo minimum):
- 1M requests × 20 = **20M WS messages/month** included
- Duration: 400,000 GB-s with hibernation = essentially unlimited for reasonable usage

---

## 3. Security Patterns for CF Workers

### 3.1 JWT Validation at Worker Level (Before DO)

From `jeastham1993/serverless-cloudflare` — the production pattern:

```rust
// Worker: validate JWT BEFORE proxying to DO
pub async fn handle_websocket_connect(req: Request, ctx: RouteContext<AppState>) -> Result<Response> {
    // 1. Check upgrade header
    let upgrade_header = req.headers().get("Upgrade");
    if upgrade_header.is_err() || upgrade_header.unwrap().unwrap() != "websocket" {
        return Ok(Response::builder().with_status(426).body(ResponseBody::Empty));
    }

    // 2. Extract and validate JWT from query param
    let password_header = req.query::<QueryStringParameters>();
    if password_header.is_err() {
        return Ok(Response::builder().with_status(401).body(ResponseBody::Empty));
    }

    match &ctx.data.auth_service.verify_jwt_token(&password_header.unwrap().key) {
        Ok(claims) => {
            // 3. Rewrite request with validated identity, forward to DO
            let url = req.url()?;
            let mut new_url = url.clone();
            new_url.set_query(Some(&format!("user_id={}", claims.sub)));
            let mut new_req = Request::new(new_url.as_str(), req.method())?;
            new_req.headers_mut()?.set("Upgrade", "websocket")?;

            let object = ctx.durable_object("CHATROOM").unwrap();
            let id = object.id_from_name(chat_id.as_str()).unwrap();
            let stub = id.get_stub().unwrap();
            return Ok(stub.fetch_with_request(new_req).await.unwrap());
        }
        Err(_) => return Response::error("Unauthorized", 401),
    };
}
```

**Key pattern**: JWT secret comes from `env.secret("JWT_SECRET")` — never hardcoded.

### 3.2 WebSocket Authentication Flow

The recommended pattern (from both CF docs and `jeastham1993`):

1. **Client** sends JWT as query parameter: `ws://host/room/123?key=<jwt>`
2. **Worker** validates JWT, extracts claims, rewrites request
3. **Worker** forwards to DO with trusted identity (e.g., `?user_id=alice`)
4. **DO** trusts the identity (Worker already validated)

```javascript
// Client-side connection with JWT
const ws = new WebSocket(
    `${ws_root}/api/connect/${chatroomId}?key=${localStorage.getItem('jwt')}`
);
```

### 3.3 CF Built-in Rate Limiter

```rust
// In wrangler.toml:
// [[unsafe.bindings]]
// name = "RATE_LIMITER"
// type = "ratelimit"
// namespace_id = "..."
// simple = { limit = 100, period = 60 }

// In Worker:
let limiter = env.rate_limiter("RATE_LIMITER")?;
let outcome = limiter.limit("per-ip-key".to_string()).await?;
if !outcome.success {
    return Response::error("Rate limited", 429);
}
```

**Source**: `worker/src/rate_limit.rs`, `test/src/rate_limit.rs`

### 3.4 Payload Size Protection

- WebSocket attachment max size: **2,048 bytes**
- Cap stored messages to prevent storage bloat:
  ```rust
  if messages.len() > 100 {
      messages = messages.split_off(messages.len() - 100);
  }
  ```
- Validate message types before processing:
  ```rust
  async fn websocket_message(&self, _ws: WebSocket, message: WebSocketIncomingMessage) -> Result<()> {
      match message {
          WebSocketIncomingMessage::String(str_data) => {
              let incoming: IncomingMessageType = serde_json::from_str(&str_data)?;
              match incoming.message_type.as_str() {
                  "NewMessage" => { /* handle */ }
                  _ => { /* ignore unknown types */ }
              }
          }
          WebSocketIncomingMessage::Binary(_) => { /* handle or reject */ }
      }
      Ok(())
  }
  ```

### 3.5 TLS Client Auth (Available in workers-rs)

The `TlsClientAuth` type exposes mTLS fields from CF:

```rust
// Available via request.cf() properties:
// cert_issuer_dn, cert_subject_dn, cert_verified, cert_serial, etc.
```

### 3.6 Bot Management (Available in workers-rs)

```rust
// BotManagement fields available:
// score: u32, verified_bot: bool, ja3_hash, ja4, detection_ids, etc.
```

---

## 4. Matchmaking in Durable Objects

### 4.1 The Single-DO Bottleneck Problem

GitHub search returned **zero** matchmaking-specific repos using CF Durable Objects. This is a novel problem space. Here's what we can derive from the patterns found:

**Problem**: A single matchmaker DO handles all concurrent searches. At scale, it becomes a bottleneck because:
- Each DO runs single-threaded
- All storage operations are serialized
- Max 32 MB memory per DO

### 4.2 Sharding Strategies (Derived from Patterns)

#### Option A: Interest-Based Sharding (Recommended for BuzzU)

```
Matchmaker DO naming: "match:{interest_hash}:{gender_filter}"
```

- Route `Search { interests: ["music", "gaming"] }` to multiple DOs
- Each interest combination gets its own queue
- Reduces contention on any single DO
- Use `id_from_name()` for deterministic routing:
  ```rust
  let shard_key = format!("match:{}:{}", interest_bucket, gender_filter);
  let id = namespace.id_from_name(&shard_key)?;
  ```

#### Option B: Geographic/Regional Sharding

```rust
// Use jurisdiction for data locality
let id = namespace.unique_id_with_jurisdiction(Jurisdiction::EU)?;
```

#### Option C: Consistent Hashing with Overflow

- Primary shard: `match:{bucket}` 
- If primary has too many waiting peers (>100), overflow to `match:{bucket}:overflow:{n}`
- Coordinator DO periodically rebalances

### 4.3 In-Memory vs Persisted State for Matchmaking

**In-memory only** (BuzzU's current approach):
- ✅ Fastest matching (no storage reads/writes)
- ✅ Zero storage billing
- ❌ Lost on hibernation/eviction
- ❌ Lost on code deploy

**Persisted with SQLite**:
- ✅ Survives hibernation
- ✅ Can query waiting peers with SQL
- ❌ 100K row writes/day on free tier
- ❌ Adds latency per match

**Recommended hybrid**: Keep the active queue in memory, but persist match results to SQLite for analytics/recovery. The matchmaker DO should NOT hibernate (it's always active if anyone is searching), so in-memory state is fine.

### 4.4 Queue Pattern for Matchmaking

From the chatroom patterns, the alarm-based cleanup works well:

```rust
// Set a timeout for each search
self.state.storage().set_alarm(Duration::from_secs(30)).await;

// In alarm(): notify still-waiting peers that search timed out
async fn alarm(&self) -> Result<Response> {
    for ws in self.state.get_websockets() {
        let _ = ws.send(&json!({"type": "SearchTimeout"}));
    }
    Ok(Response::ok("cleaned up"))
}
```

---

## 5. Anti-Patterns to Avoid

### ❌ Using `server.accept()` Instead of `state.accept_web_socket()`
- Prevents hibernation entirely
- DO stays in memory for entire WebSocket lifetime
- **Cost impact**: 10-100× more expensive (see Example 2 vs Example 4)

### ❌ Storage Read/Write on Every WebSocket Message
- Each `get()`/`put()` = billed row read/write
- 100 messages/min × 100 DOs = 432M reads/month
- **Fix**: Cache in memory, batch writes, or use attachments

### ❌ Resetting Alarms on Every Message
- `setAlarm()` = 1 row written per call
- Instead: only reset alarm if enough time has passed since last reset

### ❌ Broadcasting via `get_websockets()` + Full Loop
- O(n) iteration over ALL connections in the DO
- **Fix**: Use `get_websockets_with_tag(tag)` to filter

### ❌ Heavy Constructor Logic
- Constructor runs on EVERY wake-from-hibernation
- **Fix**: Move initialization to lazy patterns (check `initialized` flag)

### ❌ Using `setTimeout`/`setInterval` in DO
- Prevents hibernation (timer keeps DO alive)
- **Fix**: Use `state.storage().set_alarm()` instead

### ❌ Validating Auth Inside the DO Instead of the Worker
- Every invalid request still gets billed as a DO request
- **Fix**: Validate JWT/auth in the Worker before forwarding to DO

### ❌ Not Limiting Stored Message History
- Unbounded `Vec<Message>` in storage = growing read costs
- **Fix**: Cap at 100 messages with `split_off()`

### ❌ Sending Many Small WebSocket Messages
- Each message triggers kernel↔JS context switch overhead
- **Fix**: Batch 10-100 logical messages per WebSocket frame

---

## 6. Recommendations for BuzzU

### 6.1 Signaling Worker (`apps/signaling-worker`)

| Current | Recommended Change |
|---|---|
| Verify if using `accept_web_socket` | Ensure hibernation API is used everywhere |
| N/A | Add `WebSocketRequestResponsePair::new("ping", "pong")` auto-response |
| N/A | Use `accept_websocket_with_tags(&server, &["room:{room_id}", "peer:{peer_id}"])` |
| N/A | Replace `get_websockets()` loops with `get_websockets_with_tag("room:{id}")` |
| Message forwarding via `forward_to_peer()` | Use tags: `get_websockets_with_tag("peer:{target_id}")` for O(1) lookup |
| N/A | Add `#[durable_object(websocket)]` attribute if only handling WS events |

### 6.2 Matchmaker Worker (`apps/matchmaker-worker`)

| Current | Recommended Change |
|---|---|
| Single DO for all matchmaking | Consider interest-based sharding: `match:{interest_hash}` |
| In-memory queue | Keep in-memory (correct for active matchmaker), add alarm-based timeout |
| HTTP PATCH disconnect | Also handle in `websocket_close` for reliability |
| N/A | Validate `is_verified` claims in Worker before forwarding to matchmaker DO |

### 6.3 Free Tier Budget Allocation

With 100K requests/day:
- ~2M WS messages/day (20:1 ratio)
- Reserve ~10K for HTTP endpoints (match initiation, disconnects, ice-servers)
- Reserve ~90K × 20 = ~1.8M for actual WS message traffic
- At 2 users per room, 1 msg/5sec each: supports ~**104 concurrent rooms for 24 hours**

### 6.4 Cost Projection (Paid Plan, $5/mo)

Using hibernation + auto-response + batching:
- 500 concurrent 1:1 chats, 1 msg/sec each
- ~2.6M messages/day ÷ 20 = 130K billed requests/day = 3.9M/month
- Duration: negligible with hibernation (10ms per message handler)
- **Estimated: ~$5.44/month** (minimum + $0.44 overage)

---

## Source Index

| Source | What It Contains |
|---|---|
| `cloudflare/workers-rs` `worker/src/durable.rs` | State API: accept_web_socket, tags, get_websockets, auto_response |
| `cloudflare/workers-rs` `test/src/counter.rs` | Complete hibernation DO example with attachments + relay pattern |
| `cloudflare/workers-rs` `test/src/auto_response.rs` | Auto-response ping/pong setup |
| `cloudflare/workers-rs` `worker/src/websocket.rs` | Full WebSocket API: connect, send, close, events stream, attachments |
| `cloudflare/workers-rs` `worker/src/rate_limit.rs` | RateLimiter binding wrapper |
| `cloudflare/workers-rs` `worker-macros/src/durable_object.rs` | `#[durable_object(websocket)]` attribute variants |
| `jeastham1993/serverless-cloudflare` `chatroom.rs` | Full production chatroom: JWT auth, hibernation, attachments, alarms, message history |
| `jeastham1993/serverless-cloudflare` `lib.rs` | JWT validation pattern at Worker level before DO forwarding |
| CF Docs: `/durable-objects/best-practices/websockets/` | Hibernation docs, batching recommendations, auto-response |
| CF Docs: `/durable-objects/platform/pricing/` | Free tier limits, 20:1 WS ratio, billing examples |
