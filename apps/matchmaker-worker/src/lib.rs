use serde::{Deserialize, Serialize};
use worker::*;
use base64::{Engine as _, engine::general_purpose};
use std::collections::{HashMap, HashSet};
use std::cell::RefCell;
use sha2::{Sha256, Digest};

// -- Free-Tier Guardrails -----------------------------------------------
// Single DO = single-threaded actor. All state is local.
// CF DO free tier: 100K req/day, 1GB storage, 1M WS messages/month.
// Strategy: in-memory queue for hot path, storage for persistence,
// alarm-based cleanup for guaranteed hygiene.
// -----------------------------------------------------------------------

const MAX_SEARCH_REQUESTS_PER_MINUTE: u32 = 30;
const MAX_WAIT_TIME_MS: u64 = 300_000;       // 5 min queue timeout
const MAX_CANDIDATES_TO_EVALUATE: usize = 100;
const MAX_PAYLOAD_BYTES: usize = 16 * 1024;  // 16KB max WS message
const MAX_PROFILE_BYTES: usize = 8 * 1024;   // 8KB max profile size
const CLEANUP_INTERVAL_MS: u64 = 60_000;     // Alarm every 60s

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MatchMessage {
    Search {
        interests: Vec<String>,
        #[serde(default)]
        gender: String,
        #[serde(default = "default_filter")]
        filter: String,
        #[serde(default)]
        is_verified: bool,
        #[serde(default)]
        verified_only: bool,
        #[serde(default = "default_interest_timeout")]
        interest_timeout: u32,
        #[serde(default = "default_chat_mode")]
        chat_mode: String,
        #[serde(default)]
        device_id: String,
        #[serde(default)]
        tab_id: String,
    },
    Match {
        room_id: String,
        peer_id: String,
        partner_id: String,
        #[serde(default)]
        partner_is_verified: bool,
    },
    Waiting {
        position: usize,
    },
    Error {
        message: String,
    },
}

fn default_filter() -> String { "both".to_string() }
fn default_interest_timeout() -> u32 { 10 }
fn default_chat_mode() -> String { "text".to_string() }

fn normalize_interest(raw: &str) -> String {
    let lower = raw.trim().to_lowercase();
    let mut cleaned = String::new();
    let mut last_space = false;
    for ch in lower.chars() {
        if ch.is_ascii_alphanumeric() {
            cleaned.push(ch);
            last_space = false;
        } else if ch.is_whitespace() || ch == '-' || ch == '_' || ch == '/' || ch == '.' {
            if !last_space { cleaned.push(' '); last_space = true; }
        }
    }
    let collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() { return String::new(); }
    match collapsed.as_str() {
        "k pop" => "kpop".to_string(),
        "ai" => "artificial intelligence".to_string(),
        "cs" => "computer science".to_string(),
        "comp sci" => "computer science".to_string(),
        _ => collapsed,
    }
}

fn normalize_interests(interests: &[String]) -> Vec<String> {
    let mut set = HashSet::new();
    for interest in interests {
        let normalized = normalize_interest(interest);
        if !normalized.is_empty() { set.insert(normalized); }
    }
    set.into_iter().collect()
}

fn interest_set(interests: &[String]) -> HashSet<String> {
    interests.iter().cloned().collect()
}

