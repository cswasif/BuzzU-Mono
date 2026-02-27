//! Peer Relay Module - Route traffic through intermediate peers
//! 
//! When direct WebRTC connection fails and hole punching doesn't work,
//! use another peer as a relay before falling back to expensive TURN servers.

use std::collections::HashMap;
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

/// RTT measurement sample
#[derive(Debug, Clone)]
struct RttSample {
    rtt_ms: f64,
}

/// Relay candidate with quality metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[wasm_bindgen]
pub struct RelayCandidate {
    peer_id: String,
    rtt_to_us: f64,      // RTT from us to this peer
    rtt_to_target: f64,  // RTT from this peer to target (if known)
    total_rtt: f64,      // Combined RTT estimate
    reliability: f64,    // 0.0 to 1.0 based on connection stability
    bandwidth_kbps: u32, // Available bandwidth estimate
}

#[wasm_bindgen]
impl RelayCandidate {
    #[wasm_bindgen(getter)]
    pub fn peer_id(&self) -> String {
        self.peer_id.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn total_rtt(&self) -> f64 {
        self.total_rtt
    }

    #[wasm_bindgen(getter)]
    pub fn reliability(&self) -> f64 {
        self.reliability
    }
}

/// Relayed packet format
#[derive(Debug, Clone, Serialize, Deserialize)]
#[wasm_bindgen]
pub struct RelayedPacket {
    from: String,
    via: String,
    to: String,
    payload: Vec<u8>,
    hop_count: u8,
    timestamp: f64,
}

#[wasm_bindgen]
impl RelayedPacket {
    #[wasm_bindgen(getter)]
    pub fn from(&self) -> String {
        self.from.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn via(&self) -> String {
        self.via.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn to(&self) -> String {
        self.to.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn hop_count(&self) -> u8 {
        self.hop_count
    }

    pub fn get_payload(&self) -> Vec<u8> {
        self.payload.clone()
    }
}

/// Relay Manager - Selects optimal relay paths based on latency
#[wasm_bindgen]
pub struct RelayManager {
    our_peer_id: String,
    // peer_id -> RTT samples (rolling window)
    rtt_measurements: HashMap<String, Vec<RttSample>>,
    // peer_id -> list of peers they can reach
    peer_reachability: HashMap<String, Vec<String>>,
    // Maximum samples to keep for RTT averaging
    max_rtt_samples: usize,
    // Maximum hop count for multi-hop relay
    max_hops: u8,
}

#[wasm_bindgen]
impl RelayManager {
    #[wasm_bindgen(constructor)]
    pub fn new(our_peer_id: String) -> Self {
        Self {
            our_peer_id,
            rtt_measurements: HashMap::new(),
            peer_reachability: HashMap::new(),
            max_rtt_samples: 10,
            max_hops: 2,
        }
    }

    /// Record an RTT measurement to a peer
    #[wasm_bindgen]
    pub fn record_rtt(&mut self, peer_id: String, rtt_ms: f64, _timestamp: f64) {
        let samples = self.rtt_measurements.entry(peer_id).or_insert_with(Vec::new);
        
        samples.push(RttSample { rtt_ms });
        
        // Keep only recent samples
        if samples.len() > self.max_rtt_samples {
            samples.remove(0);
        }
    }

    /// Update reachability information - which peers can reach which other peers
    #[wasm_bindgen]
    pub fn update_reachability(&mut self, peer_id: String, reachable_peers_json: &str) {
        if let Ok(peers) = serde_json::from_str::<Vec<String>>(reachable_peers_json) {
            self.peer_reachability.insert(peer_id, peers);
        }
    }

    /// Get average RTT to a peer
    fn get_avg_rtt(&self, peer_id: &str) -> Option<f64> {
        self.rtt_measurements.get(peer_id).map(|samples| {
            if samples.is_empty() {
                return f64::MAX;
            }
            let sum: f64 = samples.iter().map(|s| s.rtt_ms).sum();
            sum / samples.len() as f64
        })
    }

    /// Calculate reliability score based on RTT consistency
    fn calculate_reliability(&self, peer_id: &str) -> f64 {
        if let Some(samples) = self.rtt_measurements.get(peer_id) {
            if samples.len() < 2 {
                return 0.5; // Unknown reliability
            }
            
            let avg = samples.iter().map(|s| s.rtt_ms).sum::<f64>() / samples.len() as f64;
            let variance = samples.iter()
                .map(|s| (s.rtt_ms - avg).powi(2))
                .sum::<f64>() / samples.len() as f64;
            let std_dev = variance.sqrt();
            
            // Lower jitter = higher reliability
            // If std_dev is 0, reliability is 1.0
            // If std_dev >= avg, reliability is ~0.2
            let jitter_ratio = std_dev / avg.max(1.0);
            (1.0 - jitter_ratio.min(0.8)).max(0.2)
        } else {
            0.3 // Unknown peer
        }
    }

    /// Find the best relay candidate to reach a target peer
    #[wasm_bindgen]
    pub fn find_best_relay(&self, target_peer_id: &str) -> Option<RelayCandidate> {
        let mut candidates: Vec<RelayCandidate> = Vec::new();

        for (relay_peer_id, reachable) in &self.peer_reachability {
            // Skip if this is us or the target
            if relay_peer_id == &self.our_peer_id || relay_peer_id == target_peer_id {
                continue;
            }

            // Check if this peer can reach the target
            if !reachable.contains(&target_peer_id.to_string()) {
                continue;
            }

            // Get RTT to relay
            let rtt_to_relay = match self.get_avg_rtt(relay_peer_id) {
                Some(rtt) if rtt < f64::MAX => rtt,
                _ => continue, // Skip if we don't have RTT data
            };

            // Estimate total RTT (assume similar RTT from relay to target)
            // In real implementation, relay peer would report this
            let estimated_rtt_to_target = rtt_to_relay; // Conservative estimate
            let total_rtt = rtt_to_relay + estimated_rtt_to_target;

            let reliability = self.calculate_reliability(relay_peer_id);

            candidates.push(RelayCandidate {
                peer_id: relay_peer_id.clone(),
                rtt_to_us: rtt_to_relay,
                rtt_to_target: estimated_rtt_to_target,
                total_rtt,
                reliability,
                bandwidth_kbps: 1000, // Default estimate
            });
        }

        // Sort by weighted score: lower RTT and higher reliability is better
        candidates.sort_by(|a, b| {
            let score_a = a.total_rtt / a.reliability;
            let score_b = b.total_rtt / b.reliability;
            score_a.partial_cmp(&score_b).unwrap_or(std::cmp::Ordering::Equal)
        });

        candidates.into_iter().next()
    }

    /// Find all viable relay candidates sorted by quality
    #[wasm_bindgen]
    pub fn find_relay_candidates(&self, target_peer_id: &str) -> String {
        let mut candidates: Vec<RelayCandidate> = Vec::new();

        for (relay_peer_id, reachable) in &self.peer_reachability {
            if relay_peer_id == &self.our_peer_id || relay_peer_id == target_peer_id {
                continue;
            }

            if !reachable.contains(&target_peer_id.to_string()) {
                continue;
            }

            if let Some(rtt) = self.get_avg_rtt(relay_peer_id) {
                if rtt < f64::MAX {
                    candidates.push(RelayCandidate {
                        peer_id: relay_peer_id.clone(),
                        rtt_to_us: rtt,
                        rtt_to_target: rtt,
                        total_rtt: rtt * 2.0,
                        reliability: self.calculate_reliability(relay_peer_id),
                        bandwidth_kbps: 1000,
                    });
                }
            }
        }

        candidates.sort_by(|a, b| {
            a.total_rtt.partial_cmp(&b.total_rtt).unwrap_or(std::cmp::Ordering::Equal)
        });

        serde_json::to_string(&candidates).unwrap_or_else(|_| "[]".to_string())
    }

    /// Wrap data for relay - creates a RelayedPacket
    #[wasm_bindgen]
    pub fn wrap_for_relay(&self, data: &[u8], via_peer: &str, to_peer: &str, timestamp: f64) -> Vec<u8> {
        let packet = RelayedPacket {
            from: self.our_peer_id.clone(),
            via: via_peer.to_string(),
            to: to_peer.to_string(),
            payload: data.to_vec(),
            hop_count: 1,
            timestamp,
        };

        serde_json::to_vec(&packet).unwrap_or_default()
    }

    /// Unwrap a relayed packet - returns JSON with packet info
    #[wasm_bindgen]
    pub fn unwrap_relay(&self, data: &[u8]) -> String {
        match serde_json::from_slice::<RelayedPacket>(data) {
            Ok(packet) => serde_json::to_string(&packet).unwrap_or_else(|_| "{}".to_string()),
            Err(_) => "{}".to_string(),
        }
    }

    /// Check if we should relay a packet (we're the via peer)
    #[wasm_bindgen]
    pub fn should_relay(&self, data: &[u8]) -> bool {
        if let Ok(packet) = serde_json::from_slice::<RelayedPacket>(data) {
            packet.via == self.our_peer_id && packet.hop_count < self.max_hops
        } else {
            false
        }
    }

    /// Increment hop count for forwarding
    #[wasm_bindgen]
    pub fn forward_relay(&self, data: &[u8]) -> Vec<u8> {
        if let Ok(mut packet) = serde_json::from_slice::<RelayedPacket>(data) {
            packet.hop_count += 1;
            serde_json::to_vec(&packet).unwrap_or_default()
        } else {
            data.to_vec()
        }
    }

    /// Get connected peer count
    #[wasm_bindgen]
    pub fn connected_peer_count(&self) -> usize {
        self.rtt_measurements.len()
    }

    /// Clear all measurements (for testing)
    #[wasm_bindgen]
    pub fn clear(&mut self) {
        self.rtt_measurements.clear();
        self.peer_reachability.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rtt_recording() {
        let mut manager = RelayManager::new("peer-a".to_string());
        manager.record_rtt("peer-b".to_string(), 50.0, 1000.0);
        manager.record_rtt("peer-b".to_string(), 60.0, 1100.0);
        
        let avg = manager.get_avg_rtt("peer-b").unwrap();
        assert!((avg - 55.0).abs() < 0.01);
    }

    #[test]
    fn test_find_best_relay() {
        let mut manager = RelayManager::new("peer-a".to_string());
        
        // Record RTTs
        manager.record_rtt("peer-b".to_string(), 50.0, 1000.0);
        manager.record_rtt("peer-c".to_string(), 30.0, 1000.0);
        
        // Set reachability
        manager.update_reachability("peer-b".to_string(), r#"["peer-d"]"#);
        manager.update_reachability("peer-c".to_string(), r#"["peer-d"]"#);
        
        let best = manager.find_best_relay("peer-d");
        assert!(best.is_some());
        assert_eq!(best.unwrap().peer_id, "peer-c"); // Lower RTT
    }
}
