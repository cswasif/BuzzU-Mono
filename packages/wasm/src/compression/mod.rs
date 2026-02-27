use wasm_bindgen::prelude::*;
use lz4_flex::{compress_prepend_size, decompress_size_prepended};

#[wasm_bindgen]
pub struct SdpCompressor {}

#[wasm_bindgen]
impl SdpCompressor {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {}
    }
    
    /// Compress SDP string using LZ4
    pub fn compress(&self, sdp: &str) -> Vec<u8> {
        compress_prepend_size(sdp.as_bytes())
    }
    
    /// Decompress SDP bytes back to string
    pub fn decompress(&self, data: &[u8]) -> Result<String, JsValue> {
        let decompressed = decompress_size_prepended(data)
            .map_err(|e| JsValue::from_str(&format!("Decompression failed: {}", e)))?;
        String::from_utf8(decompressed)
            .map_err(|e| JsValue::from_str(&format!("Invalid UTF-8: {}", e)))
    }
    
    /// Get compression ratio
    pub fn compression_ratio(&self, original: &str, compressed: &[u8]) -> f64 {
        (compressed.len() as f64) / (original.len() as f64)
    }
}