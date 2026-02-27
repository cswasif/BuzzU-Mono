use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum PeerState {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
    Failed,
    Banned,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum PeerRole {
    Host,
    Participant,
    Viewer,
    Moderator,
    Banned,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum RoomState {
    Creating,
    Waiting,
    Active,
    Closing,
    Closed,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct PeerCapabilities {
    webrtc_support: bool,
    quic_support: bool,
    file_transfer: bool,
    screen_sharing: bool,
    max_concurrent_transfers: u32,
    bandwidth_limit_kbps: u32,
}

#[wasm_bindgen]
impl PeerCapabilities {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            webrtc_support: true,
            quic_support: false,
            file_transfer: true,
            screen_sharing: true,
            max_concurrent_transfers: 5,
            bandwidth_limit_kbps: 10000,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn webrtc_support(&self) -> bool {
        self.webrtc_support
    }

    #[wasm_bindgen(getter)]
    pub fn quic_support(&self) -> bool {
        self.quic_support
    }

    #[wasm_bindgen(getter)]
    pub fn file_transfer(&self) -> bool {
        self.file_transfer
    }

    #[wasm_bindgen(getter)]
    pub fn screen_sharing(&self) -> bool {
        self.screen_sharing
    }

    #[wasm_bindgen(getter)]
    pub fn max_concurrent_transfers(&self) -> u32 {
        self.max_concurrent_transfers
    }

    #[wasm_bindgen(getter)]
    pub fn bandwidth_limit_kbps(&self) -> u32 {
        self.bandwidth_limit_kbps
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerInfo {
    id: String,
    display_name: String,
    state: PeerState,
    role: PeerRole,
    capabilities: PeerCapabilities,
    join_time: f64,
    last_seen: f64,
    connection_quality: f32,
    metadata: HashMap<String, String>,
}

#[wasm_bindgen]
impl PeerInfo {
    #[wasm_bindgen(constructor)]
    pub fn new(id: String, display_name: String) -> Self {
        Self {
            id,
            display_name,
            state: PeerState::Disconnected,
            role: PeerRole::Participant,
            capabilities: PeerCapabilities::new(),
            join_time: js_sys::Date::now(),
            last_seen: js_sys::Date::now(),
            connection_quality: 1.0,
            metadata: HashMap::new(),
        }
    }

    #[wasm_bindgen(getter)]
    pub fn id(&self) -> String {
        self.id.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn display_name(&self) -> String {
        self.display_name.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn state(&self) -> PeerState {
        self.state
    }

    #[wasm_bindgen(getter)]
    pub fn role(&self) -> PeerRole {
        self.role
    }

    #[wasm_bindgen(getter)]
    pub fn capabilities(&self) -> PeerCapabilities {
        self.capabilities
    }

    #[wasm_bindgen(getter)]
    pub fn join_time(&self) -> f64 {
        self.join_time
    }

    #[wasm_bindgen(getter)]
    pub fn last_seen(&self) -> f64 {
        self.last_seen
    }

    #[wasm_bindgen(getter)]
    pub fn connection_quality(&self) -> f32 {
        self.connection_quality
    }

    #[wasm_bindgen]
    pub fn update_state(&mut self, new_state: PeerState) {
        self.state = new_state;
        self.last_seen = js_sys::Date::now();
    }

    #[wasm_bindgen]
    pub fn update_role(&mut self, new_role: PeerRole) {
        self.role = new_role;
        self.last_seen = js_sys::Date::now();
    }

    #[wasm_bindgen]
    pub fn update_connection_quality(&mut self, quality: f32) {
        self.connection_quality = quality.clamp(0.0, 1.0);
        self.last_seen = js_sys::Date::now();
    }

    #[wasm_bindgen]
    pub fn add_metadata(&mut self, key: String, value: String) {
        self.metadata.insert(key, value);
        self.last_seen = js_sys::Date::now();
    }

    #[wasm_bindgen]
    pub fn get_metadata(&self, key: &str) -> Option<String> {
        self.metadata.get(key).cloned()
    }

    #[wasm_bindgen]
    pub fn remove_metadata(&mut self, key: &str) -> Option<String> {
        self.metadata.remove(key)
    }

    #[wasm_bindgen]
    pub fn can_send_messages(&self) -> bool {
        matches!(self.state, PeerState::Connected) && 
        !matches!(self.role, PeerRole::Viewer | PeerRole::Banned)
    }

    #[wasm_bindgen]
    pub fn can_receive_files(&self) -> bool {
        matches!(self.state, PeerState::Connected) && 
        self.capabilities.file_transfer &&
        !matches!(self.role, PeerRole::Banned)
    }

    #[wasm_bindgen]
    pub fn is_stale(&self, timeout_ms: f64) -> bool {
        let current_time = js_sys::Date::now();
        (current_time - self.last_seen) > timeout_ms
    }

    #[wasm_bindgen]
    pub fn to_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(self)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    #[wasm_bindgen]
    pub fn from_json(json: &str) -> Result<PeerInfo, JsValue> {
        serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Deserialization error: {}", e)))
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomInfo {
    id: String,
    name: String,
    state: RoomState,
    created_at: f64,
    max_peers: u32,
    metadata: HashMap<String, String>,
}

#[wasm_bindgen]
impl RoomInfo {
    #[wasm_bindgen(constructor)]
    pub fn new(id: String, name: String) -> Self {
        Self {
            id,
            name,
            state: RoomState::Creating,
            created_at: js_sys::Date::now(),
            max_peers: 50,
            metadata: HashMap::new(),
        }
    }

    #[wasm_bindgen(getter)]
    pub fn id(&self) -> String {
        self.id.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn name(&self) -> String {
        self.name.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn state(&self) -> RoomState {
        self.state
    }

    #[wasm_bindgen(getter)]
    pub fn created_at(&self) -> f64 {
        self.created_at
    }

    #[wasm_bindgen(getter)]
    pub fn max_peers(&self) -> u32 {
        self.max_peers
    }

    #[wasm_bindgen]
    pub fn update_state(&mut self, new_state: RoomState) {
        self.state = new_state;
    }

    #[wasm_bindgen]
    pub fn set_max_peers(&mut self, max: u32) {
        self.max_peers = max.max(1).min(1000);
    }

    #[wasm_bindgen]
    pub fn add_metadata(&mut self, key: String, value: String) {
        self.metadata.insert(key, value);
    }

    #[wasm_bindgen]
    pub fn get_metadata(&self, key: &str) -> Option<String> {
        self.metadata.get(key).cloned()
    }

    #[wasm_bindgen]
    pub fn remove_metadata(&mut self, key: &str) -> Option<String> {
        self.metadata.remove(key)
    }

    #[wasm_bindgen]
    pub fn to_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(self)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    #[wasm_bindgen]
    pub fn from_json(json: &str) -> Result<RoomInfo, JsValue> {
        serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Deserialization error: {}", e)))
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct PeerManager {
    rooms: HashMap<String, RoomInfo>,
    peers: HashMap<String, PeerInfo>,
    peer_rooms: HashMap<String, String>, // peer_id -> room_id
    stale_timeout_ms: f64,
}

#[wasm_bindgen]
impl PeerManager {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            rooms: HashMap::new(),
            peers: HashMap::new(),
            peer_rooms: HashMap::new(),
            stale_timeout_ms: 30000.0, // 30 seconds
        }
    }

    #[wasm_bindgen]
    pub fn create_room(&mut self, name: String) -> String {
        // Use the name as the ID directly to match existing roomId from matchmaker
        let room_id = name.clone();
        let mut room = RoomInfo::new(room_id.clone(), name);
        room.update_state(RoomState::Active);
        self.rooms.insert(room_id.clone(), room);
        room_id
    }

    #[wasm_bindgen]
    pub fn join_room(&mut self, peer_id: String, room_id: String, display_name: String) -> Result<String, JsValue> {
        if !self.rooms.contains_key(&room_id) {
            return Err(JsValue::from_str("Room not found"));
        }

        let room = self.rooms.get(&room_id).unwrap();
        if room.state() != RoomState::Active && room.state() != RoomState::Waiting {
            return Err(JsValue::from_str("Room is not available for joining"));
        }

        // Remove peer from previous room if any
        if let Some(_prev_room_id) = self.peer_rooms.get(&peer_id) {
            self.peer_rooms.remove(&peer_id);
            // Note: We don't remove the peer from self.peers here as they might rejoin
        }

        // Create or update peer
        let peer = self.peers.entry(peer_id.clone())
            .or_insert_with(|| PeerInfo::new(peer_id.clone(), display_name.clone()));
        
        peer.update_state(PeerState::Connecting);
        self.peer_rooms.insert(peer_id.clone(), room_id.clone());

        Ok(peer_id)
    }

    #[wasm_bindgen]
    pub fn add_peer(&mut self, peer_id: String, role: PeerRole) -> String {
        let mut peer = PeerInfo::new(peer_id.clone(), peer_id.clone());
        peer.update_role(role);
        self.peers.insert(peer_id.clone(), peer);
        peer_id
    }

    #[wasm_bindgen]
    pub fn remove_peer(&mut self, peer_id: &str) -> Option<PeerInfo> {
        self.peer_rooms.remove(peer_id);
        self.peers.remove(peer_id)
    }

    #[wasm_bindgen]
    pub fn get_peer(&self, peer_id: &str) -> Option<PeerInfo> {
        self.peers.get(peer_id).cloned()
    }

    #[wasm_bindgen]
    pub fn get_room_peers(&self, room_id: &str) -> Vec<PeerInfo> {
        self.peer_rooms
            .iter()
            .filter(|(_, r_id)| *r_id == room_id)
            .filter_map(|(p_id, _)| self.peers.get(p_id))
            .cloned()
            .collect()
    }

    #[wasm_bindgen]
    pub fn get_peer_room(&self, peer_id: &str) -> Option<String> {
        self.peer_rooms.get(peer_id).cloned()
    }

    #[wasm_bindgen]
    pub fn update_peer_state(&mut self, peer_id: &str, new_state: PeerState) -> Result<(), JsValue> {
        if let Some(peer) = self.peers.get_mut(peer_id) {
            peer.update_state(new_state);
            Ok(())
        } else {
            Err(JsValue::from_str("Peer not found"))
        }
    }

    #[wasm_bindgen]
    pub fn update_peer_role(&mut self, peer_id: &str, new_role: PeerRole) -> Result<(), JsValue> {
        if let Some(peer) = self.peers.get_mut(peer_id) {
            peer.update_role(new_role);
            Ok(())
        } else {
            Err(JsValue::from_str("Peer not found"))
        }
    }

    #[wasm_bindgen]
    pub fn broadcast_message(&self, _message: String, exclude_peer_id: Option<String>) -> Vec<String> {
        let mut recipients = Vec::new();
        
        for (peer_id, peer) in &self.peers {
            if let Some(ref exclude) = exclude_peer_id {
                if peer_id == exclude {
                    continue;
                }
            }
            
            if peer.can_send_messages() {
                recipients.push(peer_id.clone());
            }
        }
        
        web_sys::console::log_1(&format!("Broadcasting message to {} peers", recipients.len()).into());
        recipients
    }

    #[wasm_bindgen]
    pub fn cleanup_stale_peers(&mut self) -> Vec<String> {
        let mut removed_peers = Vec::new();
        let _current_time = js_sys::Date::now();
        
        self.peers.retain(|peer_id, peer| {
            if peer.is_stale(self.stale_timeout_ms) {
                removed_peers.push(peer_id.clone());
                false
            } else {
                true
            }
        });

        // Also remove from peer_rooms mapping
        for peer_id in &removed_peers {
            self.peer_rooms.remove(peer_id);
        }

        removed_peers
    }

    #[wasm_bindgen]
    pub fn get_room_stats(&self, room_id: &str) -> JsValue {
        let stats = js_sys::Object::new();
        let peers = self.get_room_peers(room_id);
        
        let connected_count = peers.iter().filter(|p| matches!(p.state(), PeerState::Connected)).count();
        let total_count = peers.len();
        
        js_sys::Reflect::set(&stats, &"total_peers".into(), &(total_count as u32).into()).unwrap();
        js_sys::Reflect::set(&stats, &"connected_peers".into(), &(connected_count as u32).into()).unwrap();
        
        stats.into()
    }

    #[wasm_bindgen]
    pub fn get_all_rooms(&self) -> Vec<String> {
        self.rooms.keys().cloned().collect()
    }

    #[wasm_bindgen]
    pub fn get_room_info(&self, room_id: &str) -> Option<RoomInfo> {
        self.rooms.get(room_id).cloned()
    }

    #[wasm_bindgen]
    pub fn remove_room(&mut self, room_id: &str) -> Option<RoomInfo> {
        // Remove all peers from this room
        let peers_to_remove: Vec<String> = self.peer_rooms
            .iter()
            .filter(|(_, r_id)| *r_id == room_id)
            .map(|(p_id, _)| p_id.clone())
            .collect();
        
        for peer_id in peers_to_remove {
            self.peer_rooms.remove(&peer_id);
            self.peers.remove(&peer_id);
        }

        self.rooms.remove(room_id)
    }

    #[wasm_bindgen]
    pub fn set_stale_timeout(&mut self, timeout_ms: f64) {
        self.stale_timeout_ms = timeout_ms.max(5000.0).min(300000.0); // 5s to 5min
    }

    #[wasm_bindgen]
    pub fn get_stale_timeout(&self) -> f64 {
        self.stale_timeout_ms
    }

    fn generate_room_id(&self, name: &str) -> String {
        use crate::crypto;
        let timestamp = js_sys::Date::now() as u64;
        let input = format!("{}_{}", name, timestamp);
        crypto::hash_string(&input)
    }

    #[wasm_bindgen]
    pub fn to_json(&self) -> Result<String, JsValue> {
        #[derive(Serialize)]
        struct SerializablePeerManager {
            rooms: HashMap<String, RoomInfo>,
            peers: HashMap<String, PeerInfo>,
            peer_rooms: HashMap<String, String>,
            stale_timeout_ms: f64,
        }

        let serializable = SerializablePeerManager {
            rooms: self.rooms.clone(),
            peers: self.peers.clone(),
            peer_rooms: self.peer_rooms.clone(),
            stale_timeout_ms: self.stale_timeout_ms,
        };

        serde_json::to_string(&serializable)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    #[wasm_bindgen]
    pub fn from_json(json: &str) -> Result<PeerManager, JsValue> {
        #[derive(Deserialize)]
        struct SerializablePeerManager {
            rooms: HashMap<String, RoomInfo>,
            peers: HashMap<String, PeerInfo>,
            peer_rooms: HashMap<String, String>,
            stale_timeout_ms: f64,
        }

        let serializable: SerializablePeerManager = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Deserialization error: {}", e)))?;

        Ok(PeerManager {
            rooms: serializable.rooms,
            peers: serializable.peers,
            peer_rooms: serializable.peer_rooms,
            stale_timeout_ms: serializable.stale_timeout_ms,
        })
    }
}