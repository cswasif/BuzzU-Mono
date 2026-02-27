use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use base64::{Engine as _, engine::general_purpose};

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub enum SignalMessageType {
    Offer,
    Answer,
    IceCandidate,
    Join,
    Leave,
    KeepAlive,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignalMessage {
    message_type: SignalMessageType,
    room_id: String,
    from_peer_id: String,
    to_peer_id: Option<String>,
    payload: String,
    timestamp: f64,
}

#[wasm_bindgen]
impl SignalMessage {
    #[wasm_bindgen(constructor)]
    pub fn new(
        message_type: SignalMessageType,
        room_id: String,
        from_peer_id: String,
        payload: String,
    ) -> Self {
        Self {
            message_type,
            room_id,
            from_peer_id,
            to_peer_id: None,
            payload,
            timestamp: js_sys::Date::now(),
        }
    }

    #[wasm_bindgen(getter)]
    pub fn message_type(&self) -> SignalMessageType {
        self.message_type
    }

    #[wasm_bindgen(setter)]
    pub fn set_message_type(&mut self, message_type: SignalMessageType) {
        self.message_type = message_type;
    }

    #[wasm_bindgen(getter)]
    pub fn room_id(&self) -> String {
        self.room_id.clone()
    }

    #[wasm_bindgen(setter)]
    pub fn set_room_id(&mut self, room_id: String) {
        self.room_id = room_id;
    }

    #[wasm_bindgen(getter)]
    pub fn from_peer_id(&self) -> String {
        self.from_peer_id.clone()
    }

    #[wasm_bindgen(setter)]
    pub fn set_from_peer_id(&mut self, from_peer_id: String) {
        self.from_peer_id = from_peer_id;
    }

    #[wasm_bindgen(getter)]
    pub fn to_peer_id(&self) -> Option<String> {
        self.to_peer_id.clone()
    }

    #[wasm_bindgen(setter)]
    pub fn set_to_peer_id(&mut self, to_peer_id: Option<String>) {
        self.to_peer_id = to_peer_id;
    }

    #[wasm_bindgen(getter)]
    pub fn payload(&self) -> String {
        self.payload.clone()
    }

    #[wasm_bindgen(setter)]
    pub fn set_payload(&mut self, payload: String) {
        self.payload = payload;
    }

    #[wasm_bindgen(getter)]
    pub fn timestamp(&self) -> f64 {
        self.timestamp
    }

    #[wasm_bindgen(setter)]
    pub fn set_timestamp(&mut self, timestamp: f64) {
        self.timestamp = timestamp;
    }

    #[wasm_bindgen]
    pub fn to_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self)
            .map_err(|e| JsValue::from_str(&format!("JSON serialization failed: {}", e)))
    }

    #[wasm_bindgen]
    pub fn from_json(json_str: &str) -> Result<SignalMessage, JsValue> {
        serde_json::from_str(json_str)
            .map_err(|e| JsValue::from_str(&format!("JSON deserialization failed: {}", e)))
    }
}

#[wasm_bindgen]
pub struct SignalingEngine {
    compression_enabled: bool,
}

#[wasm_bindgen]
impl SignalingEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(compression_enabled: bool) -> Self {
        Self {
            compression_enabled,
        }
    }

    #[wasm_bindgen]
    pub fn compress_sdp(&self, sdp: &str) -> Result<String, JsValue> {
        if !self.compression_enabled {
            return Ok(sdp.to_string());
        }

        let compressed = lz4_flex::block::compress_prepend_size(sdp.as_bytes());
        
        Ok(general_purpose::STANDARD.encode(&compressed))
    }

    #[wasm_bindgen]
    pub fn decompress_sdp(&self, compressed_sdp: &str) -> Result<String, JsValue> {
        if !self.compression_enabled {
            return Ok(compressed_sdp.to_string());
        }

        let compressed = general_purpose::STANDARD
            .decode(compressed_sdp)
            .map_err(|e| JsValue::from_str(&format!("Base64 decode failed: {}", e)))?;
        
        let decompressed = lz4_flex::block::decompress_size_prepended(&compressed)
            .map_err(|e| JsValue::from_str(&format!("LZ4 decompression failed: {:?}", e)))?;
        
        String::from_utf8(decompressed)
            .map_err(|e| JsValue::from_str(&format!("Invalid UTF-8: {}", e)))
    }

    #[wasm_bindgen]
    pub fn create_offer_message(&self, room_id: String, from_peer_id: String, offer_sdp: String) -> Result<SignalMessage, JsValue> {
        let compressed_offer = self.compress_sdp(&offer_sdp)?;
        Ok(SignalMessage::new(
            SignalMessageType::Offer,
            room_id,
            from_peer_id,
            compressed_offer,
        ))
    }

    #[wasm_bindgen]
    pub fn create_answer_message(&self, room_id: String, from_peer_id: String, answer_sdp: String) -> Result<SignalMessage, JsValue> {
        let compressed_answer = self.compress_sdp(&answer_sdp)?;
        Ok(SignalMessage::new(
            SignalMessageType::Answer,
            room_id,
            from_peer_id,
            compressed_answer,
        ))
    }

    #[wasm_bindgen]
    pub fn create_ice_candidate_message(&self, room_id: String, from_peer_id: String, candidate: String) -> Result<SignalMessage, JsValue> {
        Ok(SignalMessage::new(
            SignalMessageType::IceCandidate,
            room_id,
            from_peer_id,
            candidate,
        ))
    }

    #[wasm_bindgen]
    pub fn extract_sdp_from_message(&self, message: &SignalMessage) -> Result<String, JsValue> {
        match message.message_type {
            SignalMessageType::Offer | SignalMessageType::Answer => {
                self.decompress_sdp(&message.payload)
            }
            _ => Ok(message.payload.clone()),
        }
    }
}

#[wasm_bindgen]
pub fn generate_peer_id() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let id: u64 = rng.gen();
    format!("peer_{:016x}", id)
}

#[wasm_bindgen]
pub fn generate_room_id() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let id: u64 = rng.gen();
    format!("room_{:016x}", id)
}