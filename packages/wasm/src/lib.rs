use wasm_bindgen::prelude::*;

pub mod crypto;
pub mod signaling;
pub mod connection_quality; // Renamed from dcutr
pub mod transport;
pub mod peer;
pub mod file;
pub mod message;
pub mod relay;
pub mod compression;
pub mod nat;
pub mod worker;
pub mod stun_prober;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
    console_log!("BuzzU WASM initialized with crypto support");
}

#[wasm_bindgen]
pub struct BuzzUEngine {
    initialized: bool,
}

#[wasm_bindgen]
impl BuzzUEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        console_log!("BuzzUEngine initialized");
        Self {
            initialized: true,
        }
    }

    pub fn is_initialized(&self) -> bool {
        self.initialized
    }

    pub fn process(&self, input: &str) -> String {
        format!("Processed: {}", input)
    }
}

// Export NAT types for JavaScript interop - removed PortPredictor
pub use nat::{NatAnalyzer, NatType};
// Export ConnectionQualityEngine
pub use connection_quality::{ConnectionQualityEngine, RttMeasurement, TimingInfo, ConnectionQualityState, TimingSyncState};
// Export FileChunker and MessageQueue
pub use file::chunker::FileChunker;
pub use file::{FileTransferEngine, FileMetadata, FileChunk, TransferProgress, FileTransferState, FileTransferType};
pub use message::{MessageRouter, RoutedMessage, MessageMetadata, MessageType, MessagePriority, DeliveryMode, MessageState};
pub use crypto::signal::{SignalProtocol, PreKeyBundle, SignalKeyPair, SignalSession};
// Export ChaCha20 E2E encryption for signaling
pub use crypto::chacha::ChaChaEngine;
// Export WorkerEngine for Web Worker integration
pub use worker::WorkerEngine;