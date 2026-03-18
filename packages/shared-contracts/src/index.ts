export type FriendRequestAction = "send" | "accept" | "decline";

export type RoomStatusMessage = {
  type: "RoomStatus";
  status: string;
  active_peers?: number;
  max_peers?: number;
};

export type JoinMessage = {
  type: "Join";
  room_id: string;
  peer_id: string;
};

export type OfferMessage = {
  type: "Offer";
  from: string;
  to: string;
  payload: string;
  room_id?: string;
  timestamp?: number;
  session_id?: string;
};

export type AnswerMessage = {
  type: "Answer";
  from: string;
  to: string;
  payload: string;
  room_id?: string;
  timestamp?: number;
  session_id?: string;
};

export type IceCandidateMessage = {
  type: "IceCandidate";
  from: string;
  to: string;
  payload: string;
  room_id?: string;
  timestamp?: number;
  session_id?: string;
};

export type PeerListMessage = {
  type: "PeerList";
  peers: string[];
};

export type LeaveMessage = {
  type: "Leave";
  peer_id: string;
  reason?: "skip" | "intentional_skip" | "transient_disconnect" | "disconnect" | string;
  closeCode?: number;
};

export type ErrorMessage = {
  type: "Error";
  message: string;
};

export type RelayMessage = {
  type: "Relay";
  from: string;
  to: string;
  via: string;
  payload: string;
  hop_count: number;
  timestamp: number;
};

export type ChatMessage = {
  type: "Chat";
  from: string;
  to: string;
  payload: string;
  timestamp?: number;
};

export type TypingMessage = {
  type: "Typing";
  from: string;
  to: string;
  typing: boolean;
};

export type SkipMessage = {
  type: "Skip";
  from: string;
  to: string;
  reason?: string;
  skipId?: string;
};

export type SkipAckMessage = {
  type: "SkipAck";
  from: string;
  to: string;
  skipId: string;
};

export type PublishKeysMessage = {
  type: "PublishKeys";
  from: string;
  bundle: string;
};

export type RequestKeysMessage = {
  type: "RequestKeys";
  from: string;
  to: string;
};

export type KeysResponseMessage = {
  type: "KeysResponse";
  from: string;
  to: string;
  bundle: string;
};

export type SignalHandshakeMessage = {
  type: "SignalHandshake";
  from: string;
  to: string;
  initiation: string;
};

export type FriendRequestMessage = {
  type: "FriendRequest";
  from: string;
  to: string;
  action: FriendRequestAction;
  username?: string;
  avatarSeed?: string;
  avatarUrl?: string | null;
};

export type ScreenShareMessage = {
  type: "ScreenShare";
  from: string;
  to: string;
  sharing: boolean;
};

export type VoiceChatMessage = {
  type: "VoiceChat";
  from: string;
  to: string;
  sharing: boolean;
};

export type ProfileMessage = {
  type: "Profile";
  from: string;
  to: string;
  username?: string;
  avatarSeed?: string;
  avatarUrl?: string | null;
};

export type EncryptedMessage = {
  type: "Encrypted";
  from: string;
  to: string;
  payload: string;
};

export type EditMessage = {
  type: "EditMessage";
  from: string;
  to: string;
  editId: string;
  payload: string;
};

export type DeleteMessage = {
  type: "DeleteMessage";
  from: string;
  to: string;
  deleteId: string;
};

export type KeyExchangeMessage = {
  type: "KeyExchange";
  from: string;
  to: string;
  payload: string;
};

export type RelayRequestMessage = {
  type: "RelayRequest";
  from: string;
  to: string;
  payload?: string;
};

export type RelayResponseMessage = {
  type: "RelayResponse";
  from: string;
  to: string;
  payload?: string;
};

export type ReachabilityMessage = {
  type: "Reachability";
  from: string;
  to?: string;
  candidates?: Array<{ peer_id: string; rtt_ms: number; reliability: number }>;
};

export type SignalingMessageType =
  | "RoomStatus"
  | "Join"
  | "Offer"
  | "Answer"
  | "IceCandidate"
  | "PeerList"
  | "Leave"
  | "Error"
  | "Relay"
  | "RelayRequest"
  | "RelayResponse"
  | "Reachability"
  | "Chat"
  | "Typing"
  | "PublishKeys"
  | "RequestKeys"
  | "KeysResponse"
  | "SignalHandshake"
  | "FriendRequest"
  | "ScreenShare"
  | "VoiceChat"
  | "Profile"
  | "Encrypted"
  | "KeyExchange"
  | "EditMessage"
  | "DeleteMessage"
  | "Skip"
  | "SkipAck";

export type SignalingMessage = {
  type: SignalingMessageType;
} & Partial<{
  from: string;
  to: string;
  room_id: string;
  peer_id: string;
  payload: string;
  bundle: string;
  initiation: string;
  peers: string[];
  message: string;
  typing: boolean;
  via: string;
  hop_count: number;
  timestamp: number;
  session_id: string;
  candidates: Array<{ peer_id: string; rtt_ms: number; reliability: number }>;
  action: FriendRequestAction;
  sharing: boolean;
  username: string;
  avatarSeed: string;
  avatarUrl: string | null;
  status: string;
  active_peers: number;
  max_peers: number;
  editId: string;
  deleteId: string;
  reason: string;
  closeCode: number;
  skipId: string;
}>;
