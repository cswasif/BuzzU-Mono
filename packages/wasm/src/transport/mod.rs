use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum TransportType {
    WebRTC,
    // QUIC removed - not available in browsers
}

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum TransportState {
    Idle,
    Connecting,
    Connected,
    Reconnecting,
    Disconnected,
    Failed,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum IceConnectionState {
    New,
    Checking,
    Connected,
    Completed,
    Failed,
    Disconnected,
    Closed,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum IceGatheringState {
    New,
    Gathering,
    Complete,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IceCandidate {
    candidate: String,
    sdp_mid: Option<String>,
    sdp_m_line_index: Option<u16>,
    username_fragment: Option<String>,
}

#[wasm_bindgen]
impl IceCandidate {
    #[wasm_bindgen(constructor)]
    pub fn new(
        candidate: String,
        sdp_mid: Option<String>,
        sdp_m_line_index: Option<u16>,
        username_fragment: Option<String>,
    ) -> Self {
        Self {
            candidate,
            sdp_mid,
            sdp_m_line_index,
            username_fragment,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn candidate(&self) -> String {
        self.candidate.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn sdp_mid(&self) -> Option<String> {
        self.sdp_mid.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn sdp_m_line_index(&self) -> Option<u16> {
        self.sdp_m_line_index
    }

    #[wasm_bindgen(getter)]
    pub fn username_fragment(&self) -> Option<String> {
        self.username_fragment.clone()
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransportStats {
    bytes_sent: u64,
    bytes_received: u64,
    packets_sent: u64,
    packets_received: u64,
    packets_lost: u64,
    rtt_ms: f64,
    jitter_ms: f64,
    timestamp: f64,
}

#[wasm_bindgen]
impl TransportStats {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            bytes_sent: 0,
            bytes_received: 0,
            packets_sent: 0,
            packets_received: 0,
            packets_lost: 0,
            rtt_ms: 0.0,
            jitter_ms: 0.0,
            timestamp: js_sys::Date::now(),
        }
    }

    #[wasm_bindgen(getter)]
    pub fn bytes_sent(&self) -> u64 {
        self.bytes_sent
    }

    #[wasm_bindgen(getter)]
    pub fn bytes_received(&self) -> u64 {
        self.bytes_received
    }

    #[wasm_bindgen(getter)]
    pub fn packets_sent(&self) -> u64 {
        self.packets_sent
    }

    #[wasm_bindgen(getter)]
    pub fn packets_received(&self) -> u64 {
        self.packets_received
    }

    #[wasm_bindgen(getter)]
    pub fn packets_lost(&self) -> u64 {
        self.packets_lost
    }

    #[wasm_bindgen(getter)]
    pub fn rtt_ms(&self) -> f64 {
        self.rtt_ms
    }

    #[wasm_bindgen(getter)]
    pub fn jitter_ms(&self) -> f64 {
        self.jitter_ms
    }

    #[wasm_bindgen(getter)]
    pub fn timestamp(&self) -> f64 {
        self.timestamp
    }

    #[wasm_bindgen]
    pub fn packet_loss_rate(&self) -> f64 {
        let total = self.packets_sent + self.packets_received;
        if total == 0 {
            0.0
        } else {
            self.packets_lost as f64 / total as f64
        }
    }

    #[wasm_bindgen]
    pub fn bandwidth_usage_kbps(&self) -> f64 {
        let total_bytes = self.bytes_sent + self.bytes_received;
        total_bytes as f64 * 8.0 / 1000.0 // Convert to kilobits
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IceServer {
    urls: Vec<String>,
    username: Option<String>,
    credential: Option<String>,
    credential_type: String, // "password" or "oauth"
}

#[wasm_bindgen]
impl IceServer {
    #[wasm_bindgen(constructor)]
    pub fn new(
        urls: Vec<String>,
        username: Option<String>,
        credential: Option<String>,
        credential_type: String,
    ) -> Self {
        Self {
            urls,
            username,
            credential,
            credential_type,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn urls(&self) -> Vec<String> {
        self.urls.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn username(&self) -> Option<String> {
        self.username.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn credential(&self) -> Option<String> {
        self.credential.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn credential_type(&self) -> String {
        self.credential_type.clone()
    }
}

#[wasm_bindgen]
pub struct TransportEngine {
    transport_type: TransportType,
    state: TransportState,
    ice_connection_state: IceConnectionState,
    ice_gathering_state: IceGatheringState,
    ice_servers: Vec<IceServer>,
    local_candidates: Vec<IceCandidate>,
    remote_candidates: Vec<IceCandidate>,
    selected_candidate_pair: Option<(IceCandidate, IceCandidate)>,
    stats: TransportStats,
    connection_attempts: u32,
    max_reconnection_attempts: u32,
    reconnection_delay_ms: u32,
    enable_trickle_ice: bool,
    enable_ice_restart: bool,
}

#[wasm_bindgen]
impl TransportEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(transport_type: TransportType) -> Self {
        Self {
            transport_type,
            state: TransportState::Idle,
            ice_connection_state: IceConnectionState::New,
            ice_gathering_state: IceGatheringState::New,
            ice_servers: Vec::new(),
            local_candidates: Vec::new(),
            remote_candidates: Vec::new(),
            selected_candidate_pair: None,
            stats: TransportStats::new(),
            connection_attempts: 0,
            max_reconnection_attempts: 5,
            reconnection_delay_ms: 1000,
            enable_trickle_ice: true,
            enable_ice_restart: true,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn transport_type(&self) -> TransportType {
        self.transport_type
    }

    #[wasm_bindgen(getter)]
    pub fn state(&self) -> TransportState {
        self.state
    }

    #[wasm_bindgen(getter)]
    pub fn ice_connection_state(&self) -> IceConnectionState {
        self.ice_connection_state
    }

    #[wasm_bindgen(getter)]
    pub fn ice_gathering_state(&self) -> IceGatheringState {
        self.ice_gathering_state
    }

    #[wasm_bindgen(getter)]
    pub fn connection_attempts(&self) -> u32 {
        self.connection_attempts
    }

    #[wasm_bindgen(getter)]
    pub fn stats(&self) -> TransportStats {
        self.stats.clone()
    }

    #[wasm_bindgen]
    pub fn add_ice_server(&mut self, server: IceServer) {
        self.ice_servers.push(server);
    }

    #[wasm_bindgen]
    pub fn add_local_candidate(&mut self, candidate: IceCandidate) {
        self.local_candidates.push(candidate);
        if self.enable_trickle_ice && self.ice_gathering_state == IceGatheringState::Gathering {
            self.process_candidate_pairing();
        }
    }

    #[wasm_bindgen]
    pub fn add_remote_candidate(&mut self, candidate: IceCandidate) {
        self.remote_candidates.push(candidate);
        if self.enable_trickle_ice && self.ice_connection_state == IceConnectionState::Checking {
            self.process_candidate_pairing();
        }
    }

    #[wasm_bindgen]
    pub fn start_connection(&mut self) -> Result<(), JsValue> {
        if self.state != TransportState::Idle && self.state != TransportState::Disconnected && self.state != TransportState::Reconnecting {
            return Err(JsValue::from_str("Transport not in valid state for connection"));
        }

        self.state = TransportState::Connecting;
        self.ice_connection_state = IceConnectionState::Checking;
        self.ice_gathering_state = IceGatheringState::Gathering;
        self.connection_attempts += 1;

        self.gather_ice_candidates();
        Ok(())
    }

    #[wasm_bindgen]
    pub fn disconnect(&mut self) {
        self.state = TransportState::Disconnected;
        self.ice_connection_state = IceConnectionState::Closed;
        self.ice_gathering_state = IceGatheringState::New;
        self.connection_attempts = 0;
    }

    #[wasm_bindgen]
    pub fn reconnect(&mut self) -> Result<(), JsValue> {
        if self.connection_attempts >= self.max_reconnection_attempts {
            self.state = TransportState::Failed;
            return Err(JsValue::from_str("Max reconnection attempts reached"));
        }

        self.state = TransportState::Reconnecting;
        
        if self.enable_ice_restart {
            self.ice_connection_state = IceConnectionState::New;
            self.ice_gathering_state = IceGatheringState::New;
            self.local_candidates.clear();
            self.remote_candidates.clear();
            self.selected_candidate_pair = None;
        }

        self.start_connection()?;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn update_connection_state(&mut self, new_state: TransportState) {
        let old_state = self.state;
        self.state = new_state;

        match new_state {
            TransportState::Connected => {
                self.ice_connection_state = IceConnectionState::Connected;
                self.connection_attempts = 0;
            }
            TransportState::Failed => {
                self.ice_connection_state = IceConnectionState::Failed;
            }
            TransportState::Disconnected => {
                self.ice_connection_state = IceConnectionState::Disconnected;
            }
            _ => {}
        }

        self.log_state_transition(old_state, new_state);
    }

    #[wasm_bindgen]
    pub fn update_ice_connection_state(&mut self, new_state: IceConnectionState) {
        let old_state = self.ice_connection_state;
        self.ice_connection_state = new_state;

        match new_state {
            IceConnectionState::Connected | IceConnectionState::Completed => {
                if self.state == TransportState::Connecting || self.state == TransportState::Reconnecting {
                    self.update_connection_state(TransportState::Connected);
                }
            }
            IceConnectionState::Failed => {
                if self.state == TransportState::Connecting || self.state == TransportState::Reconnecting {
                    self.update_connection_state(TransportState::Failed);
                }
            }
            _ => {}
        }

        self.log_ice_state_transition(old_state, new_state);
    }

    #[wasm_bindgen]
    pub fn update_ice_gathering_state(&mut self, new_state: IceGatheringState) {
        self.ice_gathering_state = new_state;
        
        if new_state == IceGatheringState::Complete {
            self.process_candidate_pairing();
        }
    }

    #[wasm_bindgen]
    pub fn update_stats(&mut self, bytes_sent: u64, bytes_received: u64, packets_sent: u64, packets_received: u64, packets_lost: u64, rtt_ms: f64, jitter_ms: f64) {
        self.stats.bytes_sent = bytes_sent;
        self.stats.bytes_received = bytes_received;
        self.stats.packets_sent = packets_sent;
        self.stats.packets_received = packets_received;
        self.stats.packets_lost = packets_lost;
        self.stats.rtt_ms = rtt_ms;
        self.stats.jitter_ms = jitter_ms;
        self.stats.timestamp = js_sys::Date::now();
    }

    #[wasm_bindgen]
    pub fn get_local_candidates(&self) -> String {
        match serde_json::to_string(&self.local_candidates) {
            Ok(json) => json,
            Err(_) => "[]".to_string(),
        }
    }

    #[wasm_bindgen]
    pub fn get_remote_candidates(&self) -> String {
        match serde_json::to_string(&self.remote_candidates) {
            Ok(json) => json,
            Err(_) => "[]".to_string(),
        }
    }

    #[wasm_bindgen]
    pub fn get_selected_candidate_pair(&self) -> String {
        match &self.selected_candidate_pair {
            Some((local, remote)) => {
                let pair = serde_json::json!({
                    "local": local,
                    "remote": remote
                });
                match serde_json::to_string(&pair) {
                    Ok(json) => json,
                    Err(_) => "null".to_string(),
                }
            }
            None => "null".to_string(),
        }
    }

    #[wasm_bindgen]
    pub fn get_ice_servers(&self) -> String {
        match serde_json::to_string(&self.ice_servers) {
            Ok(json) => json,
            Err(_) => "[]".to_string(),
        }
    }

    #[wasm_bindgen]
    pub fn clear_candidates(&mut self) {
        self.local_candidates.clear();
        self.remote_candidates.clear();
        self.selected_candidate_pair = None;
    }

    #[wasm_bindgen]
    pub fn set_configuration(&mut self, enable_trickle_ice: bool, enable_ice_restart: bool, max_reconnection_attempts: u32, reconnection_delay_ms: u32) {
        self.enable_trickle_ice = enable_trickle_ice;
        self.enable_ice_restart = enable_ice_restart;
        self.max_reconnection_attempts = max_reconnection_attempts;
        self.reconnection_delay_ms = reconnection_delay_ms;
    }

    fn gather_ice_candidates(&mut self) {
        if self.ice_servers.is_empty() {
            self.add_default_stun_servers();
        }
        
        self.ice_gathering_state = IceGatheringState::Gathering;
        
        // Simulate candidate gathering (in real implementation, this would trigger WebRTC candidate gathering)
        web_sys::console::log_1(&format!("Starting ICE candidate gathering for {:?}", self.transport_type).into());
    }

    fn add_default_stun_servers(&mut self) {
        let stun_servers = vec![
            IceServer::new(
                vec!["stun:stun.l.google.com:19302".to_string()],
                None,
                None,
                "password".to_string(),
            ),
            IceServer::new(
                vec!["stun:stun1.l.google.com:19302".to_string()],
                None,
                None,
                "password".to_string(),
            ),
        ];

        for server in stun_servers {
            self.ice_servers.push(server);
        }
    }

    fn process_candidate_pairing(&mut self) {
        if self.local_candidates.is_empty() || self.remote_candidates.is_empty() {
            return;
        }

        // Simple candidate pairing logic - in real implementation, this would use ICE connectivity checks
        let best_local = self.local_candidates.first().unwrap();
        let best_remote = self.remote_candidates.first().unwrap();
        
        self.selected_candidate_pair = Some((best_local.clone(), best_remote.clone()));
        
        web_sys::console::log_1(&format!(
            "Selected candidate pair: Local: {}, Remote: {}",
            best_local.candidate, best_remote.candidate
        ).into());
    }

    fn log_state_transition(&self, old_state: TransportState, new_state: TransportState) {
        web_sys::console::log_1(&format!(
            "Transport state transition: {:?} -> {:?}",
            old_state, new_state
        ).into());
    }

    fn log_ice_state_transition(&self, old_state: IceConnectionState, new_state: IceConnectionState) {
        web_sys::console::log_1(&format!(
            "ICE connection state transition: {:?} -> {:?}",
            old_state, new_state
        ).into());
    }
}