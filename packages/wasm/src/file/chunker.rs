use wasm_bindgen::prelude::*;
use js_sys;

#[wasm_bindgen]
pub struct FileChunker {
    chunk_size: usize,
}

#[wasm_bindgen]
impl FileChunker {
    #[wasm_bindgen(constructor)]
    pub fn new(chunk_size: usize) -> Self {
        Self { 
            chunk_size: chunk_size.max(16384) // Min 16KB as specified
        }
    }
    
    /// Split file into chunks, returns array of chunks
    pub fn chunk(&self, data: &[u8]) -> Vec<js_sys::Uint8Array> {
        data.chunks(self.chunk_size)
            .map(|chunk| js_sys::Uint8Array::from(chunk))
            .collect()
    }
    
    /// Reassemble chunks into original file
    #[wasm_bindgen]
    pub fn reassemble(&self, chunks: Vec<js_sys::Uint8Array>, total_size: usize) -> Vec<u8> {
        let mut result = Vec::with_capacity(total_size);
        for chunk in chunks {
            result.extend(chunk.to_vec());
        }
        result
    }
    
    /// Calculate number of chunks for a file
    pub fn chunk_count(&self, file_size: usize) -> usize {
        (file_size + self.chunk_size - 1) / self.chunk_size
    }
    
    /// Generate chunk metadata (for tracking progress)
    pub fn generate_manifest(&self, file_size: usize, file_name: &str) -> String {
        serde_json::json!({
            "file_name": file_name,
            "file_size": file_size,
            "chunk_size": self.chunk_size,
            "chunk_count": self.chunk_count(file_size),
        }).to_string()
    }
}