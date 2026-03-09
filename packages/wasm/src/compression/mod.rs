use wasm_bindgen::prelude::*;
use lz4_flex::{compress_prepend_size, decompress_size_prepended};
use image::{ImageFormat};
use std::io::Cursor;

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

#[wasm_bindgen]
pub struct ImageCompressor {}

#[wasm_bindgen]
impl ImageCompressor {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {}
    }

    /// Compress an image to WebP with target dimensions
    pub fn compress_to_webp(
        &self,
        data: &[u8],
        max_width: u32,
        max_height: u32,
    ) -> Result<Vec<u8>, JsValue> {
        let img = image::load_from_memory(data)
            .map_err(|e| JsValue::from_str(&format!("Failed to load image: {}", e)))?;

        // Resize if needed, maintaining aspect ratio
        let resized = if img.width() > max_width || img.height() > max_height {
            img.thumbnail(max_width, max_height)
        } else {
            img
        };

        let mut cursor = Cursor::new(Vec::new());
        // Note: webp support in image 0.24 is via features
        resized.write_to(&mut cursor, ImageFormat::WebP)
            .map_err(|e| JsValue::from_str(&format!("Failed to encode WebP: {}", e)))?;

        Ok(cursor.into_inner())
    }

    /// Shrink image to fit under target size (KB) using JPEG as fallback for wide compatibility
    pub fn shrink_to_fit(
        &self,
        data: &[u8],
        target_kb: usize,
    ) -> Result<Vec<u8>, JsValue> {
        let target_size = target_kb * 1024;
        let img = image::load_from_memory(data)
            .map_err(|e| JsValue::from_str(&format!("Failed to load image: {}", e)))?;
        
        let mut scale = 1.0;
        let mut result = Vec::new();

        // Max 4 attempts to shrink
        for _ in 0..4 { 
            let w = (img.width() as f32 * scale) as u32;
            let h = (img.height() as f32 * scale) as u32;
            
            let temp_img = img.thumbnail(w, h);
            let mut cursor = Cursor::new(Vec::new());
            temp_img.write_to(&mut cursor, ImageFormat::Jpeg)
                .map_err(|e| JsValue::from_str(&format!("Encode error: {}", e)))?;
            
            result = cursor.into_inner();
            if result.len() <= target_size {
                break;
            }
            scale *= 0.6;
        }

        Ok(result)
    }
}