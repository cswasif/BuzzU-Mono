import React from 'react';
import { MessageItem } from './MessageItem';
import { Message } from './types';

interface MessageListProps {
  messages: Message[];
  partnerName: string;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onReport: (message: Message) => void;
  onDelete: (message: Message) => void;
  highlightedMessageId?: string | null;
  editingMessageId?: string | null;
  onSaveEdit?: (id: string, newContent: string) => void;
  onCancelEdit?: () => void;
  onProfileClick?: (username: string, avatarSeed: string) => void;
}

export function MessageList({
  messages,
  partnerName,
  onReply,
  onEdit,
  onReport,
  onDelete,
  highlightedMessageId,
  editingMessageId,
  onSaveEdit,
  onCancelEdit,
  onProfileClick
}: MessageListProps) {
  return (
    <ol className="overflow-y-auto overflow-x-hidden w-full chat-scrollbar h-full flex-grow flex-1 min-h-0 flex flex-col overscroll-none pb-4 mb-3">
      <div className="flex-grow"></div>
      <div className="mx-4 mb-2">
        <span className="text-start text-foreground">
          You are now chatting with <span className="text-purple-400 font-bold cursor-pointer" onClick={() => onProfileClick?.(partnerName, messages.find(m => m.username === partnerName)?.avatarSeed || '')}>{partnerName}</span>. Say hi!
        </span>
      </div>
      {messages.map((msg) => (
        <MessageItem
          key={msg.id}
          message={msg}
          onReply={onReply}
          onEdit={onEdit}
          onReport={onReport}
          onDelete={onDelete}
          isHighlighted={msg.id === highlightedMessageId}
          isEditingInline={msg.id === editingMessageId}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onProfileClick={onProfileClick}
        />
      ))}
    </ol>
  );
}



