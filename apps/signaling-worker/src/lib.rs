use serde::{Deserialize, Serialize};
use serde_json::json;
use worker::*;

// -- Free-Tier Guardrails -----------------------------------------------
// CF Workers free tier: 100K req/day, 10ms CPU.
// CF Durable Objects: first 100K req/day free, 1M WS messages/month.
// WS messages are billed at 20:1 ratio (20 messages = 1 request).
// Outgoing messages + protocol pings are FREE.
// Strategy: validate early, reject fast, use tags for O(1) routing.
// -----------------------------------------------------------------------

const MAX_PAYLOAD_BYTES: usize = 64 * 1024;
const MAX_PEERS_PER_ROOM: usize = 10;
const MAX_PRIVATE_ROOM_PEERS: usize = 5;
const MAX_HELP_ROOM_PEERS: usize = 25;
const MAX_ADMIN_ROOM_PEERS: usize = 15;
const MAX_RELAY_HOPS: u32 = 3;
const MAX_MESSAGES_PER_SEC: u32 = 30;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SignalingMessage {
    RoomStatus {
        status: String,
        active_peers: usize,
        max_peers: usize,
    },
    Join {
        room_id: String,
        peer_id: String,
    },
    Offer {
        from: String,
        to: String,
        payload: String,
        #[serde(default)]
        room_id: String,
    },
    Answer {
        from: String,
        to: String,
        payload: String,
        #[serde(default)]
        room_id: String,
    },
    IceCandidate {
        from: String,
        to: String,
        payload: String,
        #[serde(default)]
        room_id: String,
    },
    PeerList {
        peers: Vec<String>,
    },
    Leave {
        peer_id: String,
    },
    Error {
        message: String,
    },
    Relay {
        from: String,
        to: String,
        via: String,
        payload: String,
        hop_count: u32,
        timestamp: u64,
    },
    Chat {
        from: String,
        to: String,
        payload: String,
    },
    Typing {
        from: String,
        to: String,
        typing: bool,
    },
    PublishKeys {
        from: String,
        bundle: String,
    },
    RequestKeys {
        from: String,
        to: String,
    },
    KeysResponse {
        from: String,
        to: String,
        bundle: String,
    },
    SignalHandshake {
        from: String,
        to: String,
        initiation: String,
    },
    FriendRequest {
        from: String,
        to: String,
        action: FriendRequestAction,
        #[serde(default)]
        username: Option<String>,
        #[serde(rename = "avatarSeed", default)]
        avatar_seed: Option<String>,
    },
    ScreenShare {
        from: String,
        to: String,
        sharing: bool,
    },
    /// E2E encrypted envelope — server treats as opaque relay.
    /// Payload is base64 XChaCha20-Poly1305 ciphertext.
    Encrypted {
        from: String,
        to: String,
        payload: String,
    },
    /// X25519 public key exchange for E2E signaling encryption.
    /// The payload is the sender's base64 public key.
    KeyExchange {
        from: String,
        to: String,
        payload: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FriendRequestAction {
    Send,
    Accept,
    Decline,
}

/// Per-peer attachment stored on each WebSocket via hibernation API.
/// Survives DO hibernation/eviction. Max 2,048 bytes.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PeerAttachment {
    peer_id: String,
    msg_count: u32,
    window_start: u64,
    #[serde(default)]
    status: PeerStatus,
    #[serde(default = "now_ms")]
    joined_at: u64,
    #[serde(default = "default_room_type")]
    room_type: String,
}

#[durable_object]
pub struct RoomDurableObject {
    state: State,
    env: Env,
}

impl DurableObject for RoomDurableObject {
    fn new(state: State, env: Env) -> Self {
        Self { state, env }
    }

    async fn fetch(&self, req: Request) -> Result<Response> {
        let upgrade = req.headers().get("Upgrade")?;
        if upgrade.map(|u| u == "websocket").unwrap_or(false) {
            let WebSocketPair { client, server } = WebSocketPair::new()?;

            let url = req.url()?;
            let peer_id = url
                .query_pairs()
                .find(|(k, _)| k == "peer_id")
                .map(|(_, v)| v.to_string())
                .unwrap_or_else(|| format!("peer_{}", uuid::Uuid::new_v4()));
            let room_type = url
                .query_pairs()
                .find(|(k, _)| k == "room_type")
                .map(|(_, v)| v.to_string())
                .unwrap_or_else(|| "match".to_string());
            let room_key = url
                .query_pairs()
                .find(|(k, _)| k == "room_key")
                .map(|(_, v)| v.to_string())
                .filter(|v| !v.is_empty());
            let access_key = url
                .query_pairs()
                .find(|(k, _)| k == "access_key")
                .map(|(_, v)| v.to_string());

            self.state.storage().put("room_type", room_type.clone()).await?;

            if room_type == "admin" {
                let allowed = self.is_admin_allowed(access_key.as_deref());
                if !allowed {
                    return Response::error("Unauthorized", 401);
                }
            }

            if room_type == "private" {
                let stored_key: Option<String> = self.state.storage().get("room_key").await?;
                match (stored_key, room_key.as_ref()) {
                    (None, Some(key)) => {
                        self.state.storage().put("room_key", key.clone()).await?;
                    }
                    (None, None) => {}
                    (Some(stored), Some(provided)) if stored == *provided => {}
                    (Some(_), None) => {
                        return Response::error("Room key required", 401);
                    }
                    (Some(_), Some(_)) => {
                        return Response::error("Invalid room key", 403);
                    }
                }
            }

            let max_peers = match room_type.as_str() {
                "private" => MAX_PRIVATE_ROOM_PEERS,
                "help" => MAX_HELP_ROOM_PEERS,
                "admin" => MAX_ADMIN_ROOM_PEERS,
                _ => MAX_PEERS_PER_ROOM,
            };

            let active_peers = self.count_active_peers();
            let mut status = PeerStatus::Active;
            if room_type == "help" && active_peers >= max_peers {
                status = PeerStatus::Waiting;
            } else if active_peers >= max_peers {
                return Response::error("Room is full", 429);
            }

            // Evict any existing connections from this same peer_id.
            // This prevents ghost sockets from absorbing targeted messages
            // when a client reconnects (e.g., React StrictMode double-mount,
            // rapid navigation, or network hiccups).
            for existing_ws in self.state.get_websockets() {
                if let Some(att) = existing_ws
                    .deserialize_attachment::<PeerAttachment>()
                    .ok()
                    .flatten()
                {
                    if att.peer_id == peer_id {
                        let _ = existing_ws.close(Some(4000), Some("Replaced by new connection"));
                    }
                }
            }

            self.state.accept_websocket_with_tags(
                &server,
                &[&peer_id, "all"],
            );

            let attachment = PeerAttachment {
                peer_id: peer_id.clone(),
                msg_count: 0,
                window_start: now_ms(),
                status,
                joined_at: now_ms(),
                room_type: room_type.clone(),
            };
            server.serialize_attachment(&attachment)?;

            if let Ok(auto) = WebSocketRequestResponsePair::new("ping", "pong") {
                self.state.set_websocket_auto_response(&auto);
            }

            if matches!(status, PeerStatus::Waiting) {
                let wait_msg = SignalingMessage::RoomStatus {
                    status: "waiting".to_string(),
                    active_peers,
                    max_peers,
                };
                if let Ok(json_str) = serde_json::to_string(&wait_msg) {
                    let _ = server.send_with_str(&json_str);
                }
                return Response::from_websocket(client);
            }

            let peer_list: Vec<String> = {
                let mut seen = std::collections::HashSet::new();
                self.state
                    .get_websockets()
                    .iter()
                    .filter_map(|ws| {
                        ws.deserialize_attachment::<PeerAttachment>()
                            .ok()
                            .flatten()
                    })
                    .filter(|a| matches!(a.status, PeerStatus::Active))
                    .map(|a| a.peer_id)
                    .filter(|id| id != &peer_id && seen.insert(id.clone()))
                    .collect()
            };

            let peer_list_msg = SignalingMessage::PeerList { peers: peer_list };
            if let Ok(json_str) = serde_json::to_string(&peer_list_msg) {
                let _ = server.send_with_str(&json_str);
            }

            let join_msg = SignalingMessage::Join {
                room_id: String::new(),
                peer_id: peer_id.clone(),
            };
            if let Ok(json_str) = serde_json::to_string(&join_msg) {
                for ws in self.state.get_websockets_with_tag("all") {
                    if let Some(att) = ws
                        .deserialize_attachment::<PeerAttachment>()
                        .ok()
                        .flatten()
                    {
                        if att.peer_id != peer_id && matches!(att.status, PeerStatus::Active) {
                            let _ = ws.send_with_str(&json_str);
                        }
                    }
                }
            }

            Response::from_websocket(client)
        } else {
            Response::ok("Room Durable Object - WebSocket endpoint")
        }
    }

    async fn websocket_message(
        &self,
        ws: WebSocket,
        message: WebSocketIncomingMessage,
    ) -> Result<()> {
        let text = match message {
            WebSocketIncomingMessage::String(s) => s,
            WebSocketIncomingMessage::Binary(b) => String::from_utf8_lossy(&b).to_string(),
        };

        if text.trim().is_empty() {
            return Ok(());
        }

        // -- Payload Size Guard --
        if text.len() > MAX_PAYLOAD_BYTES {
            let err = SignalingMessage::Error {
                message: "Message too large".to_string(),
            };
            if let Ok(json_str) = serde_json::to_string(&err) {
                let _ = ws.send_with_str(&json_str);
            }
            return Ok(());
        }

        // -- Rate Limiting (sliding window via attachment) --
        let mut attachment: PeerAttachment = ws
            .deserialize_attachment::<PeerAttachment>()
            .ok()
            .flatten()
            .unwrap_or(PeerAttachment {
                peer_id: String::new(),
                msg_count: 0,
                window_start: now_ms(),
                status: PeerStatus::Active,
                joined_at: now_ms(),
                room_type: "match".to_string(),
            });

        let now = now_ms();
        if now - attachment.window_start > 1000 {
            // New 1-second window
            attachment.msg_count = 1;
            attachment.window_start = now;
        } else {
            attachment.msg_count += 1;
            if attachment.msg_count > MAX_MESSAGES_PER_SEC {
                let err = SignalingMessage::Error {
                    message: "Rate limit exceeded".to_string(),
                };
                if let Ok(json_str) = serde_json::to_string(&err) {
                    let _ = ws.send_with_str(&json_str);
                }
                let _ = ws.serialize_attachment(&attachment);
                return Ok(());
            }
        }
        let _ = ws.serialize_attachment(&attachment);

        let from_peer = attachment.peer_id.clone();
        if from_peer.is_empty() {
            return Ok(());
        }

        if matches!(attachment.status, PeerStatus::Waiting) {
            let wait_msg = SignalingMessage::RoomStatus {
                status: "waiting".to_string(),
                active_peers: self.count_active_peers(),
                max_peers: max_peers_for_type(&attachment.room_type),
            };
            if let Ok(json_str) = serde_json::to_string(&wait_msg) {
                let _ = ws.send_with_str(&json_str);
            }
            return Ok(());
        }

        // -- Parse & Route --
        let msg = match serde_json::from_str::<SignalingMessage>(&text) {
            Ok(m) => m,
            Err(e) => {
                // Notify the sender so they can detect protocol mismatches
                let err = SignalingMessage::Error {
                    message: format!("Invalid message format: {}", e),
                };
                if let Ok(json_str) = serde_json::to_string(&err) {
                    let _ = ws.send_with_str(&json_str);
                }
                return Ok(());
            }
        };

        match msg {
            SignalingMessage::Offer {
                to,
                payload,
                room_id,
                ..
            } => {
                self.forward_to_peer(
                    &to,
                    SignalingMessage::Offer {
                        from: from_peer,
                        to: to.clone(),
                        payload,
                        room_id,
                    },
                );
            }
            SignalingMessage::Answer {
                to,
                payload,
                room_id,
                ..
            } => {
                self.forward_to_peer(
                    &to,
                    SignalingMessage::Answer {
                        from: from_peer,
                        to: to.clone(),
                        payload,
                        room_id,
                    },
                );
            }
            SignalingMessage::IceCandidate {
                to,
                payload,
                room_id,
                ..
            } => {
                self.forward_to_peer(
                    &to,
                    SignalingMessage::IceCandidate {
                        from: from_peer,
                        to: to.clone(),
                        payload,
                        room_id,
                    },
                );
            }
            SignalingMessage::Relay {
                to,
                via,
                payload,
                hop_count,
                timestamp,
                ..
            } => {
                // -- Hop Count Validation --
                if hop_count >= MAX_RELAY_HOPS {
                    let err = SignalingMessage::Error {
                        message: "Relay hop limit exceeded".to_string(),
                    };
                    if let Ok(json_str) = serde_json::to_string(&err) {
                        let _ = ws.send_with_str(&json_str);
                    }
                    return Ok(());
                }
                let target = if from_peer == via { &to } else { &via };
                self.forward_to_peer(
                    target,
                    SignalingMessage::Relay {
                        from: from_peer,
                        to: to.clone(),
                        via: via.clone(),
                        payload,
                        hop_count: hop_count + 1,
                        timestamp,
                    },
                );
            }
            SignalingMessage::Chat { to, payload, .. } => {
                if to.is_empty() || to == "all" {
                    self.broadcast_except(
                        &from_peer,
                        SignalingMessage::Chat {
                            from: from_peer.clone(),
                            to: String::new(),
                            payload,
                        },
                    );
                } else {
                    self.forward_to_peer(
                        &to,
                        SignalingMessage::Chat {
                            from: from_peer,
                            to: to.clone(),
                            payload,
                        },
                    );
                }
            }
            SignalingMessage::Typing { to, typing, .. } => {
                if to.is_empty() || to == "all" {
                    self.broadcast_except(
                        &from_peer,
                        SignalingMessage::Typing {
                            from: from_peer.clone(),
                            to: String::new(),
                            typing,
                        },
                    );
                } else {
                    self.forward_to_peer(
                        &to,
                        SignalingMessage::Typing {
                            from: from_peer,
                            to: to.clone(),
                            typing,
                        },
                    );
                }
            }
            SignalingMessage::PublishKeys { bundle, .. } => {
                // Broadcast key publication to all other peers in the room
                let msg = SignalingMessage::PublishKeys {
                    from: from_peer.clone(),
                    bundle,
                };
                if let Ok(json_str) = serde_json::to_string(&msg) {
                    for ws_other in self.state.get_websockets_with_tag("all") {
                        if let Some(att) = ws_other
                            .deserialize_attachment::<PeerAttachment>()
                            .ok()
                            .flatten()
                        {
                            if att.peer_id != from_peer {
                                let _ = ws_other.send_with_str(&json_str);
                            }
                        }
                    }
                }
            }
            SignalingMessage::RequestKeys { to, .. } => {
                self.forward_to_peer(
                    &to,
                    SignalingMessage::RequestKeys {
                        from: from_peer,
                        to: to.clone(),
                    },
                );
            }
            SignalingMessage::KeysResponse { to, bundle, .. } => {
                self.forward_to_peer(
                    &to,
                    SignalingMessage::KeysResponse {
                        from: from_peer,
                        to: to.clone(),
                        bundle,
                    },
                );
            }
            SignalingMessage::SignalHandshake { to, initiation, .. } => {
                self.forward_to_peer(
                    &to,
                    SignalingMessage::SignalHandshake {
                        from: from_peer,
                        to: to.clone(),
                        initiation,
                    },
                );
            }
            SignalingMessage::FriendRequest {
                to,
                action,
                username,
                avatar_seed,
                ..
            } => {
                self.forward_to_peer(
                    &to,
                    SignalingMessage::FriendRequest {
                        from: from_peer,
                        to: to.clone(),
                        action,
                        username,
                        avatar_seed,
                    },
                );
            }
            SignalingMessage::ScreenShare { to, sharing, .. } => {
                self.forward_to_peer(
                    &to,
                    SignalingMessage::ScreenShare {
                        from: from_peer,
                        to: to.clone(),
                        sharing,
                    },
                );
            }
            // E2E encrypted envelope — opaque relay, server cannot inspect.
            SignalingMessage::Encrypted { to, payload, .. } => {
                self.forward_to_peer(
                    &to,
                    SignalingMessage::Encrypted {
                        from: from_peer,
                        to: to.clone(),
                        payload,
                    },
                );
            }
            // X25519 public key exchange for E2E signaling encryption.
            SignalingMessage::KeyExchange { to, payload, .. } => {
                if to.is_empty() {
                    // Broadcast to all peers in room
                    self.broadcast_except(
                        &from_peer,
                        SignalingMessage::KeyExchange {
                            from: from_peer.clone(),
                            to: String::new(),
                            payload,
                        },
                    );
                } else {
                    self.forward_to_peer(
                        &to,
                        SignalingMessage::KeyExchange {
                            from: from_peer,
                            to: to.clone(),
                            payload,
                        },
                    );
                }
            }
            // PeerList, Leave, Error are server->client only, ignore from clients
            _ => {}
        }

        Ok(())
    }

    async fn websocket_close(
        &self,
        ws: WebSocket,
        _code: usize,
        _reason: String,
        _was_clean: bool,
    ) -> Result<()> {
        self.handle_socket_gone(ws).await
    }

    async fn websocket_error(
        &self,
        ws: WebSocket,
        _error: worker::Error,
    ) -> Result<()> {
        self.handle_socket_gone(ws).await
    }
}

impl RoomDurableObject {
    /// Shared handler for websocket_close and websocket_error.
    /// Broadcasts Leave to remaining peers only when this peer has no other sockets.
    async fn handle_socket_gone(&self, ws: WebSocket) -> Result<()> {
        let peer_id: String = ws
            .deserialize_attachment::<PeerAttachment>()
            .ok()
            .flatten()
            .map(|a| a.peer_id)
            .unwrap_or_default();

        if peer_id.is_empty() {
            return Ok(());
        }

        // BUG FIX: The closing socket is still included in get_websockets_with_tag()
        // during this handler. Previously `.any(|_| true)` ALWAYS returned true,
        // so Leave was NEVER broadcast. Fix: count > 1 means other sockets remain.
        let tagged_count = self
            .state
            .get_websockets_with_tag(&peer_id)
            .len();
        if tagged_count > 1 {
            // Other connections from this peer still exist — don't broadcast Leave
            return Ok(());
        }

        // Broadcast Leave to remaining peers
        let leave_msg = SignalingMessage::Leave {
            peer_id: peer_id.clone(),
        };
        if let Ok(json_str) = serde_json::to_string(&leave_msg) {
            for other_ws in self.state.get_websockets_with_tag("all") {
                if let Some(att) = other_ws
                    .deserialize_attachment::<PeerAttachment>()
                    .ok()
                    .flatten()
                {
                    if att.peer_id != peer_id && matches!(att.status, PeerStatus::Active) {
                        let _ = other_ws.send_with_str(&json_str);
                    }
                }
            }
        }

        let room_type = self
            .state
            .storage()
            .get::<String>("room_type")
            .await?
            .unwrap_or_else(|| "match".to_string());
        if room_type == "help" {
            self.promote_waiting_peer().await?;
        }

        Ok(())
    }
    /// O(1) targeted message delivery using WebSocket tags.
    /// Sends to ALL sockets tagged with the peer_id — handles the case where a peer
    /// has multiple connections (e.g., from rapid reconnects or React StrictMode).
    fn forward_to_peer(&self, target_peer_id: &str, message: SignalingMessage) {
        if let Ok(json_str) = serde_json::to_string(&message) {
            let tagged = self.state.get_websockets_with_tag(target_peer_id);
            for ws in tagged {
                let _ = ws.send_with_str(&json_str);
            }
        }
    }

    /// Broadcast a message to all peers in the room except the sender.
    fn broadcast_except(&self, sender_peer_id: &str, message: SignalingMessage) {
        if let Ok(json_str) = serde_json::to_string(&message) {
            for ws_other in self.state.get_websockets_with_tag("all") {
                if let Some(att) = ws_other
                    .deserialize_attachment::<PeerAttachment>()
                    .ok()
                    .flatten()
                {
                    if att.peer_id != sender_peer_id && matches!(att.status, PeerStatus::Active) {
                        let _ = ws_other.send_with_str(&json_str);
                    }
                }
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum PeerStatus {
    Active,
    Waiting,
}

impl Default for PeerStatus {
    fn default() -> Self {
        Self::Active
    }
}

impl RoomDurableObject {
    fn count_active_peers(&self) -> usize {
        self.state
            .get_websockets()
            .iter()
            .filter_map(|ws| ws.deserialize_attachment::<PeerAttachment>().ok().flatten())
            .filter(|a| matches!(a.status, PeerStatus::Active))
            .map(|a| a.peer_id)
            .collect::<std::collections::HashSet<_>>()
            .len()
    }

    fn is_admin_allowed(&self, access_key: Option<&str>) -> bool {
        let Some(key) = access_key else { return false };
        let direct = self
            .env
            .var("ADMIN_ROOM_KEY")
            .ok()
            .map(|v| v.to_string())
            .unwrap_or_default();
        if !direct.is_empty() && key == direct {
            return true;
        }
        let list = self
            .env
            .var("ADMIN_ROOM_KEYS")
            .ok()
            .map(|v| v.to_string())
            .unwrap_or_default();
        if list.is_empty() {
            return false;
        }
        list.split(',')
            .map(|item| item.trim())
            .any(|item| !item.is_empty() && item == key)
    }

    async fn promote_waiting_peer(&self) -> Result<()> {
        let mut waiting: Vec<(WebSocket, PeerAttachment)> = self
            .state
            .get_websockets()
            .iter()
            .filter_map(|ws| {
                ws.deserialize_attachment::<PeerAttachment>()
                    .ok()
                    .flatten()
                    .filter(|a| matches!(a.status, PeerStatus::Waiting))
                    .map(|a| (ws.clone(), a))
            })
            .collect();

        if waiting.is_empty() {
            return Ok(());
        }

        waiting.sort_by_key(|(_, a)| a.joined_at);
        let (ws, mut attachment) = waiting[0].clone();
        attachment.status = PeerStatus::Active;
        ws.serialize_attachment(&attachment)?;

        let active_peers = self.count_active_peers();
        let max_peers = max_peers_for_type(&attachment.room_type);

        let status_msg = SignalingMessage::RoomStatus {
            status: "admitted".to_string(),
            active_peers,
            max_peers,
        };
        if let Ok(json_str) = serde_json::to_string(&status_msg) {
            let _ = ws.send_with_str(&json_str);
        }

        let peer_list: Vec<String> = {
            let mut seen = std::collections::HashSet::new();
            self.state
                .get_websockets()
                .iter()
                .filter_map(|ws| {
                    ws.deserialize_attachment::<PeerAttachment>()
                        .ok()
                        .flatten()
                })
                .filter(|a| matches!(a.status, PeerStatus::Active))
                .map(|a| a.peer_id)
                .filter(|id| seen.insert(id.clone()))
                .collect()
        };
        let peer_list_msg = SignalingMessage::PeerList { peers: peer_list };
        if let Ok(json_str) = serde_json::to_string(&peer_list_msg) {
            let _ = ws.send_with_str(&json_str);
        }

        let join_msg = SignalingMessage::Join {
            room_id: String::new(),
            peer_id: attachment.peer_id.clone(),
        };
        if let Ok(json_str) = serde_json::to_string(&join_msg) {
            for other_ws in self.state.get_websockets_with_tag("all") {
                if let Some(att) = other_ws
                    .deserialize_attachment::<PeerAttachment>()
                    .ok()
                    .flatten()
                {
                    if att.peer_id != attachment.peer_id && matches!(att.status, PeerStatus::Active) {
                        let _ = other_ws.send_with_str(&json_str);
                    }
                }
            }
        }

        Ok(())
    }
}

fn now_ms() -> u64 {
    js_sys::Date::now() as u64
}

fn default_room_type() -> String {
    "match".to_string()
}

fn max_peers_for_type(room_type: &str) -> usize {
    match room_type {
        "private" => MAX_PRIVATE_ROOM_PEERS,
        "help" => MAX_HELP_ROOM_PEERS,
        "admin" => MAX_ADMIN_ROOM_PEERS,
        _ => MAX_PEERS_PER_ROOM,
    }
}

#[event(fetch)]
pub async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let path = req.path();
    let method = req.method();

    // -- CORS Preflight (zero DO cost) --
    if method == Method::Options {
        return cors_preflight();
    }

    let result = async {
        match path.as_str() {
            "/" => Response::ok("BuzzU Signaling Server v2.0"),
            "/health" => {
                Response::from_json(&json!({
                    "status": "ok",
                    "version": "2.0.0",
                    "timestamp": now_ms()
                }))
            }
            "/ice-servers" => handle_ice_servers(&req, env).await,
            _ if path.starts_with("/room/") => {
                let room_id = path
                    .strip_prefix("/room/")
                    .and_then(|p| p.strip_suffix("/websocket").or(Some(p)))
                    .unwrap_or("default");

                // Validate room_id format (prevent DO namespace pollution)
                if room_id.len() > 128 || room_id.is_empty() {
                    return Response::error("Invalid room ID", 400);
                }

                let namespace = env.durable_object("ROOMS")?;
                let id = namespace.id_from_name(room_id)?;
                let stub = id.get_stub()?;

                stub.fetch_with_request(req).await
            }
            _ => Response::error("Not Found", 404),
        }
    }
    .await;

    let response = match result {
        Ok(res) => res,
        Err(_) => Response::error("Internal Server Error", 500)?,
    };

    // Skip CORS for WebSocket upgrades (101)
    if response.status_code() == 101 {
        return Ok(response);
    }

    let cors = Cors::default()
        .with_origins(vec!["*"])
        .with_methods(vec![
            Method::Get,
            Method::Post,
            Method::Options,
            Method::Head,
        ])
        .with_allowed_headers(vec!["Content-Type", "Upgrade", "Connection"])
        .with_max_age(86400);

    response.with_cors(&cors)
}

fn cors_preflight() -> Result<Response> {
    let mut r = Response::ok("")?;
    let headers = r.headers_mut();
    headers.set("Access-Control-Allow-Origin", "*")?;
    headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS, HEAD, UPGRADE",
    )?;
    headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Upgrade, Connection",
    )?;
    headers.set("Access-Control-Max-Age", "86400")?;
    Ok(r)
}

/// ICE server credential endpoint.
/// Protected: requires Origin header from known domain.
async fn handle_ice_servers(req: &Request, env: Env) -> Result<Response> {
    // -- Origin Check: reject unknown origins --
    let origin = req.headers().get("Origin")?.unwrap_or_default();
    let referer = req.headers().get("Referer")?.unwrap_or_default();
    // Empty origin is allowed for same-origin requests (browser omits it),
    // but "null" origin must be rejected (opaque origins from sandboxed iframes).
    let is_allowed = origin.is_empty()
        || origin.contains("buzzu")
        || origin.contains("localhost")
        || origin.contains("127.0.0.1")
        || referer.contains("buzzu");

    if !is_allowed || origin == "null" {
        return Response::error("Forbidden", 403);
    }

    let turn_token_id = match env.var("TURN_TOKEN_ID") {
        Ok(v) => v.to_string(),
        Err(_) => {
            return Response::from_json(&json!({
                "iceServers": [
                    { "urls": "stun:stun.l.google.com:19302" },
                    { "urls": "stun:stun.cloudflare.com:3478" }
                ]
            }));
        }
    };
    let turn_api_token = match env.var("TURN_API_TOKEN") {
        Ok(v) => v.to_string(),
        Err(_) => {
            return Response::from_json(&json!({
                "iceServers": [
                    { "urls": "stun:stun.l.google.com:19302" },
                    { "urls": "stun:stun.cloudflare.com:3478" }
                ]
            }));
        }
    };

    let url = format!(
        "https://rtc.live.cloudflare.com/v1/turn/keys/{}/credentials/generate-ice-servers",
        turn_token_id
    );

    let headers = Headers::new();
    headers.set("Authorization", &format!("Bearer {}", turn_api_token))?;
    headers.set("Content-Type", "application/json")?;

    let mut init = RequestInit::new();
    init.with_method(Method::Post);
    init.with_headers(headers);
    // Short TTL = less TURN abuse. 4 hours is plenty for a chat session.
    init.with_body(Some(json!({"ttl": 14400}).to_string().into()));

    let req = Request::new_with_init(&url, &init)?;
    let mut res = Fetch::Request(req).send().await?;

    let body = res.text().await?;
    Response::ok(body)
}
