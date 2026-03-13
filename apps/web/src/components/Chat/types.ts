/** Lightweight shape for the message being replied to (avoids recursive self-ref). */
export interface ReplyToMessage {
  id: string;
  content: string;
  username?: string;
  avatarSeed?: string;
  avatarUrl?: string | null;
  timestamp?: string;
}

export interface Message {
  id: string;
  username: string;
  avatarSeed?: string;
  avatarUrl?: string | null;
  timestamp: string;
  content: string;
  type?: 'message' | 'system';
  systemType?: 'offline' | 'online';
  replyToMessage?: ReplyToMessage | null;
  isVerified?: boolean;
  status?: 'sending' | 'sent' | 'error';
  progress?: number;
  vanishOpened?: boolean;
  /** Vanish-mode image — disappears after first view */
  isVanish?: boolean;
  isEdited?: boolean;
  senderId?: string;
}

export type ChatAction = 'reply' | 'edit' | 'report' | 'delete';
