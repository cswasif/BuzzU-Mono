use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{WebSocket, MessageEvent, CloseEvent, ErrorEvent, Event};
use serde::{Deserialize, Serialize};
use serde_json;
use std::collections::HashMap;
use std::rc::Rc;
use std::cell::RefCell;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WssMessage {
    Join { room_id: String, peer_id: String },
    Offer { from: String, to: String, sdp: String },
    Answer { from: String, to: String, sdp: String },
    IceCandidate { from: String, to: String, candidate: String },
    PeerList { peers: Vec<String> },
    Leave { peer_id: String },
    Chat { from: String, message: String, timestamp: u64 },
    Error { message: String },
    Ping { timestamp: u64 },
    Pong { timestamp: u64 },
}

#[wasm_bindgen]
pub struct WssWorker {
    websocket: Option<WebSocket>,
    url: String,
    peer_id: String,
    room_id: String,
    message_handlers: Rc<RefCell<HashMap<String, js_sys::Function>>>,
    connection_state: Rc<RefCell<ConnectionState>>,
}

#[wasm_bindgen]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
    Error,
}

#[wasm_bindgen]
impl WssWorker {
    #[wasm_bindgen(constructor)]
    pub fn new(url: String, peer_id: String, room_id: String) -> Self {
        console_error_panic_hook::set_once();
        
        Self {
            websocket: None,
            url,
            peer_id,
            room_id,
            message_handlers: Rc::new(RefCell::new(HashMap::new())),
            connection_state: Rc::new(RefCell::new(ConnectionState::Disconnected)),
        }
    }

