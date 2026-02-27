use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum FileTransferState {
    Idle,
    Transferring,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum FileTransferType {
    Direct,
    Chunked,
    Streamed,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    name: String,
    size: u64,
    mime_type: String,
    last_modified: f64,
    checksum: String,
}

#[wasm_bindgen]
impl FileMetadata {
    #[wasm_bindgen(constructor)]
    pub fn new(name: String, size: u64, mime_type: String, last_modified: f64, checksum: String) -> Self {
        Self {
            name,
            size,
            mime_type,
            last_modified,
            checksum,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn name(&self) -> String { self.name.clone() }
    #[wasm_bindgen(getter)]
    pub fn size(&self) -> u64 { self.size }
    #[wasm_bindgen(getter)]
    pub fn mime_type(&self) -> String { self.mime_type.clone() }
    #[wasm_bindgen(getter)]
    pub fn last_modified(&self) -> f64 { self.last_modified }
    #[wasm_bindgen(getter)]
    pub fn checksum(&self) -> String { self.checksum.clone() }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChunk {
    chunk_id: u32,
    file_id: String,
    data: Vec<u8>,
    offset: u64,
    is_last: bool,
    checksum: String,
}

#[wasm_bindgen]
impl FileChunk {
    #[wasm_bindgen(constructor)]
    pub fn new(chunk_id: u32, file_id: String, data: Vec<u8>, offset: u64, is_last: bool, checksum: String) -> Self {
        Self {
            chunk_id,
            file_id,
            data,
            offset,
            is_last,
            checksum,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn chunk_id(&self) -> u32 { self.chunk_id }
    #[wasm_bindgen(getter)]
    pub fn file_id(&self) -> String { self.file_id.clone() }
    #[wasm_bindgen(getter)]
    pub fn data(&self) -> Vec<u8> { self.data.clone() }
    #[wasm_bindgen(getter)]
    pub fn offset(&self) -> u64 { self.offset }
    #[wasm_bindgen(getter)]
    pub fn is_last(&self) -> bool { self.is_last }
    #[wasm_bindgen(getter)]
    pub fn checksum(&self) -> String { self.checksum.clone() }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferProgress {
    file_id: String,
    bytes_transferred: u64,
    total_bytes: u64,
    chunks_transferred: u32,
    total_chunks: u32,
    transfer_rate_kbps: f64,
    estimated_time_remaining: f64,
}

#[wasm_bindgen]
impl TransferProgress {
    #[wasm_bindgen(constructor)]
    pub fn new(file_id: String, bytes_transferred: u64, total_bytes: u64, chunks_transferred: u32, total_chunks: u32) -> Self {
        let _progress_ratio = if total_bytes > 0 {
            bytes_transferred as f64 / total_bytes as f64
        } else {
            0.0
        };
        let transfer_rate_kbps = if bytes_transferred > 0 { 
            (bytes_transferred as f64 * 8.0) / 1000.0 
        } else { 0.0 };
        let estimated_time_remaining = if transfer_rate_kbps > 0.0 {
            ((total_bytes - bytes_transferred) as f64 * 8.0) / (transfer_rate_kbps * 1000.0)
        } else { 0.0 };

        Self {
            file_id,
            bytes_transferred,
            total_bytes,
            chunks_transferred,
            total_chunks,
            transfer_rate_kbps,
            estimated_time_remaining,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn file_id(&self) -> String { self.file_id.clone() }
    #[wasm_bindgen(getter)]
    pub fn bytes_transferred(&self) -> u64 { self.bytes_transferred }
    #[wasm_bindgen(getter)]
    pub fn total_bytes(&self) -> u64 { self.total_bytes }
    #[wasm_bindgen(getter)]
    pub fn chunks_transferred(&self) -> u32 { self.chunks_transferred }
    #[wasm_bindgen(getter)]
    pub fn total_chunks(&self) -> u32 { self.total_chunks }
    #[wasm_bindgen(getter)]
    pub fn transfer_rate_kbps(&self) -> f64 { self.transfer_rate_kbps }
    #[wasm_bindgen(getter)]
    pub fn estimated_time_remaining(&self) -> f64 { self.estimated_time_remaining }
    #[wasm_bindgen(getter)]
    pub fn progress_percentage(&self) -> f64 {
        if self.total_bytes > 0 {
            (self.bytes_transferred as f64 / self.total_bytes as f64) * 100.0
        } else {
            0.0
        }
    }
}

pub mod chunker;

#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct FileTransferEngine {
    chunk_size: usize,
    max_concurrent_chunks: u32,
    retry_attempts: u32,
    enable_compression: bool,
    enable_checksums: bool,
}

#[wasm_bindgen]
impl FileTransferEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            chunk_size: 64 * 1024, // 64KB default
            max_concurrent_chunks: 4,
            retry_attempts: 3,
            enable_compression: true,
            enable_checksums: true,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn chunk_size(&self) -> usize { self.chunk_size }
    #[wasm_bindgen(setter)]
    pub fn set_chunk_size(&mut self, size: usize) {
        self.chunk_size = size.max(1024).min(1024 * 1024); // 1KB to 1MB
    }

    #[wasm_bindgen(getter)]
    pub fn max_concurrent_chunks(&self) -> u32 { self.max_concurrent_chunks }
    #[wasm_bindgen(setter)]
    pub fn set_max_concurrent_chunks(&mut self, max: u32) {
        self.max_concurrent_chunks = max.max(1).min(20);
    }

    #[wasm_bindgen(getter)]
    pub fn retry_attempts(&self) -> u32 { self.retry_attempts }
    #[wasm_bindgen(setter)]
    pub fn set_retry_attempts(&mut self, attempts: u32) {
        self.retry_attempts = attempts.max(0).min(10);
    }

    #[wasm_bindgen(getter)]
    pub fn enable_compression(&self) -> bool { self.enable_compression }
    #[wasm_bindgen(setter)]
    pub fn set_enable_compression(&mut self, enabled: bool) {
        self.enable_compression = enabled;
    }

    #[wasm_bindgen(getter)]
    pub fn enable_checksums(&self) -> bool { self.enable_checksums }
    #[wasm_bindgen(setter)]
    pub fn set_enable_checksums(&mut self, enabled: bool) {
        self.enable_checksums = enabled;
    }

    #[wasm_bindgen]
    pub fn generate_file_id(&self, file_name: &str) -> String {
        use crate::crypto;
        let timestamp = js_sys::Date::now() as u64;
        let input = format!("{}_{}", file_name, timestamp);
        crypto::hash_string(&input)
    }

    #[wasm_bindgen]
    pub fn calculate_checksum(&self, data: &[u8]) -> String {
        use crate::crypto;
        crypto::hash_bytes(data)
    }

    #[wasm_bindgen]
    pub fn create_file_chunks(&self, file_id: String, data: Vec<u8>) -> Vec<FileChunk> {
        let total_size = data.len() as u64;
        let total_chunks = ((total_size + self.chunk_size as u64 - 1) / self.chunk_size as u64) as u32;
        let mut chunks = Vec::new();

        for chunk_id in 0..total_chunks {
            let start_offset = (chunk_id as usize) * self.chunk_size;
            let end_offset = (start_offset + self.chunk_size).min(data.len());
            let chunk_data = data[start_offset..end_offset].to_vec();
            
            let checksum = if self.enable_checksums {
                self.calculate_checksum(&chunk_data)
            } else {
                String::new()
            };

            let is_last = chunk_id == total_chunks - 1;
            let offset = start_offset as u64;

            chunks.push(FileChunk::new(
                chunk_id,
                file_id.clone(),
                chunk_data,
                offset,
                is_last,
                checksum,
            ));
        }

        chunks
    }

    #[wasm_bindgen]
    pub fn reassemble_file(&self, chunks: Vec<FileChunk>) -> Result<Vec<u8>, JsValue> {
        if chunks.is_empty() {
            return Err(JsValue::from_str("No chunks provided"));
        }

        let file_id = chunks[0].file_id();
        let mut chunks_by_id: HashMap<u32, FileChunk> = HashMap::new();
        
        for chunk in chunks {
            if chunk.file_id() != file_id {
                return Err(JsValue::from_str("Inconsistent file IDs in chunks"));
            }
            chunks_by_id.insert(chunk.chunk_id(), chunk);
        }

        // Find total size and verify all chunks are present
        let max_chunk_id = chunks_by_id.keys().max().unwrap_or(&0);
        let expected_chunks = max_chunk_id + 1;
        
        if chunks_by_id.len() != expected_chunks as usize {
            return Err(JsValue::from_str(&format!(
                "Missing chunks: expected {}, got {}",
                expected_chunks,
                chunks_by_id.len()
            )));
        }

        // Calculate total size
        let mut total_size = 0u64;
        for chunk in chunks_by_id.values() {
            total_size += chunk.data().len() as u64;
        }

        // Reassemble file
        let mut reassembled = Vec::with_capacity(total_size as usize);
        for chunk_id in 0..expected_chunks {
            if let Some(chunk) = chunks_by_id.get(&chunk_id) {
                reassembled.extend_from_slice(&chunk.data());
            } else {
                return Err(JsValue::from_str(&format!("Missing chunk {}", chunk_id)));
            }
        }

        // Verify checksums if enabled
        if self.enable_checksums {
            let mut combined_checksum = String::new();
            for chunk_id in 0..expected_chunks {
                if let Some(chunk) = chunks_by_id.get(&chunk_id) {
                    combined_checksum.push_str(&chunk.checksum());
                }
            }
            let expected_checksum = self.calculate_checksum(combined_checksum.as_bytes());
            
            // For now, we'll just log the verification
            web_sys::console::log_1(&format!(
                "File checksum verification for {}: {}",
                file_id,
                expected_checksum
            ).into());
        }

        Ok(reassembled)
    }

    #[wasm_bindgen]
    pub fn validate_chunk_integrity(&self, chunk: &FileChunk) -> bool {
        if !self.enable_checksums || chunk.checksum().is_empty() {
            return true; // Skip validation if checksums disabled
        }

        let calculated_checksum = self.calculate_checksum(&chunk.data());
        calculated_checksum == chunk.checksum()
    }

    #[wasm_bindgen]
    pub fn calculate_transfer_progress(&self, file_id: String, transferred_chunks: Vec<u32>, total_chunks: u32, chunk_size: usize) -> TransferProgress {
        let chunks_transferred = transferred_chunks.len() as u32;
        let bytes_transferred = (chunks_transferred as u64) * (chunk_size as u64);
        let total_bytes = (total_chunks as u64) * (chunk_size as u64);

        TransferProgress::new(
            file_id,
            bytes_transferred,
            total_bytes,
            chunks_transferred,
            total_chunks,
        )
    }
}