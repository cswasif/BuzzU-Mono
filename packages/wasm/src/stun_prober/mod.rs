//! stun_prober — Rust WASM module for STUN server latency analysis & ranking.
//!
//! Since browsers cannot send raw UDP, the JS side probes STUN servers via
//! throwaway RTCPeerConnections (ICE candidate gathering timing). The raw
//! RTT measurements are fed into this Rust module which performs:
//!
//!   1. Statistical analysis (mean, median, p95, jitter, packet loss)
//!   2. Weighted scoring (RTT 60%, jitter 25%, reliability 15%)
//!   3. Ranking — returns the optimal server list sorted by score
//!   4. Caching — results are valid for the entire session
//!
//! **Probe-once strategy**: For a dating/chat app, connections are sporadic.
//! We probe all STUN servers once at page load (pre-warm + 2 extra rounds),
//! then lock in the ranking for the entire session. Live WebRTC RTT
//! feedback from active connections refines the ranking organically —
//! no periodic background re-probing needed. `reprobeNow()` is available
//! for edge cases (network change, ICE restart) but never auto-fires.
//!
//! Based on RFC 5389 STUN Binding Request/Response patterns observed in:
//!   - webrtc-rs/webrtc (ice_gatherer.rs — sans-IO STUN client)
//!   - ystreet/stun-proto (RFC 5389/8489 implementation)

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

/// Maximum samples per server before oldest are evicted (ring buffer).
const MAX_SAMPLES_PER_SERVER: usize = 20;

/// Maximum number of STUN servers we can track simultaneously.
const MAX_SERVERS: usize = 16;

/// Default TTL for cached results (milliseconds).
/// Set to 30 minutes — effectively session-lifetime for a dating app.
/// Rankings are computed once at page load and reused for every match.
/// Live RTT feedback from active connections refines them organically.
const DEFAULT_CACHE_TTL_MS: u64 = 1_800_000; // 30 minutes

/// Minimum probes needed before a server is considered "measured".
const MIN_PROBES_FOR_RANKING: usize = 3;

// ── Types ──────────────────────────────────────────────────────────────

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StunServerResult {
    url: String,
    /// Mean RTT in ms across all successful probes
    mean_rtt_ms: f64,
    /// Median RTT in ms
    median_rtt_ms: f64,
    /// 95th percentile RTT
    p95_rtt_ms: f64,
    /// Jitter (standard deviation of RTT samples)
    jitter_ms: f64,
    /// Reliability: successful_probes / total_probes (0.0 – 1.0)
    reliability: f64,
    /// Composite score (lower = better). Weighted combination.
    score: f64,
    /// Number of successful probes
    probe_count: u32,
    /// Number of failed probes (timeouts)
    fail_count: u32,
}

#[wasm_bindgen]
impl StunServerResult {
    #[wasm_bindgen(getter)]
    pub fn url(&self) -> String {
        self.url.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn mean_rtt_ms(&self) -> f64 {
        self.mean_rtt_ms
    }

    #[wasm_bindgen(getter)]
    pub fn median_rtt_ms(&self) -> f64 {
        self.median_rtt_ms
    }

    #[wasm_bindgen(getter)]
    pub fn p95_rtt_ms(&self) -> f64 {
        self.p95_rtt_ms
    }

    #[wasm_bindgen(getter)]
    pub fn jitter_ms(&self) -> f64 {
        self.jitter_ms
    }

    #[wasm_bindgen(getter)]
    pub fn reliability(&self) -> f64 {
        self.reliability
    }

    #[wasm_bindgen(getter)]
    pub fn score(&self) -> f64 {
        self.score
    }

    #[wasm_bindgen(getter)]
    pub fn probe_count(&self) -> u32 {
        self.probe_count
    }

    #[wasm_bindgen(getter)]
    pub fn fail_count(&self) -> u32 {
        self.fail_count
    }
}

// ── Internal per-server state ──────────────────────────────────────────

#[derive(Debug, Clone)]
struct ServerState {
    url: String,
    /// Ring buffer of RTT samples (ms)
    rtt_samples: Vec<f64>,
    /// Write index for ring buffer
    write_idx: usize,
    /// Total successful probes (lifetime)
    success_count: u32,
    /// Total failed probes (lifetime)
    fail_count: u32,
    /// Timestamp of last probe (ms since epoch)
    last_probe_ms: u64,
}

impl ServerState {
    fn new(url: String) -> Self {
        Self {
            url,
            rtt_samples: Vec::with_capacity(MAX_SAMPLES_PER_SERVER),
            write_idx: 0,
            success_count: 0,
            fail_count: 0,
            last_probe_ms: 0,
        }
    }

    /// Add a successful RTT sample.
    fn add_rtt(&mut self, rtt_ms: f64, now_ms: u64) {
        self.success_count += 1;
        self.last_probe_ms = now_ms;

        if self.rtt_samples.len() < MAX_SAMPLES_PER_SERVER {
            self.rtt_samples.push(rtt_ms);
        } else {
            self.rtt_samples[self.write_idx] = rtt_ms;
        }
        self.write_idx = (self.write_idx + 1) % MAX_SAMPLES_PER_SERVER;
    }

