// ==========================================================================
// BuzzU E2E Encrypted Signaling — XChaCha20-Poly1305
// ==========================================================================
// All signaling messages that carry sensitive data (SDP, ICE, chat, keys)
// are encrypted with XChaCha20-Poly1305 before being sent through
// Cloudflare's relay.  XChaCha20 was chosen over AES-GCM because:
//   • 24-byte nonce → safe with random nonces (~2^96 before collision)
//   • No need for nonce counters that break across WS reconnects
//   • No hardware timing side-channels (constant-time by design)
//   • ~3× faster than AES-GCM on devices without AES-NI (most phones)
//
// Key exchange: X25519 ECDH → HKDF-SHA256 → 32-byte ChaCha key
// Wire format:  [24-byte nonce][ciphertext + 16-byte Poly1305 tag]
// All encoded as base64 for JSON transport over WebSocket.
// ==========================================================================

use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce,
};
use hkdf::Hkdf;
use sha2::Sha256;
use rand::rngs::OsRng;
use rand::RngCore;
use x25519_dalek::{PublicKey, StaticSecret};
use base64::{Engine as _, engine::general_purpose};
use wasm_bindgen::prelude::*;
use zeroize::Zeroize;

const XCHACHA_NONCE_SIZE: usize = 24;
const KEY_SIZE: usize = 32;
const HKDF_INFO_SIGNALING: &[u8] = b"BuzzU_Signaling_E2E_XChaCha20";

// ── Public WASM API ──────────────────────────────────────────────────────

/// XChaCha20-Poly1305 encryption engine for E2E encrypted signaling.
/// Each peer holds one after completing X25519 key exchange.
#[wasm_bindgen]
pub struct ChaChaEngine {
    key: [u8; KEY_SIZE],
}

#[wasm_bindgen]
impl ChaChaEngine {
    /// Create from a raw 32-byte base64-encoded key (e.g. for testing).
    #[wasm_bindgen(constructor)]
    pub fn new(key_base64: &str) -> Result<ChaChaEngine, JsValue> {
        let key_bytes = general_purpose::STANDARD
            .decode(key_base64)
            .map_err(|e| JsValue::from_str(&format!("Invalid key: {}", e)))?;
        if key_bytes.len() != KEY_SIZE {
            return Err(JsValue::from_str("Key must be 32 bytes"));
        }
        let mut key = [0u8; KEY_SIZE];
        key.copy_from_slice(&key_bytes);
        Ok(ChaChaEngine { key })
    }

    /// Derive an encryption key from an X25519 shared secret via HKDF.
    /// `shared_secret_b64` is the base64 of the raw 32-byte DH output.
    /// `salt_b64` is optional base64-encoded salt (use peer IDs sorted).
    #[wasm_bindgen(js_name = "fromSharedSecret")]
    pub fn from_shared_secret(
        shared_secret_b64: &str,
        salt_b64: Option<String>,
    ) -> Result<ChaChaEngine, JsValue> {
        let ss_bytes = general_purpose::STANDARD
            .decode(shared_secret_b64)
            .map_err(|e| JsValue::from_str(&format!("Invalid shared secret: {}", e)))?;

        let salt_bytes = salt_b64
            .as_deref()
            .map(|s| general_purpose::STANDARD.decode(s).ok())
            .flatten();

        let hk = Hkdf::<Sha256>::new(
            salt_bytes.as_deref(),
            &ss_bytes,
        );
        let mut key = [0u8; KEY_SIZE];
        hk.expand(HKDF_INFO_SIGNALING, &mut key)
            .map_err(|_| JsValue::from_str("HKDF expansion failed"))?;

        Ok(ChaChaEngine { key })
    }

    /// Encrypt a plaintext string. Returns base64 of [nonce‖ciphertext‖tag].
    /// The nonce is random (24 bytes) — safe for XChaCha20.
    #[wasm_bindgen]
    pub fn encrypt(&self, plaintext: &str) -> Result<String, JsValue> {
        self.encrypt_bytes(plaintext.as_bytes())
    }

    /// Encrypt raw bytes. Returns base64 of [nonce‖ciphertext‖tag].
    #[wasm_bindgen(js_name = "encryptBytes")]
    pub fn encrypt_bytes(&self, plaintext: &[u8]) -> Result<String, JsValue> {
        let cipher = XChaCha20Poly1305::new_from_slice(&self.key)
            .map_err(|e| JsValue::from_str(&format!("Cipher init: {}", e)))?;

        let mut nonce_bytes = [0u8; XCHACHA_NONCE_SIZE];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = XNonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext)
            .map_err(|e| JsValue::from_str(&format!("Encryption failed: {}", e)))?;

        // Wire format: [24-byte nonce][ciphertext + 16-byte tag]
        let mut result = Vec::with_capacity(XCHACHA_NONCE_SIZE + ciphertext.len());
        result.extend_from_slice(&nonce_bytes);
        result.extend_from_slice(&ciphertext);