fn now_ms() -> u64 { js_sys::Date::now() as u64 }
fn with_timing(mut resp: Response, start_ms: f64, request_id: &str) -> Result<Response> {
    let dur = js_sys::Date::now() - start_ms;
    let _ = resp.headers_mut().set("Server-Timing", &format!("total;dur={}", dur));
    let _ = resp.headers_mut().set("X-Response-Time-Ms", &format!("{:.2}", dur));
    let _ = resp.headers_mut().set("X-Request-Id", request_id);
    Ok(resp)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaitingUserData {
    pub interests: Vec<String>,
    pub gender: String,
    pub filter: String,
    pub is_verified: bool,
    #[serde(default)]
    pub verified_only: bool,
    #[serde(default)]
    pub queued_at: u64,
    #[serde(default = "default_interest_timeout")]
    pub interest_timeout: u32,
    #[serde(default)]
    pub device_id: String,
    #[serde(default)]
    pub tab_id: String,
    /// Trust score from reputation system (0-100, default 50)
    #[serde(default = "default_trust_score")]
    pub trust_score: f64,
    #[serde(default = "default_chat_mode")]
    pub chat_mode: String,
}

fn default_trust_score() -> f64 { 50.0 }

/// Shadow queue threshold — users below this only match with each other
const SHADOW_TRUST_THRESHOLD: f64 = 20.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchPreferences {
    #[serde(rename = "withInterests")]
    pub with_interests: bool,
    #[serde(rename = "genderFilter")]
    pub gender_filter: Option<String>,
    #[serde(rename = "interestTimeout", default = "default_interest_timeout")]
    pub interest_timeout: u32,
    #[serde(rename = "verifiedOnly", default)]
    pub verified_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPreferences {
    #[serde(rename = "showInterests")]
    pub show_interests: String,
    #[serde(rename = "showPremiumBadge")]
    pub show_premium_badge: String,
    #[serde(rename = "allowFriendRequests")]
    pub allow_friend_requests: bool,
    #[serde(rename = "allowCalls")]
    pub allow_calls: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub id: String,
    pub username: String,
    pub avatar: String,
    pub badges: Vec<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    pub preferences: UserPreferences,
    pub decorations: serde_json::Value,
    pub interests: Vec<String>,
    pub gender: String,
    #[serde(rename = "hasPassword")]
    pub has_password: bool,
    #[serde(rename = "ageVerified")]
    pub age_verified: bool,
    #[serde(rename = "matchPreferences")]
    pub match_preferences: MatchPreferences,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub participants: Vec<Participant>,
    #[serde(rename = "lastMessage")]
    pub last_message: Option<String>,
    pub category: String,
    #[serde(rename = "messageCount")]
    pub message_count: u32,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Participant { pub profile: UserProfile }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Author {
    pub id: String,
    pub username: String,
    pub avatar: String,
    pub badges: Vec<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    pub preferences: UserPreferences,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationMessage {
    pub id: String,
    #[serde(rename = "conversationId")]
    pub conversation_id: String,
    pub author: Author,
    pub content: String,
    #[serde(rename = "type")]
    pub msg_type: String,
    pub attachments: Vec<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    pub status: String,
    pub nonce: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationUser {
    pub id: String,
    pub username: String,
    pub avatar: String,
    pub badges: Vec<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    pub preferences: UserPreferences,
    pub decorations: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Relationship {
    pub id: String,
    pub status: u32,
    pub user: RelationUser,
    pub since: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationResponse {
    #[serde(rename = "unreadCount")]
    pub unread_count: u32,
    pub notifications: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchUser {
    #[serde(rename = "userId")]
    pub user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inactive: Option<bool>,
    #[serde(rename = "lastSeen", skip_serializing_if = "Option::is_none")]
    pub last_seen: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClosureStatus { pub closed: bool }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveMatch {
    pub conversation: Conversation,
    #[serde(rename = "commonInterests")]
    pub common_interests: Vec<String>,
    pub users: Vec<MatchUser>,
    pub closure: ClosureStatus,
    pub paused: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveMatchResponse {
    #[serde(rename = "match", skip_serializing_if = "Option::is_none")]
    pub match_data: Option<ActiveMatch>,
    #[serde(rename = "inQueue")]
    pub in_queue: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchRequest {
    #[serde(rename = "withInterests")]
    pub with_interests: bool,
}

/// Per-peer WS attachment. Survives hibernation. Max 2,048 bytes.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PeerWsAttachment {
    peer_id: String,
    msg_count: u32,
    window_start: u64,
}

#[durable_object]
pub struct MatchmakerLobby {
    state: State,
    env: Env,
    waiting_users: RefCell<HashMap<String, WaitingUserData>>,
    interest_index: RefCell<HashMap<String, Vec<String>>>,
    hydrated: RefCell<bool>,
}

impl DurableObject for MatchmakerLobby {
    fn new(state: State, env: Env) -> Self {
        Self {
            state,
            env,
            waiting_users: RefCell::new(HashMap::new()),
            interest_index: RefCell::new(HashMap::new()),
            hydrated: RefCell::new(false),
        }
    }

    async fn fetch(&self, req: Request) -> Result<Response> {
        let start_ms = js_sys::Date::now();
        let request_id = uuid::Uuid::new_v4().to_string();
        let mut req = req;
        let url = req.url()?;
        let path = url.path().to_string();
        let method = req.method();

        let response_result = async {
            let upgrade = req.headers().get("Upgrade")?;
            if upgrade.map(|u| u == "websocket").unwrap_or(false) {
                let WebSocketPair { client, server } = WebSocketPair::new()?;

                let ws_auth_required = self.env.var("WS_AUTH_REQUIRED")
                    .ok()
                    .map(|v| v.to_string())
                    .unwrap_or_default()
                    .to_lowercase();

                let query_peer_id = url.query_pairs()
                    .find(|(k, _)| k == "peer_id")
                    .map(|(_, v)| v.to_string());

                let token_peer_id = if ws_auth_required == "true" {
                    let jwt_secret = resolve_jwt_secret(&self.env, &url)?;
                    let token = url.query_pairs()
                        .find(|(k, _)| k == "token")
                        .map(|(_, v)| v.to_string())
                        .unwrap_or_default();
                    if token.is_empty() {
                        return Response::error("Missing token", 401);
                    }
                    decode_token(&token, &jwt_secret).ok_or_else(|| worker::Error::from("Invalid token"))?
                } else {
                    String::new()
                };

                let peer_id = if !token_peer_id.is_empty() {
                    if let Some(ref query_id) = query_peer_id {
                        if query_id != &token_peer_id {
                            return Response::error("Session mismatch", 403);
                        }
                    }
                    token_peer_id
                } else if let Some(query_id) = query_peer_id {
                    query_id
                } else {
                    format!("peer_{}", uuid::Uuid::new_v4())
                };

                if peer_id.len() > 128 {
                    return Response::error("Invalid peer ID", 400);
                }

                // Evict duplicate sockets for this peer (prevents ghost connections)
                for old_ws in self.state.get_websockets_with_tag(&peer_id) {
                    let _ = old_ws.close(Some(4000), Some("Duplicate connection — replaced by new tab"));
                }

                self.state.accept_websocket_with_tags(&server, &[&peer_id, "lobby"]);

                let attachment = PeerWsAttachment {
                    peer_id: peer_id.clone(),
                    msg_count: 0,
                    window_start: now_ms(),
                };
                server.serialize_attachment(&attachment)?;

                if let Ok(auto) = WebSocketRequestResponsePair::new("ping", "pong") {
                    self.state.set_websocket_auto_response(&auto);
                }

                self.ensure_alarm().await;
                return Response::from_websocket(client);
            }

            // JSON API
            let query_peer_id = url.query_pairs()
                .find(|(k, _)| k == "peer_id")
                .map(|(_, v)| v.to_string());

            let jwt_secret = resolve_jwt_secret(&self.env, &url)?;

            let cookie_peer_result = get_peer_id_from_cookie(&req, &jwt_secret);

            let peer_id = match (&cookie_peer_result, &query_peer_id) {
                (Ok(Some(c)), Some(q)) if c != q => {
                    return Response::error("Session mismatch", 403);
                }
                (Ok(Some(c)), _) => c.clone(),
                (Err(_), _) => return Response::error("Invalid session", 401),
                (Ok(None), Some(q)) => q.clone(),
                _ => String::new(),
            };

            if peer_id.is_empty() {
                return Response::error("Missing authentication", 401);
            }
            if peer_id.len() > 128 {
                return Response::error("Invalid peer ID", 400);
            }

            let gender = url.query_pairs()
                .find(|(k, _)| k == "gender")
                .map(|(_, v)| v.to_string())
                .unwrap_or_else(|| "M".to_string());

            let mut response = if method == Method::Get && path == "/match" {
                Response::ok("BuzzU Matchmaker Online").unwrap()
            } else if method == Method::Post && path == "/match" {
                let match_req = req.json::<MatchRequest>().await?;
                let storage = self.state.storage();

                let match_key = format!("active_match:{}", peer_id);
                if let Ok(Some(active_match)) = storage.get::<ActiveMatch>(&match_key).await {
                    if !active_match.closure.closed {
                        return Ok(Response::from_json(&serde_json::json!({"matched": true}))?.with_status(201));
                    }
                }

                let profile_key = format!("profile:{}", peer_id);
                let profile = storage.get::<UserProfile>(&profile_key).await.ok().flatten();
                let match_preferences = profile.as_ref().map(|p| p.match_preferences.clone()).unwrap_or(MatchPreferences {
                    with_interests: match_req.with_interests,
                    gender_filter: None,
                    interest_timeout: default_interest_timeout(),
                    verified_only: false,
                });
                let profile_verified = profile.as_ref().map(|p| p.age_verified).unwrap_or(false);

                let mut interests = vec![];
                if match_preferences.with_interests {
                    if let Some(p) = profile.as_ref() { interests = p.interests.clone(); }
                }
                let normalized_interests = normalize_interests(&interests);

                let wait_key = format!("waiting:{}", peer_id);
                let _ = storage.delete(&match_key).await;

                self.ensure_hydrated().await;

                if let Some(existing) = self.waiting_users.borrow_mut().remove(&peer_id) {
                    self.remove_from_index(&peer_id, &existing.interests);
                }

                let mut g = "U".to_string();
                let mut f = "both".to_string();
                if let Some(p) = profile.as_ref() {
                    g = p.gender.clone();
                    f = p.match_preferences.gender_filter.clone().unwrap_or_else(|| "both".to_string());
                }

                let waiting_data = WaitingUserData {
                    interests: normalized_interests.clone(), gender: g, filter: f,
                    is_verified: profile_verified, verified_only: match_preferences.verified_only,
                    queued_at: now_ms(), interest_timeout: match_preferences.interest_timeout,
                    device_id: String::new(),
                    tab_id: String::new(),
                    trust_score: default_trust_score(), // TODO: fetch from reputation worker via service binding
                    chat_mode: "text".to_string(), // Default fallback for raw REST trigger
                };
                let _ = storage.put(&wait_key, &waiting_data).await;
                self.waiting_users.borrow_mut().insert(peer_id.to_string(), waiting_data.clone());
                self.add_to_index(&peer_id, &waiting_data.interests);

                Response::from_json(&serde_json::json!({"matched": true}))?.with_status(201)
            } else if (method == Method::Patch || method == Method::Post || method == Method::Get) && path.starts_with("/match/disconnect") {
                self.handle_patch_match_disconnect(&peer_id).await?
            } else if method == Method::Get && path == "/users/me" {
                self.handle_get_profile(&peer_id, &gender).await?
            } else if method == Method::Post && path == "/users/me" {
                self.handle_post_profile(&peer_id, req).await?
            } else if method == Method::Get && path == "/match/active" {
                self.handle_get_active_match(&peer_id).await?
            } else if method == Method::Patch && path.starts_with("/users/me/conversations/") && path.ends_with("/read") {
                let parts: Vec<&str> = path.split('/').collect();
                if parts.len() >= 5 {
                    self.handle_patch_conversation_read(&peer_id, parts[4].to_string(), req).await?
                } else { return Response::error("Bad Request", 400); }
            } else if method == Method::Post && path.starts_with("/users/me/conversations/") && path.ends_with("/messages") {
                let parts: Vec<&str> = path.split('/').collect();
                if parts.len() >= 5 {
                    self.handle_post_conversation_message(&peer_id, parts[4].to_string(), req).await?
                } else { return Response::error("Bad Request", 400); }
            } else if method == Method::Get && path == "/users/me/relationships" {
                self.handle_get_relationships(&peer_id).await?
            } else if method == Method::Post && path == "/users/me/relationships" {
                self.handle_post_relationships(&peer_id, req).await?
            } else if method == Method::Get && path == "/users/me/notifications" {
                self.handle_get_notifications(&peer_id).await?
            } else {
                return Response::error("Not Found", 404);
            };

            if query_peer_id.is_some() && cookie_peer_result.ok().flatten().is_none() {
                let token = create_token(&peer_id, &jwt_secret);
                let is_secure = url.scheme() == "https";
                let host = url.host_str().unwrap_or("buzzu.xyz");
                let domain = if host.contains('.') {
                    let parts: Vec<&str> = host.split('.').collect();
                    if parts.len() >= 2 { format!("; Domain=.{}", parts[parts.len()-2..].join(".")) }
                    else { String::new() }
                } else { String::new() };
                let secure_flag = if is_secure { "; Secure" } else { "" };
                let cookie_str = format!("token={}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000{}{}", token, domain, secure_flag);
                response.headers_mut().set("Set-Cookie", &cookie_str)?;
            }
            Ok(response)
        }.await;

        match response_result {
            Ok(res) => with_timing(res, start_ms, &request_id),
            Err(err) => {
                console_log!("[MatchmakerLobby] Request Error: {:?}", err);
                let resp = Response::error("Internal Server Error", 500).unwrap_or_else(|_| Response::ok("Error").unwrap());
                with_timing(resp, start_ms, &request_id)
            }
        }
    }

    async fn websocket_message(&self, ws: WebSocket, message: WebSocketIncomingMessage) -> Result<()> {
        let text = match message {
            WebSocketIncomingMessage::String(s) => s,
            WebSocketIncomingMessage::Binary(b) => String::from_utf8_lossy(&b).to_string(),
        };

        if text.len() > MAX_PAYLOAD_BYTES {
            let _ = ws.send_with_str(&serde_json::to_string(&MatchMessage::Error {
                message: "Message too large".to_string(),
            }).unwrap_or_default());
            return Ok(());
        }

        let mut attachment: PeerWsAttachment = ws.deserialize_attachment::<PeerWsAttachment>()
            .ok().flatten()
            .unwrap_or(PeerWsAttachment { peer_id: String::new(), msg_count: 0, window_start: now_ms() });

        let now = now_ms();
        if now - attachment.window_start > 60_000 {
            attachment.msg_count = 1;
            attachment.window_start = now;
        } else {
            attachment.msg_count += 1;
            if attachment.msg_count > MAX_SEARCH_REQUESTS_PER_MINUTE {
                let _ = ws.send_with_str(&serde_json::to_string(&MatchMessage::Error {
                    message: "Too many requests. Please wait.".to_string(),
                }).unwrap_or_default());
                let _ = ws.serialize_attachment(&attachment);
                return Ok(());
            }
        }
        let _ = ws.serialize_attachment(&attachment);

        let peer_id = attachment.peer_id.clone();
        if peer_id.is_empty() { return Ok(()); }

        if let Ok(msg) = serde_json::from_str::<MatchMessage>(&text) {
            match msg {
                MatchMessage::Search { interests, gender, filter, is_verified, verified_only, interest_timeout, chat_mode, device_id, tab_id } => {
                    self.ensure_hydrated().await;
                    self.handle_search(&peer_id, &ws, interests, gender, filter, is_verified, verified_only, interest_timeout, chat_mode, device_id, tab_id).await?;
                }
                _ => {}
            }
        }
        Ok(())
    }

    async fn websocket_close(&self, ws: WebSocket, _code: usize, _reason: String, _was_clean: bool) -> Result<()> {
        let peer_id: String = ws.deserialize_attachment::<PeerWsAttachment>()
            .ok().flatten().map(|a| a.peer_id).unwrap_or_default();
        if !peer_id.is_empty() {
            let _ = self.state.storage().delete(&format!("waiting:{}", peer_id)).await;
            if let Some(data) = self.waiting_users.borrow_mut().remove(&peer_id) {
                self.remove_from_index(&peer_id, &data.interests);
            }
        }
        Ok(())
    }

    async fn websocket_error(&self, ws: WebSocket, _error: worker::Error) -> Result<()> {
        let peer_id: String = ws.deserialize_attachment::<PeerWsAttachment>()
            .ok().flatten().map(|a| a.peer_id).unwrap_or_default();
        if !peer_id.is_empty() {
            let _ = self.state.storage().delete(&format!("waiting:{}", peer_id)).await;
            if let Some(data) = self.waiting_users.borrow_mut().remove(&peer_id) {
                self.remove_from_index(&peer_id, &data.interests);
            }
        }
        Ok(())
    }

    async fn alarm(&self) -> Result<Response> {
        self.ensure_hydrated().await;
        self.cleanup_inactive_users().await;

        if !self.waiting_users.borrow().is_empty() || !self.state.get_websockets().is_empty() {
            let _ = self.state.storage().set_alarm(std::time::Duration::from_millis(CLEANUP_INTERVAL_MS)).await;
        }
        Response::ok("Cleanup done")
    }
}

impl MatchmakerLobby {
    async fn ensure_hydrated(&self) {
        if *self.hydrated.borrow() { return; }
        // NOTE: Do NOT set hydrated=true here. Another handler could interleave
        // at the await points below and see empty maps. Set it AFTER loading.

        let storage = self.state.storage();
        let mut stale_keys = Vec::new();
        if let Ok(entries) = storage.list_with_options(ListOptions::new().prefix("waiting:")).await {
            for key in entries.keys() {
                if let Ok(k) = key {
                    let key_str: String = k.as_string().unwrap_or_default();
                    if let Some(peer_id) = key_str.strip_prefix("waiting:") {
                        // Prune entries whose WebSocket is dead (e.g. after deploy)
                        let has_socket = !self.state.get_websockets_with_tag(peer_id).is_empty();
                        if !has_socket {
                            stale_keys.push(key_str.clone());
                            continue;
                        }
                        if let Ok(Some(data)) = storage.get::<WaitingUserData>(&key_str).await {
                            if now_ms().saturating_sub(data.queued_at) > MAX_WAIT_TIME_MS {
                                stale_keys.push(key_str);
                                continue;
                            }
                            self.add_to_index(peer_id, &data.interests);
                            self.waiting_users.borrow_mut().insert(peer_id.to_string(), data);
                        }
                    }
                }
            }
        }

        // Batch-delete stale entries
        for key in &stale_keys {
            let _ = storage.delete(key).await;
        }
        if !stale_keys.is_empty() {
            console_log!("[Matchmaker] Hydration pruned {} stale waiting entries", stale_keys.len());
        }

        // Mark hydrated only after all data has been loaded
        *self.hydrated.borrow_mut() = true;
    }

    async fn ensure_alarm(&self) {
        let storage = self.state.storage();
        if let Ok(None) = storage.get_alarm().await {
            let _ = storage.set_alarm(std::time::Duration::from_millis(CLEANUP_INTERVAL_MS)).await;
        }
    }

    fn add_to_index(&self, peer_id: &str, interests: &[String]) {
        let mut index = self.interest_index.borrow_mut();
        for interest in interests {
            let entry = index.entry(interest.clone()).or_insert_with(Vec::new);
            if !entry.iter().any(|id| id == peer_id) { entry.push(peer_id.to_string()); }
        }
    }

    fn remove_from_index(&self, peer_id: &str, interests: &[String]) {
        let mut index = self.interest_index.borrow_mut();
        for interest in interests {
            if let Some(list) = index.get_mut(interest) {
                list.retain(|id| id != peer_id);
                if list.is_empty() { index.remove(interest); }
            }
        }
    }

    async fn cleanup_inactive_users(&self) {
        let now = now_ms();
        let storage = self.state.storage();
        let to_remove: Vec<(String, Vec<String>)> = {
            let waiting = self.waiting_users.borrow();
            waiting.iter()
                .filter(|(_, data)| now.saturating_sub(data.queued_at) > MAX_WAIT_TIME_MS)
                .map(|(id, data)| (id.clone(), data.interests.clone()))
                .collect()
        };

        for (peer_id, interests) in &to_remove {
            self.waiting_users.borrow_mut().remove(peer_id);
            self.remove_from_index(peer_id, interests);
            let _ = storage.delete(&format!("waiting:{}", peer_id)).await;

            let tagged = self.state.get_websockets_with_tag(peer_id);
            for ws in tagged {
                let _ = ws.send_with_str(&serde_json::to_string(&MatchMessage::Error {
                    message: "Queue timeout. Please search again.".to_string(),
                }).unwrap_or_default());
                break;
            }
        }

        if !to_remove.is_empty() {
            console_log!("[Matchmaker] Cleaned up {} expired queue entries", to_remove.len());
        }

        // --- Orphaned match storage cleanup ---
        // Delete active_match entries whose conversation has been closed and the
        // peer has no live socket, or that have been closed for > 10 minutes.
        const MATCH_TTL_MS: f64 = 600_000.0; // 10 min
        if let Ok(entries) = storage.list_with_options(worker::ListOptions::new().prefix("active_match:")).await {
            for key in entries.keys() {
                let key_str: String = match key {
                    Ok(k) => match k.as_string() { Some(s) => s, None => continue },
                    Err(_) => continue,
                };
                if let Ok(Some(active_match)) = storage.get::<ActiveMatch>(&key_str).await {
                    let peer = key_str.trim_start_matches("active_match:");
                    let has_socket = !self.state.get_websockets_with_tag(peer).is_empty();
                    let is_closed = active_match.closure.closed;

                    // Remove if closed + no socket, or closed for > TTL
                    if is_closed && !has_socket {
                        let _ = storage.delete(&key_str).await;
                    } else if is_closed {
                        let updated = js_sys::Date::parse(&active_match.conversation.updated_at);
                        if !updated.is_nan() && (now as f64) - updated > MATCH_TTL_MS {
                            let _ = storage.delete(&key_str).await;
                        }
                    }
                }
            }
        }
    }

    fn quick_compatibility_check(gender: &str, filter: &str, other_gender: &str, other_filter: &str) -> bool {
        let likes_other = match filter { "both" => true, "male" => other_gender == "M", "female" => other_gender == "F", _ => true };
        let other_likes_self = match other_filter { "both" => true, "male" => gender == "M", "female" => gender == "F", _ => true };
        likes_other && other_likes_self
    }

    async fn handle_get_profile(&self, peer_id: &str, gender: &str) -> Result<Response> {
        let storage = self.state.storage();
        let profile = match storage.get::<UserProfile>(&format!("profile:{}", peer_id)).await {
            Ok(Some(p)) => p,
            _ => self.get_default_profile(peer_id, gender),
        };
        Response::from_json(&profile)
    }

    fn get_default_profile(&self, peer_id: &str, gender: &str) -> UserProfile {
        let adjectives = ["brand-new","gentle","curious","mysterious","happy","sleepy","brave","silent"];
        let nouns = ["olive","lavender","cobalt","moon","fox","river","wind","star"];
        let hash: usize = peer_id.bytes().map(|b| b as usize).sum();
        UserProfile {
            id: peer_id.to_string(),
            username: format!("{} {}", adjectives[hash % adjectives.len()], nouns[hash % nouns.len()]),
            avatar: peer_id.to_string(),
            badges: vec![], created_at: String::from(js_sys::Date::new_0().to_iso_string()),
            preferences: UserPreferences { show_interests: "FRIENDS".to_string(), show_premium_badge: "PUBLIC".to_string(), allow_friend_requests: true, allow_calls: true },
            decorations: serde_json::Value::Object(serde_json::Map::new()),
            interests: vec![], gender: gender.to_string(), has_password: false, age_verified: false,
            match_preferences: MatchPreferences { with_interests: true, gender_filter: None, interest_timeout: default_interest_timeout(), verified_only: false },
        }
    }

    async fn handle_post_profile(&self, peer_id: &str, mut req: Request) -> Result<Response> {
        let body = req.text().await?;
        if body.len() > MAX_PROFILE_BYTES { return Response::error("Profile too large", 413); }
        let profile: UserProfile = match serde_json::from_str(&body) {
            Ok(p) => p, Err(_) => return Response::error("Invalid profile data", 400),
        };
        if profile.interests.len() > 20 { return Response::error("Too many interests (max 20)", 400); }
        if profile.username.len() > 50 { return Response::error("Username too long (max 50)", 400); }
        self.state.storage().put(&format!("profile:{}", peer_id), &profile).await?;
        Response::from_json(&profile)
    }

    async fn handle_get_relationships(&self, peer_id: &str) -> Result<Response> {
        let rels = self.state.storage().get::<Vec<Relationship>>(&format!("relationships:{}", peer_id)).await?.unwrap_or_default();
        Response::from_json(&rels)
    }

    async fn handle_post_relationships(&self, peer_id: &str, mut req: Request) -> Result<Response> {
        let relations = req.json::<Vec<Relationship>>().await?;
        if relations.len() > 100 { return Response::error("Too many relationships (max 100)", 400); }
        self.state.storage().put(&format!("relationships:{}", peer_id), &relations).await?;
        Response::from_json(&relations)
    }

    async fn handle_get_notifications(&self, _peer_id: &str) -> Result<Response> {
        Response::from_json(&NotificationResponse { unread_count: 0, notifications: vec![] })
    }

    async fn handle_post_conversation_message(&self, peer_id: &str, room_id: String, mut req: Request) -> Result<Response> {
        let form = req.form_data().await?;
        let content = form.get("content").and_then(|v| match v { worker::FormEntry::Field(s) => Some(s), _ => None }).unwrap_or_default();
        if content.len() > 4096 { return Response::error("Message too long", 413); }
        let nonce = form.get("nonce").and_then(|v| match v { worker::FormEntry::Field(s) => Some(s), _ => None }).unwrap_or_default();

        let profile = match self.state.storage().get::<UserProfile>(&format!("profile:{}", peer_id)).await {
            Ok(Some(p)) => p, _ => self.get_default_profile(peer_id, "U"),
        };
        let message = ConversationMessage {
            id: format!("msg_{}", uuid::Uuid::new_v4()), conversation_id: room_id,
            author: Author { id: profile.id.clone(), username: profile.username.clone(), avatar: profile.avatar.clone(), badges: profile.badges.clone(), created_at: profile.created_at.clone(), preferences: profile.preferences.clone() },
            content, msg_type: "TEXT".to_string(), attachments: vec![],
            created_at: String::from(js_sys::Date::new_0().to_iso_string()), status: "SENT".to_string(), nonce,
        };
        Response::from_json(&message).map(|r| r.with_status(201))
    }

    async fn handle_patch_conversation_read(&self, peer_id: &str, room_id: String, mut req: Request) -> Result<Response> {
        let conversation: Conversation = req.json().await?;
        let key = format!("active_match:{}", peer_id);
        if let Ok(Some(mut active_match)) = self.state.storage().get::<ActiveMatch>(&key).await {
            if active_match.conversation.id == room_id {
                active_match.conversation = conversation.clone();
                self.state.storage().put(&key, &active_match).await?;
            }
        }
        Response::from_json(&conversation)
    }

    async fn handle_get_active_match(&self, peer_id: &str) -> Result<Response> {
        let storage = self.state.storage();
        let match_data = storage.get::<ActiveMatch>(&format!("active_match:{}", peer_id)).await.ok().flatten();
        let in_queue = if match_data.is_none() {
            storage.get::<WaitingUserData>(&format!("waiting:{}", peer_id)).await.is_ok_and(|opt| opt.is_some())
        } else { false };
        Response::from_json(&ActiveMatchResponse { match_data, in_queue })
    }

    async fn handle_patch_match_disconnect(&self, peer_id: &str) -> Result<Response> {
        let storage = self.state.storage();
        let _ = storage.delete(&format!("waiting:{}", peer_id)).await;
        if let Some(data) = self.waiting_users.borrow_mut().remove(peer_id) {
            self.remove_from_index(peer_id, &data.interests);
        }

        let match_key = format!("active_match:{}", peer_id);
        if let Ok(Some(mut active_match)) = storage.get::<ActiveMatch>(&match_key).await {
            if !active_match.closure.closed {
                active_match.closure.closed = true;
                storage.put(&match_key, &active_match).await?;
                for user in &active_match.users {
                    if user.user_id != peer_id {
                        let _ = storage.put(&format!("active_match:{}", user.user_id), &active_match).await;
                    }
                }
            }
        }
        Response::from_json(&serde_json::json!({}))
    }

    async fn handle_search(&self, peer_id: &str, ws: &WebSocket, interests: Vec<String>, gender: String, filter: String, is_verified: bool, verified_only: bool, interest_timeout: u32, chat_mode: String, device_id: String, tab_id: String) -> Result<()> {
        let storage = self.state.storage();

        if interests.len() > 20 || interests.iter().any(|i| i.len() > 50) {
            let _ = ws.send_with_str(&serde_json::to_string(&MatchMessage::Error {
                message: "Too many interests".to_string(),
            }).unwrap_or_default());
            return Ok(());
        }

        if let Ok(Some(active_match)) = storage.get::<ActiveMatch>(&format!("active_match:{}", peer_id)).await {
            if !active_match.closure.closed { return Ok(()); }
        }

        let profile = storage.get::<UserProfile>(&format!("profile:{}", peer_id)).await.ok().flatten();
        let match_prefs = profile.as_ref().map(|p| p.match_preferences.clone()).unwrap_or(MatchPreferences {
            with_interests: true, gender_filter: None, interest_timeout, verified_only,
        });

        let mut eff_interests = if !interests.is_empty() { interests }
            else if match_prefs.with_interests { profile.as_ref().map(|p| p.interests.clone()).unwrap_or_default() }
            else { vec![] };
        eff_interests = normalize_interests(&eff_interests);

        let eff_verified = profile.as_ref().map(|p| p.age_verified).unwrap_or(is_verified);
        let mut eff_gender = gender;
        if eff_gender.is_empty() { eff_gender = profile.as_ref().map(|p| p.gender.clone()).unwrap_or_else(|| "U".to_string()); }
        let mut eff_filter = filter;
        if eff_filter.is_empty() { eff_filter = profile.as_ref().and_then(|p| p.match_preferences.gender_filter.clone()).unwrap_or_else(|| "both".to_string()); }

        let mut existing_queued_at = None;
        if let Some(existing) = self.waiting_users.borrow_mut().remove(peer_id) {
            existing_queued_at = Some(existing.queued_at);
            self.remove_from_index(peer_id, &existing.interests);
        }

        let requester_verified_only = eff_verified && match_prefs.verified_only;
        let now = now_ms();

        if !device_id.is_empty() {
            let waiting = self.waiting_users.borrow();
            let duplicate_device = waiting.iter().any(|(id, data)| id.as_str() != peer_id && data.device_id == device_id);
            if duplicate_device {
                let _ = ws.send_with_str(&serde_json::to_string(&MatchMessage::Error {
                    message: "Multiple tabs detected. Use a different browser or device.".to_string(),
                }).unwrap_or_default());
                return Ok(());
            }
        }

        // OPTIMIZED MATCHING via interest index
        let sorted_candidates = {
            let waiting = self.waiting_users.borrow();
            let own_set = interest_set(&eff_interests);

            let candidate_ids: Vec<String> = if !eff_interests.is_empty() {
                let index = self.interest_index.borrow();
                let mut set = HashSet::new();
                for interest in &eff_interests {
                    if let Some(ids) = index.get(interest) { for id in ids { set.insert(id.clone()); } }
                }
                if set.is_empty() { waiting.keys().cloned().collect() } else { set.into_iter().collect() }
            } else { waiting.keys().cloned().collect() };

            let limited: Vec<_> = candidate_ids.into_iter().filter(|id| id != peer_id).take(MAX_CANDIDATES_TO_EVALUATE).collect();
            // Tuple: (id, shared_interests, partner_verified, shared_count, jaccard, waited_ms, verified_priority, trust_score)
            let mut candidates: Vec<(String, Vec<String>, bool, usize, i64, u64, u8, f64)> = Vec::new();

            // Determine requester's trust level for shadow queue
            let requester_trust = self.waiting_users.borrow().get(peer_id).map(|d| d.trust_score).unwrap_or(50.0);
            let requester_in_shadow = requester_trust < SHADOW_TRUST_THRESHOLD;

            for other_id in limited {
                if let Some(other_data) = waiting.get(&other_id) {
                    if other_data.chat_mode != chat_mode { continue; } // STRICT ISOLATION GUARD
                    if !Self::quick_compatibility_check(&eff_gender, &eff_filter, &other_data.gender, &other_data.filter) { continue; }
                    if !device_id.is_empty() && other_data.device_id == device_id { continue; }
                    if requester_verified_only && !other_data.is_verified { continue; }
                    if other_data.verified_only && !eff_verified { continue; }

                    // Shadow queue: low-trust users only match with each other
                    let other_in_shadow = other_data.trust_score < SHADOW_TRUST_THRESHOLD;
                    if requester_in_shadow != other_in_shadow { continue; }

                    let other_set = interest_set(&other_data.interests);
                    let shared_count = own_set.intersection(&other_set).count();
                    let waited_ms = if other_data.queued_at > 0 { now.saturating_sub(other_data.queued_at) } else { 0 };
                    let allow_zero = other_data.interest_timeout == 0 || waited_ms >= (other_data.interest_timeout as u64 * 1000);
                    let min_shared = if eff_interests.is_empty() || other_data.interests.is_empty() || allow_zero { 0 } else { 1 };
                    if shared_count < min_shared { continue; }

                    let union_count = own_set.union(&other_set).count();
                    let jaccard = if union_count == 0 { 0 } else { ((shared_count as f32 / union_count as f32) * 1000.0) as i64 };
                    let vp = if eff_verified && other_data.is_verified { 1u8 } else { 0 };
                    let shared: Vec<String> = own_set.intersection(&other_set).cloned().collect();
                    candidates.push((other_id.clone(), shared, other_data.is_verified, shared_count, jaccard, waited_ms, vp, other_data.trust_score));
                }
            }

            // Sort: verified first, then shared interests, then jaccard similarity,
            // then trust score (higher = better), then wait time (longer = priority)
            candidates.sort_by(|a, b| {
                b.6.cmp(&a.6)
                    .then_with(|| b.3.cmp(&a.3))
                    .then_with(|| b.4.cmp(&a.4))
                    .then_with(|| b.7.partial_cmp(&a.7).unwrap_or(std::cmp::Ordering::Equal))
                    .then_with(|| b.5.cmp(&a.5))
            });
            candidates
        };

        // Loop through ALL sorted candidates — skip dead sockets, clean them up inline
        for (partner_id, common_interests, partner_is_verified, _, _, _, _, _) in sorted_candidates {
            let partner_sockets = self.state.get_websockets_with_tag(&partner_id);
            if let Some(partner_ws) = partner_sockets.first() {
                {
                    let mut waiting = self.waiting_users.borrow_mut();
                    if let Some(d) = waiting.remove(peer_id) { self.remove_from_index(peer_id, &d.interests); }
                    if let Some(d) = waiting.remove(&partner_id) { self.remove_from_index(&partner_id, &d.interests); }
                }

                let room_id = format!("room_{}", uuid::Uuid::new_v4());
                let ts = String::from(js_sys::Date::new_0().to_iso_string());
                let active_match = ActiveMatch {
                    conversation: Conversation { id: room_id.clone(), participants: vec![], last_message: None, category: "ENCOUNTER".to_string(), message_count: 0, created_at: ts.clone(), updated_at: ts },
                    common_interests, users: vec![
                        MatchUser { user_id: peer_id.to_string(), inactive: None, last_seen: None },
                        MatchUser { user_id: partner_id.clone(), inactive: None, last_seen: None },
                    ], closure: ClosureStatus { closed: false }, paused: false,
                };

                storage.put(&format!("active_match:{}", peer_id), &active_match).await?;
                storage.put(&format!("active_match:{}", partner_id), &active_match).await?;
                let _ = storage.delete(&format!("waiting:{}", peer_id)).await;
                let _ = storage.delete(&format!("waiting:{}", partner_id)).await;

                let _ = ws.send_with_str(&serde_json::to_string(&MatchMessage::Match {
                    room_id: room_id.clone(), peer_id: peer_id.to_string(), partner_id: partner_id.clone(), partner_is_verified,
                }).unwrap_or_default());
                let _ = partner_ws.send_with_str(&serde_json::to_string(&MatchMessage::Match {
                    room_id, peer_id: partner_id.clone(), partner_id: peer_id.to_string(), partner_is_verified: eff_verified,
                }).unwrap_or_default());

                return Ok(());
            } else {
                // Dead socket — evict stale candidate and continue to next
                if let Some(data) = self.waiting_users.borrow_mut().remove(&partner_id) {
                    self.remove_from_index(&partner_id, &data.interests);
                }
                let _ = storage.delete(&format!("waiting:{}", partner_id)).await;
            }
        }

        // No match - add to queue
        let waiting_data = WaitingUserData {
            interests: eff_interests, gender: eff_gender, filter: eff_filter,
            is_verified: eff_verified, verified_only: match_prefs.verified_only,
            queued_at: existing_queued_at.unwrap_or(now), interest_timeout: match_prefs.interest_timeout,
            device_id,
            tab_id,
            trust_score: default_trust_score(), // TODO: fetch from reputation worker via service binding
            chat_mode: chat_mode.clone(),
        };
        self.waiting_users.borrow_mut().insert(peer_id.to_string(), waiting_data.clone());
        self.add_to_index(peer_id, &waiting_data.interests);
        storage.put(&format!("waiting:{}", peer_id), &waiting_data).await?;

        let queue_size = self.waiting_users.borrow().len();
        let _ = ws.send_with_str(&serde_json::to_string(&MatchMessage::Waiting { position: queue_size }).unwrap_or_default());
        Ok(())
    }
}

#[event(fetch)]
pub async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let origin = req.headers().get("Origin").ok().flatten().unwrap_or_else(|| "*".to_string());
    let method = req.method();
    let path = req.path();

    if method == Method::Options {
        return Ok(apply_cors(Response::ok("").unwrap(), &origin));
    }

    let response_result: Result<Response> = async {
        if path.starts_with("/users/me") || path.starts_with("/match") || path == "/" {
            let namespace = env.durable_object("MATCHMAKER_LOBBY")?;
            let id = namespace.id_from_name("global_lobby")?;
            let stub = id.get_stub()?;
            stub.fetch_with_request(req).await
        } else {
            Response::ok("BuzzU Matchmaker Server v2.0")
        }
    }.await;

    let response = response_result.unwrap_or_else(|_| {
        Response::error("Internal Server Error", 500).unwrap_or_else(|_| Response::ok("Failure").unwrap())
    });
    Ok(apply_cors(response, &origin))
}

fn apply_cors(response: Response, origin: &str) -> Response {
    if response.status_code() == 101 { return response; }
    let headers = response.headers().clone();
    let allow_origin = if origin == "*" || origin.is_empty() { "*" } else { origin };
    let _ = headers.set("Access-Control-Allow-Origin", allow_origin);
    if allow_origin != "*" { let _ = headers.set("Access-Control-Allow-Credentials", "true"); }
    let _ = headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PATCH, DELETE, HEAD, UPGRADE");
    let _ = headers.set("Access-Control-Allow-Headers", "Content-Type, Cookie, Upgrade, Connection, Authorization, Accept, X-Requested-With");
    let _ = headers.set("Access-Control-Max-Age", "86400");
    response.with_headers(headers)
}

fn resolve_jwt_secret(env: &Env, url: &Url) -> Result<String> {
    if let Ok(secret) = env.secret("JWT_SECRET") {
        return Ok(secret.to_string());
    }
    let host = url.host_str().unwrap_or_default().to_string();
    let local = host.contains("localhost") || host.contains("127.0.0.1") || host.contains("::1");
    if local {
        Ok(DEFAULT_JWT_SECRET.to_string())
    } else {
        Err(worker::Error::from("JWT_SECRET not configured"))
    }
}

fn get_peer_id_from_cookie(req: &Request, secret: &str) -> Result<Option<String>> {
    let cookie_header = match req.headers().get("Cookie")? { Some(h) => h, None => return Ok(None) };
    for cookie in cookie_header.split(';') {
        let cookie = cookie.trim();
        if cookie.starts_with("token=") {
            let token = &cookie[6..];
            match decode_token(token, secret) { Some(id) => return Ok(Some(id)), None => return Err(worker::Error::from("Invalid token")) }
        }
    }
    Ok(None)
}

/// HMAC-SHA256 secret — MUST be overridden via JWT_SECRET env var in production.
/// This fallback is for local development only.
const DEFAULT_JWT_SECRET: &str = "buzzu_dev_secret_change_in_production_0x42";

fn hmac_sha256(secret: &[u8], message: &[u8]) -> String {
    // HMAC(K, m) = H((K' ^ opad) || H((K' ^ ipad) || m))
    let mut key_padded = [0u8; 64];
    if secret.len() <= 64 {
        key_padded[..secret.len()].copy_from_slice(secret);
    } else {
        let mut h = Sha256::new();
        h.update(secret);
        let hashed = h.finalize();
        key_padded[..32].copy_from_slice(&hashed);
    }

    let mut ipad = [0x36u8; 64];
    let mut opad = [0x5cu8; 64];
    for i in 0..64 {
        ipad[i] ^= key_padded[i];
        opad[i] ^= key_padded[i];
    }

    let mut inner = Sha256::new();
    inner.update(&ipad);
    inner.update(message);
    let inner_hash = inner.finalize();

    let mut outer = Sha256::new();
    outer.update(&opad);
    outer.update(&inner_hash);
    let result = outer.finalize();

    general_purpose::URL_SAFE_NO_PAD.encode(&result)
}

fn create_token(peer_id: &str, secret: &str) -> String {
    let header = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    let iat = (js_sys::Date::now() / 1000.0) as u64;
    let payload_json = format!(r#"{{"userId":"{}","roles":["anonymous"],"iat":{}}}"#, peer_id, iat);
    let payload = general_purpose::URL_SAFE_NO_PAD.encode(payload_json.as_bytes());
    let signing_input = format!("{}.{}", header, payload);
    let signature = hmac_sha256(secret.as_bytes(), signing_input.as_bytes());
    format!("{}.{}", signing_input, signature)
}

fn decode_token(token: &str, secret: &str) -> Option<String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 { return None; }

    // Verify HMAC-SHA256 signature
    let signing_input = format!("{}.{}", parts[0], parts[1]);
    let expected_sig = hmac_sha256(secret.as_bytes(), signing_input.as_bytes());
    
    // Constant-time comparison to prevent timing attacks
    if parts[2].len() != expected_sig.len() { return None; }
    let mut diff = 0u8;
    for (a, b) in parts[2].bytes().zip(expected_sig.bytes()) {
        diff |= a ^ b;
    }
    if diff != 0 {
        // Signature mismatch — token was forged or corrupted
        return None;
    }

    let payload_bytes = general_purpose::URL_SAFE_NO_PAD.decode(parts[1]).ok()?;
    let payload_json = String::from_utf8(payload_bytes).ok()?;
    #[derive(Deserialize)]
    struct Payload { #[serde(rename = "userId")] user_id: String }
    let p: Payload = serde_json::from_str(&payload_json).ok()?;
    Some(p.user_id)
}
