use wasm_bindgen::prelude::*;
use crate::crypto::CryptoEngine;
use crate::connection_quality::{ConnectionQualityEngine, ConnectionQualityState};

mod wss_worker;
pub use wss_worker::{WssWorker, ConnectionState};

#[wasm_bindgen]
pub struct WorkerEngine {
    crypto: Option<CryptoEngine>,
    connection_quality: ConnectionQualityEngine,
}

#[wasm_bindgen]
impl WorkerEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            crypto: None,
            connection_quality: ConnectionQualityEngine::new(),
        }
    }

    #[wasm_bindgen]
    pub fn initialize_crypto(&mut self, key_base64: &str) -> Result<(), JsValue> {
        self.crypto = Some(CryptoEngine::new(key_base64)?);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn process_crypto_batch(&mut self, data: &[u8], nonce_base64: &str) -> Result<Vec<u8>, JsValue> {
        let crypto = self.crypto.as_ref()
            .ok_or_else(|| JsValue::from_str("Crypto not initialized"))?;
        
        let data_str = String::from_utf8(data.to_vec())
            .map_err(|e| JsValue::from_str(&format!("Invalid UTF-8 data: {}", e)))?;
        
        let encrypted = crypto.encrypt(&data_str, nonce_base64)?;
        Ok(encrypted.into_bytes())
    }

    #[wasm_bindgen]
    pub fn measure_connection_quality(&mut self, rtt_data: &[f64]) -> ConnectionQualityState {
        if rtt_data.len() < 2 {
            return ConnectionQualityState::Idle;
        }

        for i in 0..rtt_data.len()-1 {
            let send_time = rtt_data[i];
            let receive_time = rtt_data[i + 1];
            
            if let Ok(measurement) = self.connection_quality.measure_rtt(send_time, receive_time, &format!("packet_{}", i)) {
                web_sys::console::log_1(&format!("RTT measurement: {}ms", measurement.rtt_ms()).into());
            }
        }

        self.connection_quality.get_connection_quality_state()
    }

    #[wasm_bindgen]
    pub fn get_network_health_summary(&self) -> String {
        self.connection_quality.get_network_health_summary()
    }

    #[wasm_bindgen]
    pub fn calculate_average_rtt(&self) -> f64 {
        self.connection_quality.get_average_rtt()
    }

    #[wasm_bindgen]
    pub fn get_connection_quality(&self) -> f64 {
        self.connection_quality.get_connection_quality()
    }

    #[wasm_bindgen]
    pub fn process_large_dataset(&self, data: &[u8]) -> Result<String, JsValue> {
        if data.len() > 1024 * 1024 {
            return Err(JsValue::from_str("Dataset too large for worker processing"));
        }

        let hash = crate::crypto::hash_bytes(data);
        let size = data.len();
        
        Ok(serde_json::json!({
            "processed_size": size,
            "hash": hash,
            "timestamp": js_sys::Date::now()
        }).to_string())
    }
}