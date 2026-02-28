export interface Message {
  id: string;
  username: string;
  avatarSeed?: string;
  timestamp: string;
  content: string;
  type?: 'message' | 'system';
  systemType?: 'offline' | 'online';
  replyToMessage?: Message | null;
}

export type ChatAction = 'reply' | 'edit' | 'report' | 'delete';