    #[wasm_bindgen]
    pub fn connect(&mut self) -> Result<(), JsValue> {
        if self.websocket.is_some() {
            web_sys::console::warn_1(&"WebSocket already connected".into());
            return Ok(());
        }

        *self.connection_state.borrow_mut() = ConnectionState::Connecting;
        
        let ws = WebSocket::new(&self.url)?;
        
        // Set up event handlers
        self.setup_event_handlers(&ws)?;
        
        self.websocket = Some(ws);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn disconnect(&mut self) {
        if let Some(ws) = &self.websocket {
            let _ = ws.close();
        }
        self.websocket = None;
        *self.connection_state.borrow_mut() = ConnectionState::Disconnected;
    }

    #[wasm_bindgen]
    pub fn send_message(&self, message_type: &str, data: &JsValue) -> Result<(), JsValue> {
        let ws = self.websocket.as_ref().ok_or("WebSocket not connected")?;
        
        if ws.ready_state() != WebSocket::OPEN {
            return Err(JsValue::from_str("WebSocket not open"));
        }

        let message = match message_type {
            "chat" => {
                let message = data.as_string().ok_or("Invalid chat message")?;
                WssMessage::Chat {
                    from: self.peer_id.clone(),
                    message,
                    timestamp: js_sys::Date::now() as u64,
                }
            }
            "join" => {
                WssMessage::Join {
                    room_id: self.room_id.clone(),
                    peer_id: self.peer_id.clone(),
                }
            }
            "leave" => {
                WssMessage::Leave {
                    peer_id: self.peer_id.clone(),
                }
            }
            "ping" => {
                WssMessage::Ping {
                    timestamp: js_sys::Date::now() as u64,
                }
            }
            _ => return Err(JsValue::from_str("Unknown message type")),
        };

        let json = serde_json::to_string(&message).map_err(|e| JsValue::from_str(&e.to_string()))?;
        ws.send_with_str(&json)?;
        
        Ok(())
    }

    #[wasm_bindgen]
    pub fn send_offer(&self, to_peer: &str, sdp: &str) -> Result<(), JsValue> {
        self.send_signaling_message(WssMessage::Offer {
            from: self.peer_id.clone(),
            to: to_peer.to_string(),
            sdp: sdp.to_string(),
        })
    }

    #[wasm_bindgen]
    pub fn send_answer(&self, to_peer: &str, sdp: &str) -> Result<(), JsValue> {
        self.send_signaling_message(WssMessage::Answer {
            from: self.peer_id.clone(),
            to: to_peer.to_string(),
            sdp: sdp.to_string(),
        })
    }

    #[wasm_bindgen]
    pub fn send_ice_candidate(&self, to_peer: &str, candidate: &str) -> Result<(), JsValue> {
        self.send_signaling_message(WssMessage::IceCandidate {
            from: self.peer_id.clone(),
            to: to_peer.to_string(),
            candidate: candidate.to_string(),
        })
    }

    #[wasm_bindgen]
    pub fn get_connection_state(&self) -> ConnectionState {
        *self.connection_state.borrow()
    }

    #[wasm_bindgen]
    pub fn get_peer_id(&self) -> String {
        self.peer_id.clone()
    }

    #[wasm_bindgen]
    pub fn get_room_id(&self) -> String {
        self.room_id.clone()
    }

    fn setup_event_handlers(&self, ws: &WebSocket) -> Result<(), JsValue> {
        let ws_clone = ws.clone();
        let message_handlers = self.message_handlers.clone();
        let connection_state = self.connection_state.clone();
        let peer_id = self.peer_id.clone();
        let room_id = self.room_id.clone();

        // Handle open event
        let connection_state_clone = connection_state.clone();
        let onopen = Closure::wrap(Box::new(move |_event: Event| {
            web_sys::console::log_1(&"WebSocket connected".into());
            *connection_state_clone.borrow_mut() = ConnectionState::Connected;
            
            // Send join message
            let join_msg = WssMessage::Join {
                room_id: room_id.clone(),
                peer_id: peer_id.clone(),
            };
            
            if let Ok(json) = serde_json::to_string(&join_msg) {
                let _ = ws_clone.send_with_str(&json);
            }
        }) as Box<dyn FnMut(Event)>);
        
        ws.set_onopen(Some(onopen.as_ref().unchecked_ref()));
        onopen.forget();

        // Handle message event
        let message_handlers_clone = message_handlers.clone();
        let connection_state_clone = connection_state.clone();
        
        let onmessage = Closure::wrap(Box::new(move |event: MessageEvent| {
            if let Ok(text) = event.data().dyn_into::<js_sys::JsString>() {
                let text_str = text.as_string().unwrap_or_default();
                
                if let Ok(message) = serde_json::from_str::<WssMessage>(&text_str) {
                    Self::handle_incoming_message(message, &message_handlers_clone, &connection_state_clone);
                } else {
                    web_sys::console::warn_1(&format!("Failed to parse message: {}", text_str).into());
                }
            }
        }) as Box<dyn FnMut(MessageEvent)>);
        
        ws.set_onmessage(Some(onmessage.as_ref().unchecked_ref()));
        onmessage.forget();

        // Handle close event
        let connection_state_clone = connection_state.clone();
        let onclose = Closure::wrap(Box::new(move |_event: CloseEvent| {
            web_sys::console::log_1(&"WebSocket disconnected".into());
            *connection_state_clone.borrow_mut() = ConnectionState::Disconnected;
        }) as Box<dyn FnMut(CloseEvent)>);
        
        ws.set_onclose(Some(onclose.as_ref().unchecked_ref()));
        onclose.forget();

        // Handle error event
        let connection_state_clone = connection_state.clone();
        let onerror = Closure::wrap(Box::new(move |event: ErrorEvent| {
            web_sys::console::error_1(&format!("WebSocket error: {:?}", event).into());
            *connection_state_clone.borrow_mut() = ConnectionState::Error;
        }) as Box<dyn FnMut(ErrorEvent)>);
        
        ws.set_onerror(Some(onerror.as_ref().unchecked_ref()));
        onerror.forget();

        Ok(())
    }

    fn handle_incoming_message(
        message: WssMessage,
        message_handlers: &Rc<RefCell<HashMap<String, js_sys::Function>>>,
        _connection_state: &Rc<RefCell<ConnectionState>>,
    ) {
        match message {
            WssMessage::Chat { from, message: msg, timestamp } => {
                let handlers = message_handlers.borrow();
                if let Some(handler) = handlers.get("chat") {
                    let this = JsValue::NULL;
                    let js_message = js_sys::Object::new();
                    js_sys::Reflect::set(&js_message, &"type".into(), &"chat".into()).unwrap();
                    js_sys::Reflect::set(&js_message, &"from".into(), &from.into()).unwrap();
                    js_sys::Reflect::set(&js_message, &"message".into(), &msg.into()).unwrap();
                    js_sys::Reflect::set(&js_message, &"timestamp".into(), &(timestamp as f64).into()).unwrap();
                    
                    let _ = handler.call0(&this);
                    let _ = handler.call1(&this, &js_message);
                }
            }
            WssMessage::PeerList { peers } => {
                let handlers = message_handlers.borrow();
                if let Some(handler) = handlers.get("peer_list") {
                    let this = JsValue::NULL;
                    let js_peers = js_sys::Array::new();
                    for peer in peers {
                        js_peers.push(&peer.into());
                    }
                    
                    let _ = handler.call1(&this, &js_peers);
                }
            }
            WssMessage::Offer { from, to, sdp } => {
                let handlers = message_handlers.borrow();
                if let Some(handler) = handlers.get("offer") {
                    let this = JsValue::NULL;
                    let js_offer = js_sys::Object::new();
                    js_sys::Reflect::set(&js_offer, &"type".into(), &"offer".into()).unwrap();
                    js_sys::Reflect::set(&js_offer, &"from".into(), &from.into()).unwrap();
                    js_sys::Reflect::set(&js_offer, &"to".into(), &to.into()).unwrap();
                    js_sys::Reflect::set(&js_offer, &"sdp".into(), &sdp.into()).unwrap();
                    
                    let _ = handler.call1(&this, &js_offer);
                }
            }
            WssMessage::Answer { from, to, sdp } => {
                let handlers = message_handlers.borrow();
                if let Some(handler) = handlers.get("answer") {
                    let this = JsValue::NULL;
                    let js_answer = js_sys::Object::new();
                    js_sys::Reflect::set(&js_answer, &"type".into(), &"answer".into()).unwrap();
                    js_sys::Reflect::set(&js_answer, &"from".into(), &from.into()).unwrap();
                    js_sys::Reflect::set(&js_answer, &"to".into(), &to.into()).unwrap();
                    js_sys::Reflect::set(&js_answer, &"sdp".into(), &sdp.into()).unwrap();
                    
                    let _ = handler.call1(&this, &js_answer);
                }
            }
            WssMessage::IceCandidate { from, to, candidate } => {
                let handlers = message_handlers.borrow();
                if let Some(handler) = handlers.get("ice_candidate") {
                    let this = JsValue::NULL;
                    let js_candidate = js_sys::Object::new();
                    js_sys::Reflect::set(&js_candidate, &"type".into(), &"ice_candidate".into()).unwrap();
                    js_sys::Reflect::set(&js_candidate, &"from".into(), &from.into()).unwrap();
                    js_sys::Reflect::set(&js_candidate, &"to".into(), &to.into()).unwrap();
                    js_sys::Reflect::set(&js_candidate, &"candidate".into(), &candidate.into()).unwrap();
                    
                    let _ = handler.call1(&this, &js_candidate);
                }
            }
            WssMessage::Ping { timestamp } => {
                // Auto-respond to pings
                web_sys::console::log_1(&format!("Received ping at {}", timestamp).into());
            }
            WssMessage::Pong { timestamp } => {
                web_sys::console::log_1(&format!("Received pong at {}", timestamp).into());
            }
            _ => {
                web_sys::console::log_1(&format!("Unhandled message type: {:?}", message).into());
            }
        }
    }

    fn send_signaling_message(&self, message: WssMessage) -> Result<(), JsValue> {
        let ws = self.websocket.as_ref().ok_or("WebSocket not connected")?;
        
        if ws.ready_state() != WebSocket::OPEN {
            return Err(JsValue::from_str("WebSocket not open"));
        }

        let json = serde_json::to_string(&message).map_err(|e| JsValue::from_str(&e.to_string()))?;
        ws.send_with_str(&json)?;
        
        Ok(())
    }

    #[wasm_bindgen]
    pub fn on(&mut self, event_type: &str, callback: js_sys::Function) {
        self.message_handlers.borrow_mut().insert(event_type.to_string(), callback);
    }

    #[wasm_bindgen]
    pub fn off(&mut self, event_type: &str) {
        self.message_handlers.borrow_mut().remove(event_type);
    }
}