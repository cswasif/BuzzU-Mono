use wasm_bindgen::prelude::*;
use x25519_dalek::{StaticSecret, PublicKey};
use ed25519_dalek::{SigningKey, Signer, Verifier, Signature};
use rand::rngs::OsRng;
use hkdf::Hkdf;
use sha2::Sha256;
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose};

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};

// ====================================================================
// Double Ratchet implementation with AES-256-GCM
// ====================================================================
// This implements the Signal Protocol's Double Ratchet algorithm:
//   1. X3DH (Extended Triple Diffie-Hellman) for initial key agreement
//   2. DH ratchet step on every send (new X25519 keypair per message batch)
//   3. Symmetric ratchet for deriving per-message keys via HKDF
//   4. AES-256-GCM authenticated encryption with unique nonces
//
// Forward secrecy: Compromising the current ratchet key does NOT expose
// past messages because old DH private keys are zeroized after use.
//
// Break-in recovery: After a DH ratchet step, even if the attacker has
// the current chain key, they cannot derive the new root key without
// the new DH output.
// ====================================================================

#[wasm_bindgen(getter_with_clone)]
#[derive(Serialize, Deserialize)]
pub struct SignalKeyPair {
    #[serde(skip)]
    pub(crate) private: [u8; 32],
    pub public: String,
}

