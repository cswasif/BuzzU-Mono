use serde::{Deserialize, Serialize};
use worker::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SignalingMessage {
    Join { 
        room_id: String, 
        peer_id: String 
    },
    Offer { 
        from: String, 
        to: String, 
        payload: String, // Aligned with SignalMessage.payload
        #[serde(default)]
        room_id: String,
    },
    Answer { 
        from: String, 
        to: String, 
        payload: String, // Aligned with SignalMessage.payload
        #[serde(default)]
        room_id: String,
    },
    IceCandidate { 
        from: String, 
        to: String, 
        payload: String, // Aligned with SignalMessage.payload
        #[serde(default)]
        room_id: String,
    },
    PeerList { 
        peers: Vec<String> 
    },
    Leave { 
        peer_id: String 
    },
    Error { 
        message: String 
    },
    Relay { 
        from: String, 
        to: String, 
        via: String, 
        payload: String, 
        hop_count: u32, 
        timestamp: u64 
    },
    RelayRequest { 
        from: String, 
        to: String, 
        target_peer: String 
    },
    RelayResponse { 
        from: String, 
        to: String, 
        candidates: Vec<RelayCandidate> 
    },
    Reachability { 
        from: String, 
        reachable_peers: Vec<String> 
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayCandidate {
    peer_id: String,
    rtt_ms: u32,
    reliability: f32,
}

#[durable_object]
pub struct RoomDurableObject {
    state: State,
}

impl DurableObject for RoomDurableObject {
    fn new(state: State, _env: Env) -> Self {
        Self { state }
    }

    async fn fetch(&self, req: Request) -> Result<Response> {
        let upgrade = req.headers().get("Upgrade")?;
        if upgrade.map(|u| u == "websocket").unwrap_or(false) {
            let WebSocketPair { client, server } = WebSocketPair::new()?;
            self.state.accept_web_socket(&server);
            
            let url = req.url()?;
            let peer_id = url.query_pairs()
                .find(|(k, _)| k == "peer_id")
                .map(|(_, v)| v.to_string())
                .unwrap_or_else(|| format!("peer_{}", uuid::Uuid::new_v4()));
            
            server.serialize_attachment(&peer_id)?;
            
            let websockets = self.state.get_websockets();
            let peer_list: Vec<String> = websockets.iter()
                .filter_map(|ws| {
                    ws.deserialize_attachment::<String>()
                        .ok()
                        .flatten()
                })
                .collect();
            
            let peer_list_msg = SignalingMessage::PeerList { peers: peer_list.clone() };
            if let Ok(json) = serde_json::to_string(&peer_list_msg) {
                let _ = server.send_with_str(&json);
            }
            
            let join_msg = SignalingMessage::Join { 
                room_id: "".to_string(), 
                peer_id: peer_id.clone() 
            };
            if let Ok(json) = serde_json::to_string(&join_msg) {
                for ws in &websockets {
                    let other_peer: String = ws.deserialize_attachment::<String>()
                        .ok()
                        .flatten()
                        .unwrap_or_default();
                    if other_peer != peer_id {
                        let _ = ws.send_with_str(&json);
                    }
                }
            }
            
            Response::from_websocket(client)
        } else {
            Response::ok("Room Durable Object - WebSocket endpoint")
        }
    }
    
    async fn websocket_message(&self, ws: WebSocket, message: WebSocketIncomingMessage) -> Result<()> {
        let text = match message {
            WebSocketIncomingMessage::String(s) => s,
            WebSocketIncomingMessage::Binary(b) => String::from_utf8_lossy(&b).to_string(),
        };
        
        let from_peer: String = ws.deserialize_attachment::<String>()
            .ok()
            .flatten()
            .unwrap_or_default();
        
        if let Ok(msg) = serde_json::from_str::<SignalingMessage>(&text) {
            match msg {
                SignalingMessage::Offer { to, payload, room_id, .. } => {
                    self.forward_to_peer(&to, SignalingMessage::Offer { 
                        from: from_peer, 
                        to: to.clone(), 
                        payload,
                        room_id
                    });
                }
                SignalingMessage::Answer { to, payload, room_id, .. } => {
                    self.forward_to_peer(&to, SignalingMessage::Answer { 
                        from: from_peer, 
                        to: to.clone(), 
                        payload,
                        room_id
                    });
                }
                SignalingMessage::IceCandidate { to, payload, room_id, .. } => {
                    self.forward_to_peer(&to, SignalingMessage::IceCandidate { 
                        from: from_peer, 
                        to: to.clone(), 
                        payload,
                        room_id
                    });
                }
                SignalingMessage::Relay { to, via, payload, hop_count, timestamp, .. } => {
                    let target = if from_peer == via { &to } else { &via };
                    self.forward_to_peer(target, SignalingMessage::Relay { 
                        from: from_peer, 
                        to: to.clone(), 
                        via: via.clone(), 
                        payload, 
                        hop_count, 
                        timestamp 
                    });
                }
                _ => {
                    // Forward other messages normally if targeted
                }
            }
        }
        
        Ok(())
    }
    
    async fn websocket_close(&self, ws: WebSocket, _code: usize, _reason: String, _was_clean: bool) -> Result<()> {
        let peer_id: String = ws.deserialize_attachment::<String>()
            .ok()
            .flatten()
            .unwrap_or_default();
        
        let leave_msg = SignalingMessage::Leave { peer_id: peer_id.clone() };
        if let Ok(json) = serde_json::to_string(&leave_msg) {
            for other_ws in self.state.get_websockets() {
                let other_peer: String = other_ws.deserialize_attachment::<String>()
                    .ok()
                    .flatten()
                    .unwrap_or_default();
                if other_peer != peer_id {
                    let _ = other_ws.send_with_str(&json);
                }
            }
        }
        
        Ok(())
    }
}

impl RoomDurableObject {
    fn forward_to_peer(&self, target_peer_id: &str, message: SignalingMessage) {
        if let Ok(json) = serde_json::to_string(&message) {
            for ws in self.state.get_websockets() {
                let peer_id: String = ws.deserialize_attachment::<String>()
                    .ok()
                    .flatten()
                    .unwrap_or_default();
                if peer_id == target_peer_id {
                    let _ = ws.send_with_str(&json);
                    break;
                }
            }
        }
    }
}

#[event(fetch)]
pub async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let path = req.path();
    let method = req.method();
    
    // CORS preflight
    if method == Method::Options {
        let mut r = Response::ok("")?;
        let headers = r.headers_mut();
        headers.set("Access-Control-Allow-Origin", "*")?;
        headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD, UPGRADE")?;
        headers.set("Access-Control-Allow-Headers", "Content-Type, Upgrade, Connection")?;
        headers.set("Access-Control-Expose-Headers", "*")?;
        return Ok(r);
    }

    // Wrap the main logic to catch any errors and apply CORS to the error response
    let result = async {
        match path.as_str() {
            "/" => Response::ok("BuzzU Signaling Server v1.0"),
            "/health" => Response::ok("OK"),
            _ if path.starts_with("/room/") => {
                let room_id = path
                    .strip_prefix("/room/")
                    .and_then(|p| p.strip_suffix("/websocket").or(Some(p)))
                    .unwrap_or("default");
                
                let namespace = env.durable_object("ROOMS")?;
                let id = namespace.id_from_name(room_id)?;
                let stub = id.get_stub()?;
                
                stub.fetch_with_request(req).await
            }
            _ => Response::error("Not Found", 404),
        }
    }.await;

    let mut response = match result {
        Ok(res) => res,
        Err(err) => {
            console_log!("[Signaling] Error handling {} {}: {:?}", method, path, err);
            Response::error(format!("Internal Server Error: {:?}", err), 500)?
        }
    };
    
    // Only apply CORS if not a WebSocket upgrade (101 Switching Protocols)
    if response.status_code() != 101 {
        let cors = Cors::default()
            .with_origins(vec!["*"])
            .with_methods(vec![Method::Get, Method::Post, Method::Options, Method::Head])
            .with_allowed_headers(vec!["Content-Type", "Upgrade", "Connection"])
            .with_max_age(86400);

        return response.with_cors(&cors);
    }
    
    Ok(response)
}

fn add_cors_headers(mut response: Response) -> Response {
    let headers = response.headers_mut();
    let _ = headers.set("Access-Control-Allow-Origin", "*");
    let _ = headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    let _ = headers.set("Access-Control-Allow-Headers", "Content-Type, Upgrade, Connection");
    
    response
}