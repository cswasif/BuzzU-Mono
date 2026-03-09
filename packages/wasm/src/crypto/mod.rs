use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use sha2::{Sha256, Digest};
use base64::{Engine as _, engine::general_purpose};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct CryptoEngine {
    cipher: Aes256Gcm,
}

#[wasm_bindgen]
impl CryptoEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(key_base64: &str) -> Result<CryptoEngine, JsValue> {
        let key_bytes = general_purpose::STANDARD
            .decode(key_base64)
            .map_err(|e| JsValue::from_str(&format!("Invalid key: {}", e)))?;
        
        if key_bytes.len() != 32 {
            return Err(JsValue::from_str("Key must be 32 bytes for AES-256"));
        }
        
        let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);
        
        Ok(CryptoEngine { cipher })
    }
    
    #[wasm_bindgen]
    pub fn encrypt(&self, plaintext: &str, nonce_base64: &str) -> Result<String, JsValue> {
        let nonce_bytes = general_purpose::STANDARD
            .decode(nonce_base64)
            .map_err(|e| JsValue::from_str(&format!("Invalid nonce: {}", e)))?;
        
        if nonce_bytes.len() != 12 {
            return Err(JsValue::from_str("Nonce must be 12 bytes"));
        }
        
        let nonce = Nonce::from_slice(&nonce_bytes);
        let plaintext_bytes = plaintext.as_bytes();
        
        let ciphertext = self.cipher
            .encrypt(nonce, plaintext_bytes)
            .map_err(|e| JsValue::from_str(&format!("Encryption failed: {}", e)))?;
        
        Ok(general_purpose::STANDARD.encode(&ciphertext))
    }
    
    #[wasm_bindgen]
    pub fn decrypt(&self, ciphertext_base64: &str, nonce_base64: &str) -> Result<String, JsValue> {
        let nonce_bytes = general_purpose::STANDARD
            .decode(nonce_base64)
            .map_err(|e| JsValue::from_str(&format!("Invalid nonce: {}", e)))?;
        
        if nonce_bytes.len() != 12 {
            return Err(JsValue::from_str("Nonce must be 12 bytes"));
        }
        
        let ciphertext = general_purpose::STANDARD
            .decode(ciphertext_base64)
            .map_err(|e| JsValue::from_str(&format!("Invalid ciphertext: {}", e)))?;
        
        let nonce = Nonce::from_slice(&nonce_bytes);
        
        let plaintext = self.cipher
            .decrypt(nonce, ciphertext.as_ref())
            .map_err(|e| JsValue::from_str(&format!("Decryption failed: {}", e)))?;
        
        String::from_utf8(plaintext)
            .map_err(|e| JsValue::from_str(&format!("Invalid UTF-8: {}", e)))
    }
    
    #[wasm_bindgen]
    pub fn generate_nonce() -> String {
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        general_purpose::STANDARD.encode(nonce.as_slice())
    }
    
    #[wasm_bindgen]
    pub fn hash_sha256(input: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(input.as_bytes());
        let result = hasher.finalize();
        general_purpose::STANDARD.encode(result.as_slice())
    }
    
    #[wasm_bindgen]
    pub fn generate_key() -> String {
        let key = Aes256Gcm::generate_key(&mut OsRng);
        general_purpose::STANDARD.encode(key.as_slice())
    }
}

#[wasm_bindgen]
pub fn hash_password(password: &str, salt_base64: &str) -> Result<String, JsValue> {
    let salt = general_purpose::STANDARD
        .decode(salt_base64)
        .map_err(|e| JsValue::from_str(&format!("Invalid salt: {}", e)))?;
    
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hasher.update(&salt);
    let result = hasher.finalize();
    
    Ok(general_purpose::STANDARD.encode(result.as_slice()))
}

#[wasm_bindgen]
pub fn generate_salt() -> String {
    let salt: [u8; 32] = rand::random();
    general_purpose::STANDARD.encode(&salt)
}

#[wasm_bindgen]
pub fn hash_string(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let result = hasher.finalize();
    general_purpose::STANDARD.encode(result.as_slice())
}

pub mod signal;
pub mod chacha;

#[wasm_bindgen]
pub fn hash_bytes(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let result = hasher.finalize();
    general_purpose::STANDARD.encode(result.as_slice())
}