    /// Record a failed probe (timeout / error).
    fn add_failure(&mut self, now_ms: u64) {
        self.fail_count += 1;
        self.last_probe_ms = now_ms;
    }

    /// Compute statistics over the sample buffer.
    fn compute_stats(&self) -> Option<StunServerResult> {
        if self.rtt_samples.len() < MIN_PROBES_FOR_RANKING {
            return None;
        }

        let n = self.rtt_samples.len() as f64;
        let mut sorted = self.rtt_samples.clone();
        // Sort ascending — f64 doesn't implement Ord, use partial_cmp
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

        let mean = sorted.iter().sum::<f64>() / n;
        let median = if sorted.len() % 2 == 0 {
            (sorted[sorted.len() / 2 - 1] + sorted[sorted.len() / 2]) / 2.0
        } else {
            sorted[sorted.len() / 2]
        };
        let p95_idx = ((sorted.len() as f64 * 0.95).ceil() as usize).min(sorted.len() - 1);
        let p95 = sorted[p95_idx];

        // Jitter = standard deviation
        let variance = sorted.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n;
        let jitter = variance.sqrt();

        let total_probes = self.success_count + self.fail_count;
        let reliability = if total_probes > 0 {
            self.success_count as f64 / total_probes as f64
        } else {
            0.0
        };

        // Weighted score: lower = better
        //   RTT (60%) + jitter (25%) + unreliability penalty (15%)
        //
        // We use median rather than mean for RTT to reduce outlier influence.
        // The unreliability penalty is exponential — a server with 80% reliability
        // gets a much bigger penalty than 95%.
        let unreliability_penalty = (1.0 - reliability).powi(2) * 500.0; // max 500ms penalty at 0% reliability
        let score = median * 0.60 + jitter * 0.25 + unreliability_penalty * 0.15;

        Some(StunServerResult {
            url: self.url.clone(),
            mean_rtt_ms: (mean * 100.0).round() / 100.0,
            median_rtt_ms: (median * 100.0).round() / 100.0,
            p95_rtt_ms: (p95 * 100.0).round() / 100.0,
            jitter_ms: (jitter * 100.0).round() / 100.0,
            reliability: (reliability * 1000.0).round() / 1000.0,
            score: (score * 100.0).round() / 100.0,
            probe_count: self.success_count,
            fail_count: self.fail_count,
        })
    }
}

// ── Main engine ────────────────────────────────────────────────────────

#[wasm_bindgen]
pub struct StunProber {
    servers: Vec<ServerState>,
    cache_ttl_ms: u64,
    last_ranking_ms: u64,
    cached_ranking: Vec<StunServerResult>,
}

#[wasm_bindgen]
impl StunProber {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            servers: Vec::with_capacity(MAX_SERVERS),
            cache_ttl_ms: DEFAULT_CACHE_TTL_MS,
            last_ranking_ms: 0,
            cached_ranking: Vec::new(),
        }
    }

    /// Set the cache TTL in milliseconds.
    pub fn set_cache_ttl(&mut self, ttl_ms: u64) {
        self.cache_ttl_ms = ttl_ms;
    }

    /// Register a STUN server URL for probing.
    /// Returns false if max servers reached.
    pub fn add_server(&mut self, url: &str) -> bool {
        if self.servers.len() >= MAX_SERVERS {
            return false;
        }
        // Don't add duplicates
        if self.servers.iter().any(|s| s.url == url) {
            return true;
        }
        self.servers.push(ServerState::new(url.to_string()));
        true
    }

    /// Record a successful RTT measurement from the JS probing layer.
    /// `url` — the STUN server URL
    /// `rtt_ms` — round-trip time in milliseconds
    /// `now_ms` — current timestamp (performance.now() or Date.now())
    pub fn record_rtt(&mut self, url: &str, rtt_ms: f64, now_ms: u64) {
        if let Some(server) = self.servers.iter_mut().find(|s| s.url == url) {
            server.add_rtt(rtt_ms, now_ms);
            // Invalidate cache since new data arrived
            self.last_ranking_ms = 0;
        }
    }

    /// Record a failed probe (timeout / unreachable).
    pub fn record_failure(&mut self, url: &str, now_ms: u64) {
        if let Some(server) = self.servers.iter_mut().find(|s| s.url == url) {
            server.add_failure(now_ms);
            self.last_ranking_ms = 0;
        }
    }

    /// Get the number of registered servers.
    pub fn server_count(&self) -> usize {
        self.servers.len()
    }

    /// Get ranking — returns JSON array of StunServerResult sorted by score.
    /// Uses cache if results are fresh (within TTL).
    pub fn get_ranking_json(&mut self, now_ms: u64) -> String {
        // Return cached if still fresh
        if self.last_ranking_ms > 0
            && now_ms.saturating_sub(self.last_ranking_ms) < self.cache_ttl_ms
            && !self.cached_ranking.is_empty()
        {
            return serde_json::to_string(&self.cached_ranking).unwrap_or_default();
        }

        let mut results: Vec<StunServerResult> = self
            .servers
            .iter()
            .filter_map(|s| s.compute_stats())
            .collect();

        // Sort by score ascending (lower = better)
        results.sort_by(|a, b| a.score.partial_cmp(&b.score).unwrap_or(std::cmp::Ordering::Equal));

        self.cached_ranking = results.clone();
        self.last_ranking_ms = now_ms;

        serde_json::to_string(&results).unwrap_or_default()
    }

    /// Get the top N best STUN server URLs as a JSON array of strings.
    /// This is the primary API — called by useIceServers to get the optimal config.
    pub fn get_best_urls_json(&mut self, count: usize, now_ms: u64) -> String {
        // Ensure ranking is fresh (populates self.cached_ranking)
        let _ = self.get_ranking_json(now_ms);

        let urls: Vec<&str> = self.cached_ranking
            .iter()
            .take(count)
            .map(|r| r.url.as_str())
            .collect();
        serde_json::to_string(&urls).unwrap_or_default()
    }

    /// Check if we have enough data to produce a ranking.
    pub fn is_ready(&self) -> bool {
        self.servers
            .iter()
            .filter(|s| s.rtt_samples.len() >= MIN_PROBES_FOR_RANKING)
            .count()
            >= 2 // Need at least 2 servers measured to rank
    }

    /// Check if cache is stale and re-probing is needed.
    pub fn needs_reprobing(&self, now_ms: u64) -> bool {
        if self.last_ranking_ms == 0 {
            return true;
        }
        now_ms.saturating_sub(self.last_ranking_ms) >= self.cache_ttl_ms
    }

    /// Get a specific server's stats as JSON (for debugging UI).
    pub fn get_server_stats_json(&self, url: &str) -> String {
        self.servers
            .iter()
            .find(|s| s.url == url)
            .and_then(|s| s.compute_stats())
            .map(|r| serde_json::to_string(&r).unwrap_or_default())
            .unwrap_or_else(|| "null".to_string())
    }

    /// Merge a remote peer's STUN ranking with our local ranking.
    /// Returns a JSON array sorted by bilateral score (lower = better).
    ///
    /// Each peer probes STUN servers independently. By exchanging rankings
    /// after matching, we find servers that are fast for BOTH peers — ideal
    /// for TURN relay selection and predicting total ICE negotiation time.
    ///
    /// Weighting: 60% local + 40% remote (we trust our own fresh measurements
    /// slightly more). A server that is fast for BOTH peers will always
    /// out-score one that is fast for only one side.
    pub fn merge_peer_ranking(&mut self, peer_ranking_json: &str, now_ms: u64) -> String {
        let peer_results: Vec<StunServerResult> =
            serde_json::from_str(peer_ranking_json).unwrap_or_default();

        let local_json = self.get_ranking_json(now_ms);
        let local_results: Vec<StunServerResult> =
            serde_json::from_str(&local_json).unwrap_or_default();

        if peer_results.is_empty() {
            return local_json;
        }

        let mut combined: Vec<StunServerResult> = Vec::new();

        for local_r in &local_results {
            let mut merged = local_r.clone();
            if let Some(remote_r) = peer_results.iter().find(|r| r.url == local_r.url) {
                // Bilateral weighted score: 60% local, 40% remote
                merged.score =
                    ((local_r.score * 0.6 + remote_r.score * 0.4) * 100.0).round() / 100.0;
            }
            // Servers absent from peer's ranking keep their local score
            combined.push(merged);
        }

        combined
            .sort_by(|a, b| a.score.partial_cmp(&b.score).unwrap_or(std::cmp::Ordering::Equal));
        serde_json::to_string(&combined).unwrap_or_default()
    }

    /// Record a live WebRTC connection RTT measurement.
    /// These samples carry 2× weight because they represent the *real*
    /// peer-to-peer path quality (not a synthetic STUN probe).
    /// Call this with data from `RTCStatsReport` candidate-pair stats.
    pub fn record_live_rtt(&mut self, url: &str, rtt_ms: f64, now_ms: u64) {
        if let Some(server) = self.servers.iter_mut().find(|s| s.url == url) {
            // Record twice to give live measurements 2× statistical weight
            server.add_rtt(rtt_ms, now_ms);
            server.add_rtt(rtt_ms, now_ms);
            self.last_ranking_ms = 0; // invalidate cache
        }
    }

    /// Reset all data for all servers.
    pub fn reset(&mut self) {
        for server in &mut self.servers {
            server.rtt_samples.clear();
            server.write_idx = 0;
            server.success_count = 0;
            server.fail_count = 0;
            server.last_probe_ms = 0;
        }
        self.cached_ranking.clear();
        self.last_ranking_ms = 0;
    }

    /// Remove all servers and data.
    pub fn clear(&mut self) {
        self.servers.clear();
        self.cached_ranking.clear();
        self.last_ranking_ms = 0;
    }
}