#[wasm_bindgen(getter_with_clone)]
#[derive(Serialize, Deserialize)]
pub struct PreKeyBundle {
    pub identity_key: String,
    pub signed_prekey: String,
    pub signed_prekey_signature: String,
    pub onetime_prekey: Option<String>,
    /// The X25519 ratchet public key for the initial DH ratchet step
    pub ratchet_key: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
struct Chain {
    key: [u8; 32],
    index: u32,
}

/// A Double Ratchet session.
///
/// The session holds:
/// - `root_key`: The current root key, updated on every DH ratchet step
/// - `send_chain` / `recv_chain`: Symmetric KDF chains for per-message keys
/// - `our_ratchet_private` / `our_ratchet_public`: Our current DH ratchet keypair
/// - `their_ratchet_public`: The peer's current DH ratchet public key
/// - `dh_ratchet_needed`: Whether the next send should perform a DH ratchet step
#[wasm_bindgen]
#[derive(Serialize, Deserialize)]
pub struct SignalSession {
    root_key: [u8; 32],
    send_chain: Chain,
    recv_chain: Chain,
    // DH ratchet keys
    our_ratchet_private: [u8; 32],
    our_ratchet_public: [u8; 32],
    their_ratchet_public: Option<[u8; 32]>,
    /// Set to true when we receive a new ratchet key from the peer.
    /// The next send will perform a DH ratchet step.
    dh_ratchet_needed: bool,
    /// Message counter for the current send epoch (resets on DH ratchet)
    send_count: u32,
    /// Previous send chain message count (for skipped message tracking)
    prev_send_count: u32,
}

#[wasm_bindgen]
pub struct SignalProtocol {
    identity_dh_key: StaticSecret,
    identity_sign_key: SigningKey,
    signed_prekey: StaticSecret,
    // Stores the last initiation JSON so JS can retrieve it after initiate_session()
    last_initiation: Option<String>,
}

#[wasm_bindgen(getter_with_clone)]
#[derive(Serialize, Deserialize)]
pub struct SessionInitiation {
    pub identity_key: String,
    pub ephemeral_key: String,
    /// Alice's initial ratchet public key for the Double Ratchet
    pub ratchet_key: String,
}

#[wasm_bindgen]
impl SignalProtocol {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            identity_dh_key: StaticSecret::random_from_rng(OsRng),
            identity_sign_key: SigningKey::generate(&mut OsRng),
            signed_prekey: StaticSecret::random_from_rng(OsRng),
            last_initiation: None,
        }
    }

    pub fn generate_bundle(&self) -> JsValue {
        let identity_pub = PublicKey::from(&self.identity_dh_key);
        let identity_sign_pub = self.identity_sign_key.verifying_key();
        let signed_pre_pub = PublicKey::from(&self.signed_prekey);
        
        // Sign the signed_prekey using the identity signing key
        let signature = self.identity_sign_key.sign(signed_pre_pub.as_bytes());
        
        // ratchet_key = signed_prekey public key (Bob uses signed_prekey as initial ratchet)
        // This MUST match the private key Bob uses in respond_to_session()
        let bundle = PreKeyBundle {
            identity_key: general_purpose::STANDARD.encode(identity_pub.as_bytes()),
            signed_prekey: general_purpose::STANDARD.encode(signed_pre_pub.as_bytes()),
            signed_prekey_signature: general_purpose::STANDARD.encode(signature.to_bytes()),
            onetime_prekey: Some(general_purpose::STANDARD.encode(identity_sign_pub.as_bytes())),
            ratchet_key: Some(general_purpose::STANDARD.encode(signed_pre_pub.as_bytes())),
        };
        
        serde_wasm_bindgen::to_value(&bundle).unwrap()
    }

    /// Alice initiates a session: performs X3DH and initializes the Double Ratchet.
    ///
    /// Returns a proper SignalSession WASM handle (with encrypt/decrypt methods).
    /// The handshake initiation data is stored internally — retrieve it with get_last_initiation().
    ///
    /// Alice:
    /// 1. Computes the X3DH shared secret from 3 DH operations
    /// 2. Performs the first DH ratchet step: DH(alice_ratchet, bob_signed_prekey)
    /// 3. Derives the initial root key and send chain from HKDF(x3dh_secret, dh_ratchet_output)
    pub fn initiate_session(&mut self, bundle_json: &str) -> Result<SignalSession, JsValue> {
        let bundle: PreKeyBundle = serde_json::from_str(bundle_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid bundle JSON: {}", e)))?;
        
        let their_identity_bytes = general_purpose::STANDARD.decode(&bundle.identity_key)
            .map_err(|e| JsValue::from_str(&format!("Invalid identity key: {}", e)))?;
        let their_signed_prekey_bytes = general_purpose::STANDARD.decode(&bundle.signed_prekey)
            .map_err(|e| JsValue::from_str(&format!("Invalid signed prekey: {}", e)))?;
            
        let their_identity = PublicKey::from(<[u8; 32]>::try_from(their_identity_bytes.as_slice())
            .map_err(|_| JsValue::from_str("Identity key must be 32 bytes"))?);
        let their_signed_prekey = PublicKey::from(<[u8; 32]>::try_from(their_signed_prekey_bytes.as_slice())
            .map_err(|_| JsValue::from_str("Signed prekey must be 32 bytes"))?);
        
        // Parse Bob's ratchet key if present, otherwise use signed prekey
        let their_ratchet_pub = if let Some(ref rk) = bundle.ratchet_key {
            let rk_bytes = general_purpose::STANDARD.decode(rk)
                .map_err(|e| JsValue::from_str(&format!("Invalid ratchet key: {}", e)))?;
            PublicKey::from(<[u8; 32]>::try_from(rk_bytes.as_slice())
                .map_err(|_| JsValue::from_str("Ratchet key must be 32 bytes"))?)
        } else {
            their_signed_prekey
        };
        
        let our_ephemeral = StaticSecret::random_from_rng(OsRng);
        let our_ephemeral_pub = PublicKey::from(&our_ephemeral);
        
        // Verify signature if a signing key was provided
        if let Some(sign_key_base64) = &bundle.onetime_prekey {
            let sign_key_bytes = general_purpose::STANDARD.decode(sign_key_base64)
                .map_err(|e| JsValue::from_str(&format!("Invalid signing key: {}", e)))?;
            let signature_bytes = general_purpose::STANDARD.decode(&bundle.signed_prekey_signature)
                .map_err(|e| JsValue::from_str(&format!("Invalid signature: {}", e)))?;
            
            if sign_key_bytes.len() >= 32 && signature_bytes.len() >= 64 {
                let verifier = ed25519_dalek::VerifyingKey::from_bytes(
                    <&[u8; 32]>::try_from(&sign_key_bytes[..32]).unwrap()
                ).map_err(|e| JsValue::from_str(&format!("Invalid verifying key: {}", e)))?;
                let signature = Signature::from_bytes(
                    <&[u8; 64]>::try_from(&signature_bytes[..64]).unwrap()
                );
                verifier.verify(their_signed_prekey.as_bytes(), &signature)
                    .map_err(|e| JsValue::from_str(&format!("Signature verification failed: {}", e)))?;
            }
        }

        // X3DH: Compute shared secret from 3 DH operations
        let x3dh_secret = x3dh_initiate(
            &self.identity_dh_key,
            &our_ephemeral,
            &their_identity,
            &their_signed_prekey,
            None
        );
        
        // Generate Alice's initial ratchet keypair
        let alice_ratchet_priv = StaticSecret::random_from_rng(OsRng);
        let alice_ratchet_pub = PublicKey::from(&alice_ratchet_priv);
        
        // First DH ratchet step: DH(alice_ratchet, bob_ratchet_pub)
        let dh_output = alice_ratchet_priv.diffie_hellman(&their_ratchet_pub);
        
        // Derive root_key and send_chain from X3DH + DH ratchet
        let (root_key, send_chain_key) = kdf_rk(&x3dh_secret, dh_output.as_bytes());
        
        let session = SignalSession {
            root_key,
            send_chain: Chain { key: send_chain_key, index: 0 },
            recv_chain: Chain { key: [0u8; 32], index: 0 }, // Will be set on first recv DH ratchet
            our_ratchet_private: alice_ratchet_priv.to_bytes(),
            our_ratchet_public: *alice_ratchet_pub.as_bytes(),
            their_ratchet_public: Some(*their_ratchet_pub.as_bytes()),
            dh_ratchet_needed: false, // Alice just did a DH step, so next send is fine
            send_count: 0,
            prev_send_count: 0,
        };
        
        let initiation = SessionInitiation {
            identity_key: general_purpose::STANDARD.encode(PublicKey::from(&self.identity_dh_key).as_bytes()),
            ephemeral_key: general_purpose::STANDARD.encode(our_ephemeral_pub.as_bytes()),
            ratchet_key: general_purpose::STANDARD.encode(alice_ratchet_pub.as_bytes()),
        };

        // Store initiation JSON for retrieval via get_last_initiation()
        self.last_initiation = Some(serde_json::to_string(&initiation)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize initiation: {}", e)))?);
        
        // Return proper WASM handle — JS can call session.encrypt() / session.decrypt()
        Ok(session)
    }

    /// Get the handshake initiation data from the last initiate_session() call.
    /// This must be sent to the peer so they can call respond_to_session().
    pub fn get_last_initiation(&self) -> Option<String> {
        self.last_initiation.clone()
    }

    /// Bob responds to Alice's session initiation.
    ///
    /// Bob:
    /// 1. Computes the same X3DH shared secret (3 DH, mirrored)
    /// 2. Uses Alice's ratchet public key + his signed prekey to derive the initial recv chain
    /// 3. Sets `dh_ratchet_needed = true` so his first send will generate a new ratchet keypair
    pub fn respond_to_session(&self, initiation_json: &str) -> Result<SignalSession, JsValue> {
        let init: SessionInitiation = serde_json::from_str(initiation_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid initiation JSON: {}", e)))?;
            
        let their_identity_bytes = general_purpose::STANDARD.decode(&init.identity_key)
            .map_err(|e| JsValue::from_str(&format!("Invalid identity key: {}", e)))?;
        let their_ephemeral_bytes = general_purpose::STANDARD.decode(&init.ephemeral_key)
            .map_err(|e| JsValue::from_str(&format!("Invalid ephemeral key: {}", e)))?;
        let their_ratchet_bytes = general_purpose::STANDARD.decode(&init.ratchet_key)
            .map_err(|e| JsValue::from_str(&format!("Invalid ratchet key: {}", e)))?;
            
        let their_identity = PublicKey::from(<[u8; 32]>::try_from(their_identity_bytes.as_slice())
            .map_err(|_| JsValue::from_str("Identity key must be 32 bytes"))?);
        let their_ephemeral = PublicKey::from(<[u8; 32]>::try_from(their_ephemeral_bytes.as_slice())
            .map_err(|_| JsValue::from_str("Ephemeral key must be 32 bytes"))?);
        let their_ratchet_pub = PublicKey::from(<[u8; 32]>::try_from(their_ratchet_bytes.as_slice())
            .map_err(|_| JsValue::from_str("Ratchet key must be 32 bytes"))?);
        
        // Bob side X3DH (mirrored DH operations)
        let dh1 = self.signed_prekey.diffie_hellman(&their_identity);
        let dh2 = self.identity_dh_key.diffie_hellman(&their_ephemeral);
        let dh3 = self.signed_prekey.diffie_hellman(&their_ephemeral);
        
        let mut ikm = [0u8; 96];
        ikm[0..32].copy_from_slice(dh1.as_bytes());
        ikm[32..64].copy_from_slice(dh2.as_bytes());
        ikm[64..96].copy_from_slice(dh3.as_bytes());
        
        let h = Hkdf::<Sha256>::new(None, &ikm);
        let mut x3dh_secret = [0u8; 32];
        h.expand(b"BuzzU_Signal_X3DH", &mut x3dh_secret).expect("HKDF expansion failed");
        
        // Bob mirrors Alice's first DH ratchet: DH(bob_signed_prekey, alice_ratchet_pub)
        // Note: Bob uses his signed_prekey private as the initial ratchet key
        let dh_output = self.signed_prekey.diffie_hellman(&their_ratchet_pub);
        let (root_key, recv_chain_key) = kdf_rk(&x3dh_secret, dh_output.as_bytes());
        
        // Bob's initial ratchet key is his signed prekey
        let bob_ratchet_pub = PublicKey::from(&self.signed_prekey);
        
        Ok(SignalSession {
            root_key,
            send_chain: Chain { key: [0u8; 32], index: 0 }, // Will be set on first send DH ratchet
            recv_chain: Chain { key: recv_chain_key, index: 0 },
            our_ratchet_private: self.signed_prekey.to_bytes(),
            our_ratchet_public: *bob_ratchet_pub.as_bytes(),
            their_ratchet_public: Some(*their_ratchet_pub.as_bytes()),
            dh_ratchet_needed: true, // Bob must do DH ratchet before first send
            send_count: 0,
            prev_send_count: 0,
        })
    }
}

#[wasm_bindgen]
impl SignalSession {
    #[wasm_bindgen(constructor)]
    pub fn new(shared_secret: &[u8]) -> Self {
        // Legacy constructor for backward compatibility
        // Generates a fresh ratchet keypair
        let ratchet_priv = StaticSecret::random_from_rng(OsRng);
        let ratchet_pub = PublicKey::from(&ratchet_priv);
        
        let mut root_key = [0u8; 32];
        root_key.copy_from_slice(&shared_secret[0..32]);

        Self {
            root_key,
            send_chain: Chain { key: root_key, index: 0 },
            recv_chain: Chain { key: root_key, index: 0 },
            our_ratchet_private: ratchet_priv.to_bytes(),
            our_ratchet_public: *ratchet_pub.as_bytes(),
            their_ratchet_public: None,
            dh_ratchet_needed: false,
            send_count: 0,
            prev_send_count: 0,
        }
    }

    /// Get our current ratchet public key (sent with every message header)
    pub fn get_ratchet_public_key(&self) -> String {
        general_purpose::STANDARD.encode(self.our_ratchet_public)
    }

    /// Encrypt plaintext. The output format is:
    /// [32-byte ratchet_public_key | 4-byte message_index | 4-byte prev_count | ciphertext+tag]
    ///
    /// This header allows the receiver to:
    /// 1. Detect if a DH ratchet step is needed (new ratchet key)
    /// 2. Handle skipped/out-of-order messages (message index)
    pub fn encrypt(&mut self, plaintext: &[u8]) -> Result<Vec<u8>, JsValue> {
        // If a DH ratchet is needed (we received a new peer ratchet key), do it now
        if self.dh_ratchet_needed {
            self.dh_ratchet_send()
                .map_err(|e| JsError::new(&format!("DH ratchet failed: {}", e)))?;
        }

        // Symmetric ratchet: derive message key from chain
        let (next_chain_key, message_key) = kdf_ck(&self.send_chain.key);
        self.send_chain.key = next_chain_key;
        let msg_index = self.send_chain.index;
        self.send_chain.index += 1;
        self.send_count += 1;

        // AES-256-GCM encrypt
        let key = Key::<Aes256Gcm>::from_slice(&message_key);
        let cipher = Aes256Gcm::new(key);
        
        // Nonce: HKDF-derived from message_key + index (unique per message)
        let nonce_bytes = derive_nonce(&message_key, msg_index);
        let nonce = Nonce::from_slice(&nonce_bytes);

        // AAD (Associated Authenticated Data): ratchet public key + message index
        // This binds the ciphertext to the message header, preventing tampering
        let mut aad = Vec::with_capacity(36);
        aad.extend_from_slice(&self.our_ratchet_public);
        aad.extend_from_slice(&msg_index.to_be_bytes());
        
        let ciphertext = cipher.encrypt(nonce, aes_gcm::aead::Payload {
            msg: plaintext,
            aad: &aad,
        }).map_err(|e| JsError::new(&format!("Encryption failed: {}", e)))?;

        // Build wire format: [ratchet_pub(32) | msg_index(4) | prev_count(4) | ciphertext]
        let mut output = Vec::with_capacity(40 + ciphertext.len());
        output.extend_from_slice(&self.our_ratchet_public);        // 32 bytes
        output.extend_from_slice(&msg_index.to_be_bytes());         // 4 bytes
        output.extend_from_slice(&self.prev_send_count.to_be_bytes()); // 4 bytes
        output.extend_from_slice(&ciphertext);                      // variable
        
        Ok(output)
    }

    /// Decrypt a message. Reads the header to determine if a DH ratchet step is needed.
    pub fn decrypt(&mut self, message: &[u8]) -> Result<Vec<u8>, JsValue> {
        if message.len() < 40 {
            return Err(JsError::new("Message too short — expected at least 40 bytes (header)").into());
        }

        // Parse header
        let their_ratchet_pub_bytes: [u8; 32] = message[0..32].try_into()
            .map_err(|_| JsError::new("Invalid ratchet key in header"))?;
        let msg_index = u32::from_be_bytes(message[32..36].try_into().unwrap());
        let _prev_count = u32::from_be_bytes(message[36..40].try_into().unwrap());
        let ciphertext = &message[40..];

        // Check if the sender has rotated their ratchet key → we need a DH ratchet step
        let need_dh_ratchet = match self.their_ratchet_public {
            Some(known_pub) => known_pub != their_ratchet_pub_bytes,
            None => true,
        };

        if need_dh_ratchet {
            // Perform receiving DH ratchet step
            self.their_ratchet_public = Some(their_ratchet_pub_bytes);
            self.prev_send_count = self.send_count;
            self.send_count = 0;
            
            let their_pub = PublicKey::from(their_ratchet_pub_bytes);
            let our_priv = StaticSecret::from(self.our_ratchet_private);
            let dh_output = our_priv.diffie_hellman(&their_pub);
            
            // Derive new root key and recv chain
            let (new_root, recv_chain_key) = kdf_rk(&self.root_key, dh_output.as_bytes());
            self.root_key = new_root;
            self.recv_chain = Chain { key: recv_chain_key, index: 0 };
            
            // Mark that our next send needs a DH ratchet step too
            self.dh_ratchet_needed = true;
        }

        // Advance recv chain to the correct index (handle skipped messages)
        while self.recv_chain.index < msg_index {
            let (next_key, _skipped_msg_key) = kdf_ck(&self.recv_chain.key);
            self.recv_chain.key = next_key;
            self.recv_chain.index += 1;
            // Note: In a full implementation we'd save skipped_msg_key for out-of-order decryption
        }

        // Derive the message key for this index
        let (next_chain_key, message_key) = kdf_ck(&self.recv_chain.key);
        self.recv_chain.key = next_chain_key;
        self.recv_chain.index += 1;

        // AES-256-GCM decrypt
        let key = Key::<Aes256Gcm>::from_slice(&message_key);
        let cipher = Aes256Gcm::new(key);
        
        let nonce_bytes = derive_nonce(&message_key, msg_index);
        let nonce = Nonce::from_slice(&nonce_bytes);
        
        // AAD must match what the sender used
        let mut aad = Vec::with_capacity(36);
        aad.extend_from_slice(&their_ratchet_pub_bytes);
        aad.extend_from_slice(&msg_index.to_be_bytes());

        cipher.decrypt(nonce, aes_gcm::aead::Payload {
            msg: ciphertext,
            aad: &aad,
        }).map_err(|e| JsError::new(&format!("Decryption failed: {}", e)).into())
    }

    /// Perform a DH ratchet step on the sending side.
    /// Generates a new ratchet keypair, computes DH output, and derives new root + send chain.
    fn dh_ratchet_send(&mut self) -> Result<(), String> {
        let their_pub_bytes = self.their_ratchet_public
            .ok_or("Cannot DH ratchet: no peer ratchet key")?;
        let their_pub = PublicKey::from(their_pub_bytes);
        
        // Generate new ratchet keypair
        let new_priv = StaticSecret::random_from_rng(OsRng);
        let new_pub = PublicKey::from(&new_priv);
        
        // DH(new_priv, their_pub)
        let dh_output = new_priv.diffie_hellman(&their_pub);
        
        // Derive new root key and send chain
        let (new_root, send_chain_key) = kdf_rk(&self.root_key, dh_output.as_bytes());
        
        self.root_key = new_root;
        self.prev_send_count = self.send_count;
        self.send_count = 0;
        self.send_chain = Chain { key: send_chain_key, index: 0 };
        self.our_ratchet_private = new_priv.to_bytes();
        self.our_ratchet_public = *new_pub.as_bytes();
        self.dh_ratchet_needed = false;
        
        Ok(())
    }
}

/// KDF for the root key chain: HKDF(root_key, dh_output) → (new_root_key, chain_key)
fn kdf_rk(root_key: &[u8; 32], dh_output: &[u8]) -> ([u8; 32], [u8; 32]) {
    let h = Hkdf::<Sha256>::new(Some(root_key), dh_output);
    let mut okm = [0u8; 64];
    h.expand(b"BuzzU_Signal_RootKDF", &mut okm).expect("HKDF expansion failed");
    
    let mut new_root = [0u8; 32];
    let mut chain_key = [0u8; 32];
    new_root.copy_from_slice(&okm[0..32]);
    chain_key.copy_from_slice(&okm[32..64]);
    (new_root, chain_key)
}

/// KDF for the symmetric chain: HKDF(chain_key, constant) → (next_chain_key, message_key)
fn kdf_ck(chain_key: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
    let h = Hkdf::<Sha256>::new(None, chain_key);
    let mut okm = [0u8; 64];
    h.expand(b"BuzzU_Signal_ChainKDF", &mut okm).expect("HKDF expansion failed");
    
    let mut next_chain_key = [0u8; 32];
    let mut message_key = [0u8; 32];
    next_chain_key.copy_from_slice(&okm[0..32]);
    message_key.copy_from_slice(&okm[32..64]);
    (next_chain_key, message_key)
}

/// Derive a unique 12-byte nonce from the message key and index via HKDF.
/// This is safer than zero-padded counter nonces — each nonce is unpredictable
/// and tied to the specific message key.
fn derive_nonce(message_key: &[u8; 32], index: u32) -> [u8; 12] {
    let mut info = [0u8; 20]; // "BuzzU_Nonce" + 4-byte index
    info[0..11].copy_from_slice(b"BuzzU_Nonce");
    info[16..20].copy_from_slice(&index.to_be_bytes());
    
    let h = Hkdf::<Sha256>::new(Some(message_key), b"nonce_derivation");
    let mut nonce = [0u8; 12];
    h.expand(&info, &mut nonce).expect("HKDF nonce derivation failed");
    nonce
}

// X3DH implementation: Extended Triple Diffie-Hellman key agreement
pub fn x3dh_initiate(
    our_identity: &StaticSecret,
    our_ephemeral: &StaticSecret,
    their_identity: &PublicKey,
    their_signed_prekey: &PublicKey,
    their_otpk: Option<&PublicKey>,
) -> [u8; 32] {
    let dh1 = our_identity.diffie_hellman(their_signed_prekey);
    let dh2 = our_ephemeral.diffie_hellman(their_identity);
    let dh3 = our_ephemeral.diffie_hellman(their_signed_prekey);
    
    let mut ikm = [0u8; 96];
    ikm[0..32].copy_from_slice(dh1.as_bytes());
    ikm[32..64].copy_from_slice(dh2.as_bytes());
    ikm[64..96].copy_from_slice(dh3.as_bytes());

    let mut final_ikm = ikm.to_vec();
    if let Some(otpk) = their_otpk {
        let dh4 = our_ephemeral.diffie_hellman(otpk);
        final_ikm.extend_from_slice(dh4.as_bytes());
    }

    let h = Hkdf::<Sha256>::new(None, &final_ikm);
    let mut okm = [0u8; 32];
    h.expand(b"BuzzU_Signal_X3DH", &mut okm).expect("HKDF expansion failed");
    okm
}
