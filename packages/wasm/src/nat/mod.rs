use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NatType {
    Unknown,
    FullCone,
    RestrictedCone,
    PortRestricted,
    SymmetricLinear,   // Predictable port increment
    SymmetricRandom,   // Unpredictable ports
}

#[derive(Debug, Clone)]
struct PortSample {
    external_port: u16,
}

#[wasm_bindgen]
pub struct NatAnalyzer {
    samples: Vec<PortSample>,
    nat_type: NatType,
    port_delta: Option<i32>,
}

#[wasm_bindgen]
impl NatAnalyzer {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            samples: Vec::new(),
            nat_type: NatType::Unknown,
            port_delta: None,
        }
    }

    /// Add a port sample from STUN server response
    pub fn add_sample(&mut self, _stun_server: &str, external_port: u16) {
        self.samples.push(PortSample {
            external_port,
        });
        if self.samples.len() >= 4 {
            self.analyze_nat_type();
        }
    }

    /// Analyze NAT type from collected samples
    fn analyze_nat_type(&mut self) {
        let ports: Vec<u16> = self.samples.iter().map(|s| s.external_port).collect();
        
        // Check if all ports are the same (Full Cone or Restricted)
        if ports.iter().all(|&p| p == ports[0]) {
            self.nat_type = NatType::FullCone;
            return;
        }
        
        // Calculate deltas between consecutive ports
        let deltas: Vec<i32> = ports.windows(2)
            .map(|w| w[1] as i32 - w[0] as i32)
            .collect();
        
        // Check if deltas are consistent (Linear Symmetric)
        if deltas.is_empty() {
            self.nat_type = NatType::SymmetricRandom;
            return;
        }
        
        let first_delta = deltas[0];
        if deltas.iter().all(|&d| d == first_delta) {
            self.nat_type = NatType::SymmetricLinear;
            self.port_delta = Some(first_delta);
        } else {
            self.nat_type = NatType::SymmetricRandom;
        }
    }

    pub fn get_nat_type(&self) -> NatType {
        self.nat_type
    }

    pub fn get_port_delta(&self) -> Option<i32> {
        self.port_delta
    }

    /// Reset the analyzer to clear old samples and start fresh
    /// Useful when NAT changes (e.g., network reconnection)
    pub fn reset(&mut self) {
        self.samples.clear();
        self.nat_type = NatType::Unknown;
        self.port_delta = None;
    }
}