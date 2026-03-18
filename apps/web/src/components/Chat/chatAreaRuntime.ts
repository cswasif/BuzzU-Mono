export const MAX_DATA_CHANNEL_CONTROL_MESSAGE_SIZE = 64 * 1024;

export type IncomingChatMessage = {
  id: string;
  username?: string;
  avatarSeed?: string;
  avatarUrl?: string | null;
  timestamp?: string;
  content: string;
  isVerified?: boolean;
  isEncrypted?: boolean;
  encryptedContent?: unknown;
  replyToMessage?: { id: string; content: string } | null;
};

export type DataChannelControlMessage =
  | { type: "delete_message"; messageId: string }
  | { type: "edit_message"; messageId: string; content: string }
  | { type: "chat_message"; message: IncomingChatMessage }
  | { type: "chat_ack"; messageId: string }
  | { type: "p2p_probe"; probeId: string; sentAt: number }
  | { type: "p2p_probe_ack"; probeId: string; sentAt: number; ackAt: number }
  | { type: "skip_signal"; at?: number };

export function parseDataChannelControlMessage(
  raw: string,
): DataChannelControlMessage | null {
  if (!raw || raw.length > MAX_DATA_CHANNEL_CONTROL_MESSAGE_SIZE) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const message = parsed as Record<string, unknown>;
  const type = message.type;
  if (type === "delete_message" && typeof message.messageId === "string") {
    return { type, messageId: message.messageId };
  }
  if (
    type === "edit_message" &&
    typeof message.messageId === "string" &&
    typeof message.content === "string"
  ) {
    return { type, messageId: message.messageId, content: message.content };
  }
  if (
    type === "chat_message" &&
    message.message &&
    typeof message.message === "object"
  ) {
    const incoming = message.message as Record<string, unknown>;
    if (
      typeof incoming.id === "string" &&
      typeof incoming.content === "string"
    ) {
      return { type, message: incoming as IncomingChatMessage };
    }
    return null;
  }
  if (type === "chat_ack" && typeof message.messageId === "string") {
    return { type, messageId: message.messageId };
  }
  if (
    type === "p2p_probe" &&
    typeof message.probeId === "string" &&
    typeof message.sentAt === "number"
  ) {
    return { type, probeId: message.probeId, sentAt: message.sentAt };
  }
  if (
    type === "p2p_probe_ack" &&
    typeof message.probeId === "string" &&
    typeof message.sentAt === "number" &&
    typeof message.ackAt === "number"
  ) {
    return { type, probeId: message.probeId, sentAt: message.sentAt, ackAt: message.ackAt };
  }
  if (type === "skip_signal") {
    return { type, at: typeof message.at === "number" ? message.at : undefined };
  }
  return null;
}

export function toEncryptedBytes(payload: unknown): Uint8Array {
  const parsed =
    typeof payload === "string" ? (JSON.parse(payload) as unknown) : payload;
  if (parsed instanceof Uint8Array) {
    return parsed;
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid encrypted payload type");
  }
  const bytes = new Uint8Array(parsed.length);
  for (let i = 0; i < parsed.length; i += 1) {
    const value = parsed[i];
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 255
    ) {
      throw new Error("Invalid encrypted payload byte");
    }
    bytes[i] = value;
  }
  return bytes;
}

export function createSafeSessionStorage(storage: Storage | undefined) {
  return {
    // Inline comment requested: keep storage access resilient when browser storage is blocked.
    getItem(key: string) {
      if (!storage) return null;
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    // Inline comment requested: writes should fail safely so chat flow continues.
    setItem(key: string, value: string) {
      if (!storage) return;
      try {
        storage.setItem(key, value);
      } catch {
        return;
      }
    },
    removeItem(key: string) {
      if (!storage) return;
      try {
        storage.removeItem(key);
      } catch {
        return;
      }
    },
  };
}