        Ok(general_purpose::STANDARD.encode(&result))
    }

    /// Decrypt base64-encoded [nonce‖ciphertext‖tag] → plaintext string.
    #[wasm_bindgen]
    pub fn decrypt(&self, encrypted_b64: &str) -> Result<String, JsValue> {
        let bytes = self.decrypt_bytes(encrypted_b64)?;
        String::from_utf8(bytes)
            .map_err(|e| JsValue::from_str(&format!("Invalid UTF-8: {}", e)))
    }

    /// Decrypt base64-encoded [nonce‖ciphertext‖tag] → raw bytes.
    #[wasm_bindgen(js_name = "decryptBytes")]
    pub fn decrypt_bytes(&self, encrypted_b64: &str) -> Result<Vec<u8>, JsValue> {
        let data = general_purpose::STANDARD
            .decode(encrypted_b64)
            .map_err(|e| JsValue::from_str(&format!("Invalid base64: {}", e)))?;

        if data.len() < XCHACHA_NONCE_SIZE + 16 {
            // Need at least nonce + 16-byte Poly1305 tag
            return Err(JsValue::from_str("Ciphertext too short"));
        }

        let (nonce_bytes, ciphertext) = data.split_at(XCHACHA_NONCE_SIZE);
        let nonce = XNonce::from_slice(nonce_bytes);

        let cipher = XChaCha20Poly1305::new_from_slice(&self.key)
            .map_err(|e| JsValue::from_str(&format!("Cipher init: {}", e)))?;

        cipher
            .decrypt(nonce, ciphertext)
            .map_err(|_| JsValue::from_str("Decryption failed — invalid key or corrupted data"))
    }

    /// Generate a fresh random 32-byte key, returned as base64.
    #[wasm_bindgen(js_name = "generateKey")]
    pub fn generate_key() -> String {
        let mut key = [0u8; KEY_SIZE];
        OsRng.fill_bytes(&mut key);
        let encoded = general_purpose::STANDARD.encode(&key);
        key.zeroize();
        encoded
    }
}

impl Drop for ChaChaEngine {
    fn drop(&mut self) {
        self.key.zeroize();
    }
}

// ── Standalone helpers (non-WASM, for Rust-only usage) ───────────────────

/// Perform X25519 ECDH and derive a ChaCha20 key via HKDF.
/// Returns (shared_key_b64, our_public_key_b64).
#[wasm_bindgen(js_name = "generateSignalingKeypair")]
pub fn generate_signaling_keypair() -> Result<JsValue, JsValue> {
    let mut private_bytes = [0u8; 32];
    OsRng.fill_bytes(&mut private_bytes);
    let secret = StaticSecret::from(private_bytes);
    let public = PublicKey::from(&secret);

    let result = js_sys::Object::new();
    js_sys::Reflect::set(
        &result,
        &"privateKey".into(),
        &general_purpose::STANDARD.encode(&private_bytes).into(),
    )?;
    js_sys::Reflect::set(
        &result,
        &"publicKey".into(),
        &general_purpose::STANDARD.encode(public.as_bytes()).into(),
    )?;
    private_bytes.zeroize();
    Ok(result.into())
}

/// Compute X25519 ECDH shared secret from our private key + their public key.
/// Returns base64 of the raw 32-byte shared secret.
#[wasm_bindgen(js_name = "computeSharedSecret")]
pub fn compute_shared_secret(
    our_private_b64: &str,
    their_public_b64: &str,
) -> Result<String, JsValue> {
    let our_bytes = general_purpose::STANDARD
        .decode(our_private_b64)
        .map_err(|e| JsValue::from_str(&format!("Invalid private key: {}", e)))?;
    let their_bytes = general_purpose::STANDARD
        .decode(their_public_b64)
        .map_err(|e| JsValue::from_str(&format!("Invalid public key: {}", e)))?;

    if our_bytes.len() != 32 || their_bytes.len() != 32 {
        return Err(JsValue::from_str("Keys must be 32 bytes"));
    }

    let our_secret = StaticSecret::from(<[u8; 32]>::try_from(our_bytes.as_slice())
        .map_err(|_| JsValue::from_str("Private key must be 32 bytes"))?);
    let their_public = PublicKey::from(<[u8; 32]>::try_from(their_bytes.as_slice())
        .map_err(|_| JsValue::from_str("Public key must be 32 bytes"))?);

    let shared = our_secret.diffie_hellman(&their_public);
    Ok(general_purpose::STANDARD.encode(shared.as_bytes()))
}

/// Derive a signaling encryption key from a shared secret + optional salt.
/// Returns base64 of the 32-byte derived key.
#[wasm_bindgen(js_name = "deriveSignalingKey")]
pub fn derive_signaling_key(
    shared_secret_b64: &str,
    salt_b64: Option<String>,
) -> Result<String, JsValue> {
    let ss_bytes = general_purpose::STANDARD
        .decode(shared_secret_b64)
        .map_err(|e| JsValue::from_str(&format!("Invalid shared secret: {}", e)))?;

    let salt_bytes = salt_b64
        .as_deref()
        .map(|s| general_purpose::STANDARD.decode(s).ok())
        .flatten();

    let hk = Hkdf::<Sha256>::new(salt_bytes.as_deref(), &ss_bytes);
    let mut key = [0u8; KEY_SIZE];
    hk.expand(HKDF_INFO_SIGNALING, &mut key)
        .map_err(|_| JsValue::from_str("HKDF expansion failed"))?;

    let encoded = general_purpose::STANDARD.encode(&key);
    key.zeroize();
    Ok(encoded)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = ChaChaEngine::generate_key();
        let engine = ChaChaEngine::new(&key).unwrap();
        let plaintext = "Hello, BuzzU signaling!";
        let encrypted = engine.encrypt(plaintext).unwrap();
        let decrypted = engine.decrypt(&encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_wrong_key_fails() {
        let key1 = ChaChaEngine::generate_key();
        let key2 = ChaChaEngine::generate_key();
        let engine1 = ChaChaEngine::new(&key1).unwrap();
        let engine2 = ChaChaEngine::new(&key2).unwrap();
        let encrypted = engine1.encrypt("secret").unwrap();
        assert!(engine2.decrypt(&encrypted).is_err());
    }
}
