use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConnectionQualityState {
    Idle,
    Measuring,
    Good,
    Fair,
    Poor,
    Failed,
}

#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct RttMeasurement {
    rtt_ms: f64,
    timestamp_ms: u64,
    packet_loss: f64,
}

#[wasm_bindgen]
impl RttMeasurement {
    #[wasm_bindgen(constructor)]
    pub fn new(rtt_ms: f64, timestamp_ms: u64, packet_loss: f64) -> Self {
        Self {
            rtt_ms,
            timestamp_ms,
            packet_loss,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn rtt_ms(&self) -> f64 {
        self.rtt_ms
    }

    #[wasm_bindgen(getter)]
    pub fn timestamp(&self) -> f64 {
        self.timestamp_ms as f64
    }

    #[wasm_bindgen(getter)]
    pub fn packet_loss(&self) -> f64 {
        self.packet_loss
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimingSyncState {
    Unsynchronized,
    Synchronizing,
    Synchronized,
    DriftDetected,
}

#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct TimingInfo {
    local_time: f64,
    remote_time: f64,
    offset_ms: f64,
    drift_rate: f64,
    state: TimingSyncState,
}

#[wasm_bindgen]
impl TimingInfo {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            local_time: js_sys::Date::now(),
            remote_time: 0.0,
            offset_ms: 0.0,
            drift_rate: 0.0,
            state: TimingSyncState::Unsynchronized,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn local_time(&self) -> f64 {
        self.local_time
    }

    #[wasm_bindgen(getter)]
    pub fn remote_time(&self) -> f64 {
        self.remote_time
    }

    #[wasm_bindgen(getter)]
    pub fn offset_ms(&self) -> f64 {
        self.offset_ms
    }

    #[wasm_bindgen(getter)]
    pub fn drift_rate(&self) -> f64 {
        self.drift_rate
    }

    #[wasm_bindgen(getter)]
    pub fn state(&self) -> TimingSyncState {
        self.state
    }
}

#[wasm_bindgen]
pub struct ConnectionQualityEngine {
    rtt_measurements: Vec<RttMeasurement>,
    timing_info: TimingInfo,
    max_rtt_samples: usize,
    connection_quality_state: ConnectionQualityState,
}

#[wasm_bindgen]
impl ConnectionQualityEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            rtt_measurements: Vec::new(),
            timing_info: TimingInfo::new(),
            max_rtt_samples: 100,
            connection_quality_state: ConnectionQualityState::Idle,
        }
    }

    #[wasm_bindgen]
    pub fn measure_rtt(&mut self, send_time: f64, receive_time: f64, _packet_id: &str) -> Result<RttMeasurement, JsValue> {
        if receive_time < send_time {
            return Err(JsValue::from_str("Invalid timing: receive_time before send_time"));
        }

        let rtt_ms = receive_time - send_time;
        let packet_loss = self.calculate_packet_loss();
        
        let measurement = RttMeasurement::new(rtt_ms, js_sys::Date::now() as u64, packet_loss);
        
        self.rtt_measurements.push(measurement.clone());
        
        if self.rtt_measurements.len() > self.max_rtt_samples {
            self.rtt_measurements.remove(0);
        }

        // Update connection quality state based on RTT
        self.update_quality_state();

        Ok(measurement)
    }

    #[wasm_bindgen]
    pub fn get_average_rtt(&self) -> f64 {
        if self.rtt_measurements.is_empty() {
            return 100.0;
        }
        
        let sum: f64 = self.rtt_measurements.iter().map(|m| m.rtt_ms).sum();
        sum / self.rtt_measurements.len() as f64
    }

    #[wasm_bindgen]
    pub fn get_current_rtt(&self) -> f64 {
        self.rtt_measurements.last().map(|m| m.rtt_ms).unwrap_or(100.0)
    }

    #[wasm_bindgen]
    pub fn update_timing_sync(&mut self, local_send_time: f64, remote_receive_time: f64, remote_send_time: f64, local_receive_time: f64) -> Result<TimingInfo, JsValue> {
        if local_receive_time < local_send_time || remote_receive_time < remote_send_time {
            return Err(JsValue::from_str("Invalid timing sequence"));
        }

        let one_way_delay = ((local_receive_time - local_send_time) - (remote_send_time - remote_receive_time)) / 2.0;
        let new_offset = remote_receive_time - (local_send_time + one_way_delay);
        
        let old_offset = self.timing_info.offset_ms;
        let drift = new_offset - old_offset;
        let time_elapsed = local_receive_time - self.timing_info.local_time;
        
        self.timing_info = TimingInfo {
            local_time: local_receive_time,
            remote_time: remote_send_time,
            offset_ms: new_offset,
            drift_rate: if time_elapsed > 0.0 { drift / time_elapsed } else { 0.0 },
            state: if drift.abs() > 10.0 {
                TimingSyncState::DriftDetected
            } else {
                TimingSyncState::Synchronized
            },
        };

        Ok(self.timing_info.clone())
    }

    #[wasm_bindgen]
    pub fn get_connection_quality(&self) -> f64 {
        if self.rtt_measurements.is_empty() {
            return 0.5;
        }
        
        let avg_rtt = self.get_average_rtt();
        let packet_loss = self.calculate_packet_loss();
        
        let rtt_score = if avg_rtt < 50.0 { 1.0 } else if avg_rtt < 150.0 { 0.8 } else if avg_rtt < 300.0 { 0.6 } else { 0.3 };
        let loss_score = 1.0 - packet_loss;
        
        (rtt_score * 0.7) + (loss_score * 0.3)
    }

    #[wasm_bindgen]
    pub fn get_connection_quality_state(&self) -> ConnectionQualityState {
        self.connection_quality_state
    }

    #[wasm_bindgen]
    pub fn calculate_jitter(&self) -> f64 {
        if self.rtt_measurements.len() < 2 {
            return 0.0;
        }
        
        let mut diffs = Vec::new();
        for i in 1..self.rtt_measurements.len() {
            let diff = (self.rtt_measurements[i].rtt_ms - self.rtt_measurements[i-1].rtt_ms).abs();
            diffs.push(diff);
        }
        
        let sum: f64 = diffs.iter().sum();
        sum / diffs.len() as f64
    }

    #[wasm_bindgen]
    pub fn get_network_health_summary(&self) -> String {
        let avg_rtt = self.get_average_rtt();
        let jitter = self.calculate_jitter();
        let packet_loss = self.calculate_packet_loss();
        let quality = self.get_connection_quality();
        
        serde_json::json!({
            "average_rtt_ms": avg_rtt,
            "jitter_ms": jitter,
            "packet_loss_rate": packet_loss,
            "connection_quality": quality,
            "quality_state": format!("{:?}", self.connection_quality_state),
            "sample_count": self.rtt_measurements.len()
        }).to_string()
    }

    fn calculate_packet_loss(&self) -> f64 {
        if self.rtt_measurements.len() < 10 {
            return 0.0;
        }
        
        let lost_packets = self.rtt_measurements.iter()
            .filter(|m| m.rtt_ms > 1000.0)
            .count();
        
        lost_packets as f64 / self.rtt_measurements.len() as f64
    }

    fn update_quality_state(&mut self) {
        let avg_rtt = self.get_average_rtt();
        let packet_loss = self.calculate_packet_loss();
        
        self.connection_quality_state = if packet_loss > 0.1 {
            ConnectionQualityState::Poor
        } else if avg_rtt > 300.0 {
            ConnectionQualityState::Poor
        } else if avg_rtt > 150.0 {
            ConnectionQualityState::Fair
        } else {
            ConnectionQualityState::Good
        };
    }
}