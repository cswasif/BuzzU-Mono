use serde::{Deserialize, Serialize};
use worker::*;
use base64::{Engine as _, engine::general_purpose};
use std::collections::HashMap;
use std::cell::RefCell;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MatchMessage {
    Search { 
        interests: Vec<String>,
        #[serde(default)]
        gender: String,
        #[serde(default = "default_filter")]
        filter: String,
    },
    Match { room_id: String, peer_id: String, partner_id: String },
    Waiting { position: usize },
    Error { message: String },
}

fn default_filter() -> String { "both".to_string() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaitingUserData {
    pub interests: Vec<String>,
    pub gender: String,
    pub filter: String,
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
pub struct MatchPreferences {
    #[serde(rename = "withInterests")]
    pub with_interests: bool,
    #[serde(rename = "genderFilter")]
    pub gender_filter: Option<String>,
    #[serde(rename = "interestTimeout")]
    pub interest_timeout: u32,
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
pub struct Participant {
    pub profile: UserProfile,
}

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
pub struct ClosureStatus {
    pub closed: bool,
}

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

#[durable_object]
pub struct MatchmakerLobby {
    state: State,
    waiting_users: RefCell<HashMap<String, WaitingUserData>>,
}

impl DurableObject for MatchmakerLobby {
    fn new(state: State, _env: Env) -> Self {
        Self { 
            state,
            waiting_users: RefCell::new(HashMap::new()),
        }
    }

    async fn fetch(&self, req: Request) -> Result<Response> {
        let mut req = req;
        let _origin = req.headers().get("Origin")?.unwrap_or_else(|| "*".to_string());
        let url = req.url()?;
        let path = url.path().to_string();
        let method = req.method();

        let response_result = async {
            // Handle WebSocket upgrade
            let upgrade = req.headers().get("Upgrade")?;
            if upgrade.map(|u| u == "websocket").unwrap_or(false) {
                let WebSocketPair { client, server } = WebSocketPair::new()?;
                self.state.accept_web_socket(&server);
                
                let peer_id = url.query_pairs()
                    .find(|(k, _)| k == "peer_id")
                    .map(|(_, v)| v.to_string())
                    .unwrap_or_else(|| format!("peer_{}", uuid::Uuid::new_v4()));
                
                server.serialize_attachment(&peer_id)?;
                return Response::from_websocket(client);
            }

            // Handle JSON API endpoints
            let query_peer_id = url.query_pairs()
                .find(|(k, _)| k == "peer_id")
                .map(|(_, v)| v.to_string());

            let cookie_peer_result = get_peer_id_from_cookie(&req);
            
            // SECURITY: Strict Peer ID validation
            let peer_id = match (&cookie_peer_result, &query_peer_id) {
                // 1. Valid cookie exists: Use it, and if query exists it MUST match
                (Ok(Some(c)), Some(q)) if c != q => {
                    console_log!("[Security] Peer ID mismatch (Cookie: {}, Query: {}). Rejecting.", c, q);
                    return Response::error("Session mismatch", 403);
                }
                (Ok(Some(c)), _) => c.clone(),
                
                // 2. Cookie exists but is INVALID: Reject immediately
                (Err(_), _) => {
                    console_log!("[Security] Invalid token provided. Rejecting.");
                    return Response::error("Invalid session", 401);
                }
                
                // 3. No cookie: Allow query peer_id for first-time session
                (Ok(None), Some(q)) => q.clone(),
                
                _ => String::new(),
            };

            if peer_id.is_empty() {
                return Response::error("Missing authentication", 401);
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
                
                // 1. Prevent "Partner Stealing"
                let match_key = format!("active_match:{}", peer_id);
                if let Ok(Some(active_match)) = storage.get::<ActiveMatch>(&match_key).await {
                    if !active_match.closure.closed {
                        return Ok(Response::from_json(&serde_json::json!({"matched": true}))?.with_status(201));
                    }
                }

                // 2. Protocol Alignment: Fetch real interests if requested
                let mut interests = vec![];
                if match_req.with_interests {
                    let profile_key = format!("profile:{}", peer_id);
                    if let Ok(Some(profile)) = storage.get::<UserProfile>(&profile_key).await {
                        interests = profile.interests;
                    }
                }

                // 3. Update waiting state
                let wait_key = format!("waiting:{}", peer_id);
                let _ = storage.delete(&match_key).await;
                
                // Fetch current gender/filter from profile for storage persistence
                let mut gender = "U".to_string();
                let mut filter = "both".to_string();
                let profile_key = format!("profile:{}", peer_id);
                if let Ok(Some(profile)) = storage.get::<UserProfile>(&profile_key).await {
                    gender = profile.gender;
                    filter = profile.match_preferences.gender_filter.unwrap_or_else(|| "both".to_string());
                }

                let waiting_data = WaitingUserData {
                    interests,
                    gender,
                    filter,
                };
                let _ = storage.put(&wait_key, &waiting_data).await;
                
                Response::from_json(&serde_json::json!({"matched": true}))?
                    .with_status(201)
            } else if method == Method::Patch && path == "/match/disconnect" {
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
                    let room_id = parts[4].to_string();
                    self.handle_patch_conversation_read(&peer_id, room_id, req).await?
                } else {
                    return Response::error("Bad Request", 400);
                }
            } else if method == Method::Post && path.starts_with("/users/me/conversations/") && path.ends_with("/messages") {
                let parts: Vec<&str> = path.split('/').collect();
                if parts.len() >= 5 {
                    let room_id = parts[4].to_string();
                    self.handle_post_conversation_message(&peer_id, room_id, req).await?
                } else {
                    return Response::error("Bad Request", 400);
                }
            } else if method == Method::Get && path == "/users/me/relationships" {
                self.handle_get_relationships(&peer_id).await?
            } else if method == Method::Post && path == "/users/me/relationships" {
                self.handle_post_relationships(&peer_id, req).await?
            } else if method == Method::Get && path == "/users/me/notifications" {
                self.handle_get_notifications(&peer_id).await?
            } else {
                return Response::error("Not Found", 404);
            };

            // If we got a peer_id from query but not from cookie (or it was missing), set the cookie
            if query_peer_id.is_some() && cookie_peer_result.ok().flatten().is_none() {
                let token = create_token(&peer_id);
                // Dynamically detect protocols and host for secure/domain attributes
                let is_secure = url.scheme() == "https";
                let host = url.host_str().unwrap_or("buzzu.xyz");
                let domain = if host.contains(".") {
                    let parts: Vec<&str> = host.split('.').collect();
                    if parts.len() >= 2 {
                        format!("; Domain=.{}", parts[parts.len()-2..].join("."))
                    } else {
                        "".to_string()
                    }
                } else {
                    "".to_string()
                };
                let secure_flag = if is_secure { "; Secure" } else { "" };
                
                let cookie_str = format!("token={}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000{}{}", token, domain, secure_flag);
                response.headers_mut().set("Set-Cookie", &cookie_str)?;
            }

            Ok(response)
        }.await;

        let response = match response_result {
            Ok(res) => res,
            Err(err) => {
                console_log!("[DurableObject] Request Error: {:?}", err);
                Response::error(format!("Lobby Error: {:?}", err), 500).unwrap_or_else(|_| Response::ok("Internal Server Error").unwrap())
            }
        };

        Ok(response)
    }

    async fn websocket_message(&self, ws: WebSocket, message: WebSocketIncomingMessage) -> Result<()> {
        let text = match message {
            WebSocketIncomingMessage::String(s) => s,
            WebSocketIncomingMessage::Binary(b) => String::from_utf8_lossy(&b).to_string(),
        };
        
        let peer_id: String = ws.deserialize_attachment::<String>()
            .ok()
            .flatten()
            .unwrap_or_default();

        if let Ok(msg) = serde_json::from_str::<MatchMessage>(&text) {
            match msg {
                MatchMessage::Search { interests, gender, filter } => {
                    self.handle_search(&peer_id, &ws, interests, gender, filter).await?;
                }
                _ => {}
            }
        }
        
        Ok(())
    }

    async fn websocket_close(&self, ws: WebSocket, _code: usize, _reason: String, _was_clean: bool) -> Result<()> {
        let peer_id: String = ws.deserialize_attachment::<String>()
            .ok()
            .flatten()
            .unwrap_or_default();

        if !peer_id.is_empty() {
            let storage = self.state.storage();
            let _ = storage.delete(&format!("waiting:{}", peer_id)).await;
            self.waiting_users.borrow_mut().remove(&peer_id);
            console_log!("[DurableObject] WebSocket closed for {}, cleaned up waiting state", peer_id);
        }
        Ok(())
    }

    async fn websocket_error(&self, ws: WebSocket, _error: worker::Error) -> Result<()> {
        let peer_id: String = ws.deserialize_attachment::<String>()
            .ok()
            .flatten()
            .unwrap_or_default();

        if !peer_id.is_empty() {
            let storage = self.state.storage();
            let _ = storage.delete(&format!("waiting:{}", peer_id)).await;
            self.waiting_users.borrow_mut().remove(&peer_id);
            console_log!("[DurableObject] WebSocket error for {}, cleaned up waiting state", peer_id);
        }
        Ok(())
    }
}

impl MatchmakerLobby {
    async fn handle_get_profile(&self, peer_id: &str, gender: &str) -> Result<Response> {
        let storage = self.state.storage();
        let key = format!("profile:{}", peer_id);
        
        let profile = match storage.get::<UserProfile>(&key).await {
            Ok(Some(p)) => p,
            _ => self.get_default_profile(peer_id, gender),
        };

        Response::from_json(&profile)
    }

    fn get_default_profile(&self, peer_id: &str, gender: &str) -> UserProfile {
        let adjectives = ["brand-new", "gentle", "curious", "mysterious", "happy", "sleepy", "brave", "silent"];
        let nouns = ["olive", "lavender", "cobalt", "moon", "fox", "river", "wind", "star"];
        
        // Use a simple hash of the peer_id for stable "randomization"
        let hash: usize = peer_id.bytes().map(|b| b as usize).sum();
        let username = format!("{} {}", adjectives[hash % adjectives.len()], nouns[hash % nouns.len()]);

        UserProfile {
            id: peer_id.to_string(),
            username,
            avatar: peer_id.to_string(),
            badges: vec![],
            created_at: String::from(js_sys::Date::new_0().to_iso_string()),
            preferences: UserPreferences {
                show_interests: "FRIENDS".to_string(),
                show_premium_badge: "PUBLIC".to_string(),
                allow_friend_requests: true,
                allow_calls: true,
            },
            decorations: serde_json::Value::Object(serde_json::Map::new()),
            interests: vec![],
            gender: gender.to_string(),
            has_password: false,
            age_verified: false,
            match_preferences: MatchPreferences {
                with_interests: true,
                gender_filter: None,
                interest_timeout: 10,
            },
        }
    }

    async fn handle_post_profile(&self, peer_id: &str, mut req: Request) -> Result<Response> {
        let profile = req.json::<UserProfile>().await?;
        let storage = self.state.storage();
        let key = format!("profile:{}", peer_id);
        
        storage.put(&key, &profile).await?;
        Response::from_json(&profile)
    }

    async fn handle_get_relationships(&self, peer_id: &str) -> Result<Response> {
        let storage = self.state.storage();
        let key = format!("relationships:{}", peer_id);

        let relationships = storage.get::<Vec<Relationship>>(&key).await?.unwrap_or_else(|| vec![]);
        Response::from_json(&relationships)
    }

    async fn handle_post_relationships(&self, peer_id: &str, mut req: Request) -> Result<Response> {
        let relations = req.json::<Vec<Relationship>>().await?;
        let storage = self.state.storage();
        let key = format!("relationships:{}", peer_id);

        storage.put(&key, &relations).await?;
        Response::from_json(&relations)
    }

    async fn handle_get_notifications(&self, _peer_id: &str) -> Result<Response> {
        let response = NotificationResponse {
            unread_count: 0,
            notifications: vec![],
        };
        Response::from_json(&response)
    }

    async fn handle_post_conversation_message(&self, peer_id: &str, room_id: String, mut req: Request) -> Result<Response> {
        let form = req.form_data().await?;
        let content = form.get("content").and_then(|v| match v {
            worker::FormEntry::Field(s) => Some(s),
            _ => None,
        }).unwrap_or_default();
        
        let nonce = form.get("nonce").and_then(|v| match v {
            worker::FormEntry::Field(s) => Some(s),
            _ => None,
        }).unwrap_or_default();

        let storage = self.state.storage();
        
        // Fetch profile to get author details
        let profile_key = format!("profile:{}", peer_id);
        let profile = match storage.get::<UserProfile>(&profile_key).await {
            Ok(Some(p)) => p,
            _ => self.get_default_profile(peer_id, "U"),
        };

        let author = Author {
            id: profile.id.clone(),
            username: profile.username.clone(),
            avatar: profile.avatar.clone(),
            badges: profile.badges.clone(),
            created_at: profile.created_at.clone(),
            preferences: profile.preferences.clone(),
        };

        let message = ConversationMessage {
            id: format!("msg_{}", uuid::Uuid::new_v4()),
            conversation_id: room_id,
            author,
            content,
            msg_type: "TEXT".to_string(),
            attachments: vec![],
            created_at: String::from(js_sys::Date::new_0().to_iso_string()),
            status: "SENT".to_string(),
            nonce,
        };

        Response::from_json(&message)
            .map(|r| r.with_status(201))
    }

    async fn handle_patch_conversation_read(&self, peer_id: &str, room_id: String, mut req: Request) -> Result<Response> {
        let conversation: Conversation = req.json().await?;
        let storage = self.state.storage();
        let key = format!("active_match:{}", peer_id);
        
        if let Ok(Some(mut active_match)) = storage.get::<ActiveMatch>(&key).await {
            if active_match.conversation.id == room_id {
                active_match.conversation = conversation.clone();
                storage.put(&key, &active_match).await?;
            }
        }

        Response::from_json(&conversation)
    }

    async fn handle_get_active_match(&self, peer_id: &str) -> Result<Response> {
        let storage = self.state.storage();
        let key = format!("active_match:{}", peer_id);
        let wait_key = format!("waiting:{}", peer_id);
        
        let match_data = match storage.get::<ActiveMatch>(&key).await {
            Ok(Some(m)) => Some(m),
            _ => None,
        };
        
        let in_queue = if match_data.is_none() {
            storage.get::<WaitingUserData>(&wait_key).await.is_ok_and(|opt| opt.is_some())
        } else {
            false
        };
        
        let response = ActiveMatchResponse {
            match_data,
            in_queue,
        };

        Response::from_json(&response)
    }

    async fn handle_patch_match_disconnect(&self, peer_id: &str) -> Result<Response> {
        let storage = self.state.storage();
        
        // 1. Cleanup Queue State
        let wait_key = format!("waiting:{}", peer_id);
        let _ = storage.delete(&wait_key).await;
        self.waiting_users.borrow_mut().remove(peer_id);

        // 2. Cleanup Active Match
        let match_key = format!("active_match:{}", peer_id);
        if let Ok(Some(mut active_match)) = storage.get::<ActiveMatch>(&match_key).await {
            if !active_match.closure.closed {
                active_match.closure.closed = true;
                storage.put(&match_key, &active_match).await?;

                // Also notify the partner if possible (via storage closure sync)
                for user in &active_match.users {
                    if user.user_id != peer_id {
                        let partner_match_key = format!("active_match:{}", user.user_id);
                        let _ = storage.put(&partner_match_key, &active_match).await;
                    }
                }
            }
        }

        Response::from_json(&serde_json::json!({}))
    }

    async fn handle_search(&self, peer_id: &str, ws: &WebSocket, interests: Vec<String>, gender: String, filter: String) -> Result<()> {
        let storage = self.state.storage();
        
        // 1. Prevent "Partner Stealing"
        if let Ok(Some(active_match)) = storage.get::<ActiveMatch>(&format!("active_match:{}", peer_id)).await {
            if !active_match.closure.closed {
                console_log!("[Matchmaker] Peer {} already in active match. Ignoring Search.", peer_id);
                return Ok(());
            }
        }

        // 2. Performance & Fidelity: Multi-Tier Matching
        let partner_data = {
            let waiting = self.waiting_users.borrow();
            
            // Tier 1: Strict Gender + Shared Interests
            let mut best_match = None;
            let mut max_shared = 0;

            for (other_id, other_data) in waiting.iter() {
                if other_id == peer_id { continue; }
                
                if !is_compatible(&gender, &filter, &other_data.gender, &other_data.filter) {
                    continue;
                }

                let shared: Vec<String> = interests.iter()
                    .filter(|i| other_data.interests.contains(i))
                    .cloned()
                    .collect();
                
                if shared.len() > max_shared {
                    max_shared = shared.len();
                    best_match = Some((other_id.clone(), shared));
                }
            }

            if let Some(m) = best_match {
                Some(m)
            } else {
                // Tier 2: Strict Gender + Any Interests
                let tier2 = waiting.iter()
                    .find(|&(id, data)| id != peer_id && is_compatible(&gender, &filter, &data.gender, &data.filter))
                    .map(|(id, _)| (id.clone(), vec![]));
                
                if tier2.is_some() {
                    tier2
                } else {
                    // Tier 3: Relaxed Fallback (Anyone available)
                    waiting.iter()
                        .find(|&(id, _)| id != peer_id)
                        .map(|(id, _)| (id.clone(), vec![]))
                }
            }
        };

        if let Some((partner_id, common_interests)) = partner_data {
            // Find the socket for this partner
            let websockets = self.state.get_websockets();
            let partner_ws = websockets.iter().find(|w| {
                w.deserialize_attachment::<String>().ok().flatten().unwrap_or_default() == partner_id
            });

            if let Some(partner_ws) = partner_ws {
                // Remove both from waiting list ATOMICALLY (in-memory)
                {
                    let mut waiting = self.waiting_users.borrow_mut();
                    waiting.remove(peer_id);
                    waiting.remove(&partner_id);
                }

                // Match found!
                let room_id = format!("room_{}", uuid::Uuid::new_v4());
                let timestamp = String::from(js_sys::Date::new_0().to_iso_string());

                let active_match = ActiveMatch {
                    conversation: Conversation {
                        id: room_id.clone(),
                        participants: vec![],
                        last_message: None,
                        category: "ENCOUNTER".to_string(),
                        message_count: 0,
                        created_at: timestamp.clone(),
                        updated_at: timestamp.clone(),
                    },
                    common_interests,
                    users: vec![
                        MatchUser { user_id: peer_id.to_string(), inactive: None, last_seen: None },
                        MatchUser { user_id: partner_id.clone(), inactive: None, last_seen: None },
                    ],
                    closure: ClosureStatus { closed: false },
                    paused: false,
                };

                // Persist match state
                storage.put(&format!("active_match:{}", peer_id), &active_match).await?;
                storage.put(&format!("active_match:{}", partner_id), &active_match).await?;

                // Cleanup storage queue
                let _ = storage.delete(&format!("waiting:{}", peer_id)).await;
                let _ = storage.delete(&format!("waiting:{}", partner_id)).await;

                // Notify both
                let _ = ws.send_with_str(&serde_json::to_string(&MatchMessage::Match {
                    room_id: room_id.clone(),
                    peer_id: peer_id.to_string(),
                    partner_id: partner_id.clone(),
                }).unwrap());

                let _ = partner_ws.send_with_str(&serde_json::to_string(&MatchMessage::Match {
                    room_id: room_id.clone(),
                    peer_id: partner_id.clone(),
                    partner_id: peer_id.to_string(),
                }).unwrap());

                ws.close(Some(1000), Some("Match found"))?;
                partner_ws.close(Some(1000), Some("Match found"))?;
                return Ok(());
            } else {
                // Partner socket gone? Remove from in-memory set
                self.waiting_users.borrow_mut().remove(&partner_id);
            }
        }

        // No match found, add to waiting lists with interests and gender data
        let waiting_data = WaitingUserData {
            interests: interests.clone(),
            gender: gender.clone(),
            filter: filter.clone(),
        };
        self.waiting_users.borrow_mut().insert(peer_id.to_string(), waiting_data.clone());
        storage.put(&format!("waiting:{}", peer_id), &waiting_data).await?;
        
        let _ = ws.send_with_str(&serde_json::to_string(&MatchMessage::Waiting { position: 1 }).unwrap());
        Ok(())
    }
}

fn is_compatible(a_gender: &str, a_filter: &str, b_gender: &str, b_filter: &str) -> bool {
    // A's filter must match B's gender
    let a_likes_b = match a_filter {
        "both" => true,
        "male" => b_gender == "M",
        "female" => b_gender == "F",
        _ => true,
    };
    
    // B's filter must match A's gender
    let b_likes_a = match b_filter {
        "both" => true,
        "male" => a_gender == "M",
        "female" => a_gender == "F",
        _ => true,
    };
    
    a_likes_b && b_likes_a
}

#[event(fetch)]
pub async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let origin = req.headers().get("Origin").ok().flatten().unwrap_or_else(|| "*".to_string());
    let method = req.method();
    let path = req.path();
    
    // 1. Handle Options immediately and with CORS
    if method == Method::Options {
        return Ok(apply_cors(Response::ok("").unwrap(), &origin));
    }

    // 2. Wrap the core logic
    let response_result: Result<Response> = async {
        if path.starts_with("/users/me") || path == "/match" || path == "/match/active" {
            let namespace = env.durable_object("MATCHMAKER_LOBBY")?;
            let id = namespace.id_from_name("global_lobby")?;
            let stub = id.get_stub()?;
            stub.fetch_with_request(req).await
        } else {
            Response::ok("BuzzU Matchmaker Server v1.0")
        }
    }.await;

    // 3. Fallback for errors
    let response = response_result.unwrap_or_else(|err| {
        console_log!("[Main] Critical Error: {:?}", err);
        Response::error(format!("Hive Critical Error: {:?}", err), 500).unwrap_or_else(|_| Response::ok("Server Failure").unwrap())
    });

    // 4. Final CORS shield (Now Infallible)
    Ok(apply_cors(response, &origin))
}

fn apply_cors(response: Response, origin: &str) -> Response {
    // Skip CORS for 101 Switching Protocols (WebSockets)
    if response.status_code() == 101 {
        return response;
    }

    let headers = response.headers().clone();

    let allow_origin = if origin == "*" || origin.is_empty() { "*" } else { origin };
    let _ = headers.set("Access-Control-Allow-Origin", allow_origin);

    if allow_origin != "*" {
        let _ = headers.set("Access-Control-Allow-Credentials", "true");
    }

    let _ = headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PATCH, DELETE, HEAD, UPGRADE");
    let _ = headers.set("Access-Control-Allow-Headers", "Content-Type, Cookie, Upgrade, Connection, Authorization, Accept, X-Requested-With");
    let _ = headers.set("Access-Control-Max-Age", "86400");

    // Return a fresh response with the new headers to ensure mutability and inclusion
    response.with_headers(headers)
}


fn get_peer_id_from_cookie(req: &Request) -> Result<Option<String>> {
    let cookie_header = match req.headers().get("Cookie")? {
        Some(h) => h,
        None => return Ok(None),
    };

    for cookie in cookie_header.split(';') {
        let cookie = cookie.trim();
        if cookie.starts_with("token=") {
            let token = &cookie[6..];
            match decode_token(token) {
                Some(id) => return Ok(Some(id)),
                None => return Err(worker::Error::from("Invalid token")),
            }
        }
    }
    Ok(None)
}

fn create_token(peer_id: &str) -> String {
    // Fake JWT: Header.Payload.Signature
    // Header: {"alg":"HS256","typ":"JWT"}
    let header = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    
    // Payload: {"userId":"PEER_ID","roles":["anonymous"],"iat":1770658974}
    let iat = (js_sys::Date::now() / 1000.0) as u64;
    let payload_json = format!(r#"{{"userId":"{}","roles":["anonymous"],"iat":{}}}"#, peer_id, iat);
    let payload = general_purpose::URL_SAFE_NO_PAD.encode(payload_json);
    
    // Fake Signature
    let signature = "Nx7ZTiKDAabIKF4emm7aQHH-xhgIVospJ4MgG-kBPSE";
    
    format!("{}.{}.{}", header, payload, signature)
}

fn decode_token(token: &str) -> Option<String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 { return None; }
    
    let payload_b64 = parts[1];
    let payload_bytes = general_purpose::URL_SAFE_NO_PAD.decode(payload_b64).ok()?;
    let payload_json = String::from_utf8(payload_bytes).ok()?;
    
    #[derive(Deserialize)]
    struct Payload {
        #[serde(rename = "userId")]
        user_id: String,
    }
    
    let p: Payload = serde_json::from_str(&payload_json).ok()?;
    Some(p.user_id)
}
