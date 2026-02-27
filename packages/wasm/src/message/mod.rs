use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum MessageType {
    Text,
    Binary,
    File,
    Control,
    System,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum MessagePriority {
    Low = 0,
    Normal = 1,
    High = 2,
    Critical = 3,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum DeliveryMode {
    BestEffort,
    Reliable,
    Ordered,
    Guaranteed,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum MessageState {
    Pending,
    Sent,
    Delivered,
    Failed,
    Expired,
    Acknowledged,
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageMetadata {
    message_id: String,
    sender_id: String,
    recipient_id: String,
    message_type: MessageType,
    priority: MessagePriority,
    delivery_mode: DeliveryMode,
    timestamp: f64,
    ttl_seconds: u32,
    sequence_number: u64,
    attempt_count: u32,
}

#[wasm_bindgen]
impl MessageMetadata {
    #[wasm_bindgen(constructor)]
    pub fn new(
        message_id: String,
        sender_id: String,
        recipient_id: String,
        message_type: MessageType,
        priority: MessagePriority,
        delivery_mode: DeliveryMode,
        timestamp: f64,
        ttl_seconds: u32,
        sequence_number: u64,
    ) -> Self {
        Self {
            message_id,
            sender_id,
            recipient_id,
            message_type,
            priority,
            delivery_mode,
            timestamp,
            ttl_seconds,
            sequence_number,
            attempt_count: 0,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn message_id(&self) -> String { self.message_id.clone() }
    #[wasm_bindgen(getter)]
    pub fn sender_id(&self) -> String { self.sender_id.clone() }
    #[wasm_bindgen(getter)]
    pub fn recipient_id(&self) -> String { self.recipient_id.clone() }
    #[wasm_bindgen(getter)]
    pub fn message_type(&self) -> MessageType { self.message_type }
    #[wasm_bindgen(getter)]
    pub fn priority(&self) -> MessagePriority { self.priority }
    #[wasm_bindgen(getter)]
    pub fn delivery_mode(&self) -> DeliveryMode { self.delivery_mode }
    #[wasm_bindgen(getter)]
    pub fn timestamp(&self) -> f64 { self.timestamp }
    #[wasm_bindgen(getter)]
    pub fn ttl_seconds(&self) -> u32 { self.ttl_seconds }
    #[wasm_bindgen(getter)]
    pub fn sequence_number(&self) -> u64 { self.sequence_number }
    #[wasm_bindgen(getter)]
    pub fn attempt_count(&self) -> u32 { self.attempt_count }

    #[wasm_bindgen]
    pub fn increment_attempt(&mut self) {
        self.attempt_count += 1;
    }

    #[wasm_bindgen]
    pub fn is_expired(&self) -> bool {
        let current_time = js_sys::Date::now();
        let age_seconds = ((current_time - self.timestamp) / 1000.0) as u32;
        age_seconds > self.ttl_seconds
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutedMessage {
    metadata: MessageMetadata,
    payload: Vec<u8>,
    state: MessageState,
    routing_path: Vec<String>,
    acknowledgments: Vec<String>,
}

#[wasm_bindgen]
impl RoutedMessage {
    #[wasm_bindgen(constructor)]
    pub fn new(metadata: MessageMetadata, payload: Vec<u8>) -> Self {
        Self {
            metadata,
            payload,
            state: MessageState::Pending,
            routing_path: Vec::new(),
            acknowledgments: Vec::new(),
        }
    }

    #[wasm_bindgen(getter)]
    pub fn metadata(&self) -> MessageMetadata { self.metadata.clone() }
    #[wasm_bindgen(getter)]
    pub fn payload(&self) -> Vec<u8> { self.payload.clone() }
    #[wasm_bindgen(getter)]
    pub fn state(&self) -> MessageState { self.state }
    #[wasm_bindgen(getter)]
    pub fn routing_path(&self) -> Vec<String> { self.routing_path.clone() }
    #[wasm_bindgen(getter)]
    pub fn acknowledgments(&self) -> Vec<String> { self.acknowledgments.clone() }

    #[wasm_bindgen]
    pub fn update_state(&mut self, new_state: MessageState) {
        self.state = new_state;
    }

    #[wasm_bindgen]
    pub fn add_to_path(&mut self, node_id: String) {
        self.routing_path.push(node_id);
    }

    #[wasm_bindgen]
    pub fn add_acknowledgment(&mut self, node_id: String) {
        if !self.acknowledgments.contains(&node_id) {
            self.acknowledgments.push(node_id);
        }
    }

    #[wasm_bindgen]
    pub fn has_acknowledgment(&self, node_id: &str) -> bool {
        self.acknowledgments.contains(&node_id.to_string())
    }
}

#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct MessageRouter {
    message_queue: VecDeque<RoutedMessage>,
    pending_acks: HashMap<String, RoutedMessage>,
    sequence_counters: HashMap<String, u64>,
    max_queue_size: usize,
    enable_retry: bool,
    max_retry_attempts: u32,
}

#[wasm_bindgen]
impl MessageRouter {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            message_queue: VecDeque::new(),
            pending_acks: HashMap::new(),
            sequence_counters: HashMap::new(),
            max_queue_size: 1000,
            enable_retry: true,
            max_retry_attempts: 3,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn max_queue_size(&self) -> usize { self.max_queue_size }
    #[wasm_bindgen(setter)]
    pub fn set_max_queue_size(&mut self, size: usize) {
        self.max_queue_size = size.max(100).min(10000);
    }

    #[wasm_bindgen(getter)]
    pub fn enable_retry(&self) -> bool { self.enable_retry }
    #[wasm_bindgen(setter)]
    pub fn set_enable_retry(&mut self, enabled: bool) {
        self.enable_retry = enabled;
    }

    #[wasm_bindgen(getter)]
    pub fn max_retry_attempts(&self) -> u32 { self.max_retry_attempts }
    #[wasm_bindgen(setter)]
    pub fn set_max_retry_attempts(&mut self, attempts: u32) {
        self.max_retry_attempts = attempts.max(0).min(10);
    }

    #[wasm_bindgen]
    pub fn generate_message_id(&mut self, sender_id: &str, recipient_id: &str) -> String {
        use crate::crypto;
        let timestamp = js_sys::Date::now() as u64;
        let counter = self.get_next_sequence(sender_id);
        let input = format!("{}_{}_{}_{}", sender_id, recipient_id, timestamp, counter);
        crypto::hash_string(&input)
    }

    fn get_next_sequence(&mut self, sender_id: &str) -> u64 {
        let counter = self.sequence_counters.entry(sender_id.to_string()).or_insert(0);
        *counter += 1;
        *counter
    }

    #[wasm_bindgen]
    pub fn create_text_message(&mut self, sender_id: String, recipient_id: String, text: String, priority: MessagePriority) -> RoutedMessage {
        let message_id = self.generate_message_id(&sender_id, &recipient_id);
        let timestamp = js_sys::Date::now();
        let sequence_number = self.get_next_sequence(&sender_id);
        
        let metadata = MessageMetadata::new(
            message_id,
            sender_id,
            recipient_id,
            MessageType::Text,
            priority,
            DeliveryMode::Reliable,
            timestamp,
            300, // 5 minute TTL
            sequence_number,
        );

        let payload = text.into_bytes();
        RoutedMessage::new(metadata, payload)
    }

    #[wasm_bindgen]
    pub fn create_binary_message(&mut self, sender_id: String, recipient_id: String, data: Vec<u8>, priority: MessagePriority, delivery_mode: DeliveryMode) -> RoutedMessage {
        let message_id = self.generate_message_id(&sender_id, &recipient_id);
        let timestamp = js_sys::Date::now();
        let sequence_number = self.get_next_sequence(&sender_id);
        
        let ttl = match delivery_mode {
            DeliveryMode::BestEffort => 60,   // 1 minute
            DeliveryMode::Reliable => 300,    // 5 minutes
            DeliveryMode::Ordered => 300,       // 5 minutes
            DeliveryMode::Guaranteed => 1800, // 30 minutes
        };

        let metadata = MessageMetadata::new(
            message_id,
            sender_id,
            recipient_id,
            MessageType::Binary,
            priority,
            delivery_mode,
            timestamp,
            ttl,
            sequence_number,
        );

        RoutedMessage::new(metadata, data)
    }

    #[wasm_bindgen]
    pub fn queue_message(&mut self, message: RoutedMessage) -> Result<(), JsValue> {
        if self.message_queue.len() >= self.max_queue_size {
            return Err(JsValue::from_str("Message queue is full"));
        }

        self.message_queue.push_back(message);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn get_next_message(&mut self) -> Option<RoutedMessage> {
        self.message_queue.pop_front()
    }

    #[wasm_bindgen]
    pub fn get_messages_by_priority(&self, min_priority: MessagePriority) -> Vec<RoutedMessage> {
        self.message_queue
            .iter()
            .filter(|msg| msg.metadata.priority() as u8 >= min_priority as u8)
            .cloned()
            .collect()
    }

    #[wasm_bindgen]
    pub fn get_messages_for_recipient(&self, recipient_id: &str) -> Vec<RoutedMessage> {
        self.message_queue
            .iter()
            .filter(|msg| msg.metadata.recipient_id() == recipient_id)
            .cloned()
            .collect()
    }

    #[wasm_bindgen]
    pub fn mark_message_sent(&mut self, message_id: &str) -> Result<(), JsValue> {
        if let Some(message) = self.pending_acks.get_mut(message_id) {
            message.update_state(MessageState::Sent);
            Ok(())
        } else {
            Err(JsValue::from_str("Message not found in pending acknowledgments"))
        }
    }

    #[wasm_bindgen]
    pub fn mark_message_delivered(&mut self, message_id: &str, delivered_by: &str) -> Result<(), JsValue> {
        if let Some(message) = self.pending_acks.get_mut(message_id) {
            message.update_state(MessageState::Delivered);
            message.add_acknowledgment(delivered_by.to_string());
            Ok(())
        } else {
            Err(JsValue::from_str("Message not found in pending acknowledgments"))
        }
    }

    #[wasm_bindgen]
    pub fn mark_message_acknowledged(&mut self, message_id: &str, acknowledged_by: &str) -> Result<(), JsValue> {
        if let Some(message) = self.pending_acks.get_mut(message_id) {
            message.update_state(MessageState::Acknowledged);
            message.add_acknowledgment(acknowledged_by.to_string());
            Ok(())
        } else {
            Err(JsValue::from_str("Message not found in pending acknowledgments"))
        }
    }

    #[wasm_bindgen]
    pub fn process_pending_acks(&mut self) -> Vec<RoutedMessage> {
        let current_time = js_sys::Date::now();
        let mut expired_messages = Vec::new();
        let mut retry_messages = Vec::new();

        let mut to_remove = Vec::new();

        for (message_id, message) in &mut self.pending_acks {
            let metadata = &message.metadata;
            
            // Check if message has expired
            let age_seconds = ((current_time - metadata.timestamp()) / 1000.0) as u32;
            if age_seconds > metadata.ttl_seconds() {
                let mut expired_msg = message.clone();
                expired_msg.update_state(MessageState::Expired);
                expired_messages.push(expired_msg);
                to_remove.push(message_id.clone());
                continue;
            }

            // Check if message needs retry
            if self.enable_retry && metadata.attempt_count() < self.max_retry_attempts {
                if metadata.delivery_mode() != DeliveryMode::BestEffort {
                    // Update the original message's attempt count
                    message.metadata.increment_attempt();
                    let retry_msg = message.clone();
                    retry_messages.push(retry_msg);
                }
            }
        }

        // Remove expired messages
        for message_id in to_remove {
            self.pending_acks.remove(&message_id);
        }

        // Add retry messages back to queue
        for retry_msg in retry_messages {
            let _ = self.queue_message(retry_msg);
        }

        expired_messages
    }

    #[wasm_bindgen]
    pub fn cleanup_expired_messages(&mut self) -> u32 {
        let _current_time = js_sys::Date::now();
        let mut removed_count = 0;

        self.message_queue.retain(|message| {
            let should_keep = !message.metadata.is_expired();
            if !should_keep {
                removed_count += 1;
            }
            should_keep
        });

        removed_count
    }

    #[wasm_bindgen]
    pub fn get_queue_stats(&self) -> JsValue {
        let stats = js_sys::Object::new();
        
        let total_messages = self.message_queue.len();
        let pending_acks = self.pending_acks.len();
        
        let by_priority = js_sys::Array::new();
        let by_type = js_sys::Array::new();
        let by_state = js_sys::Array::new();
        
        // Initialize arrays
        for _ in 0..4 {
            by_priority.push(&0.into());
        }
        for _ in 0..5 {
            by_type.push(&0.into());
        }
        for _ in 0..6 {
            by_state.push(&0.into());
        }
        
        for message in &self.message_queue {
            let priority_idx = message.metadata.priority() as usize;
            let current = by_priority.get(priority_idx as u32).as_f64().unwrap_or(0.0);
            by_priority.set(priority_idx as u32, (current + 1.0).into());
            
            let type_idx = message.metadata.message_type() as usize;
            let current = by_type.get(type_idx as u32).as_f64().unwrap_or(0.0);
            by_type.set(type_idx as u32, (current + 1.0).into());
            
            let state_idx = message.state() as usize;
            let current = by_state.get(state_idx as u32).as_f64().unwrap_or(0.0);
            by_state.set(state_idx as u32, (current + 1.0).into());
        }

        js_sys::Reflect::set(&stats, &"total_messages".into(), &total_messages.into()).unwrap();
        js_sys::Reflect::set(&stats, &"pending_acks".into(), &pending_acks.into()).unwrap();
        js_sys::Reflect::set(&stats, &"by_priority".into(), &by_priority.into()).unwrap();
        js_sys::Reflect::set(&stats, &"by_type".into(), &by_type.into()).unwrap();
        js_sys::Reflect::set(&stats, &"by_state".into(), &by_state.into()).unwrap();
        
        stats.into()
    }

    #[wasm_bindgen]
    pub fn to_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.message_queue)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
    }

    #[wasm_bindgen]
    pub fn from_json(&mut self, json: &str) -> Result<(), JsValue> {
        let messages: Vec<RoutedMessage> = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Deserialization error: {}", e)))?;
        
        self.message_queue = messages.into_iter().collect();
        Ok(())
    }
}