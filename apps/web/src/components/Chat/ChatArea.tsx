import React, { useState, useCallback, useRef } from 'react';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ReportModal } from './ReportModal';
import { ProfileModal } from './ProfileModal';
import { PartnerSkippedView } from './PartnerSkippedView';
import { Message } from './types';

const PARTNER_POOL = [
  { name: 'rugged troop', avatar: '69a02bf17454d244bf8f3994' },
  { name: 'scattered ointment', avatar: '69a013653ea2c25043517edd' },
  { name: 'silent breeze', avatar: '69a013653ea2c25043517abc' },
  { name: 'glimmering star', avatar: '69a013653ea2c25043517def' },
  { name: 'wandering soul', avatar: '69a013653ea2c25043517ghi' },
];

const REPLY_POOL = [
  "haha really? 😂",
  "that's interesting ngl",
  "oh wow didn't expect that",
  "lol same tbh",
  "wait seriously??",
  "nah no way 😭",
  "that's kinda cool actually",
  "hmm i'm not sure about that",
  "ok ok i see you 👀",
  "bro what 💀",
  "agreed honestly",
  "tell me more lol",
  "omg same!",
  "wait what do you mean?",
  "fair enough i guess",
];

const GREETING_POOL = [
  ["hey! 👋", "asl?"],
  ["hi there", "where you from?"],
  ["hey, how's it going 😊"],
  ["yo what's up"],
  ["hello!! don't be shy lol"],
];

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function makeId() {
  return Date.now().toString() + Math.random().toString(36).slice(2);
}

export function ChatArea() {
  const [connectionState, setConnectionState] = useState<'idle' | 'searching' | 'connected' | 'partner_skipped'>('connected');
  const [messages, setMessages] = useState<Message[]>([]);
  const [partner, setPartner] = useState(PARTNER_POOL[0]);
  const partnerRef = useRef(PARTNER_POOL[0]);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [messageToReport, setMessageToReport] = useState<Message | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<{ username: string; avatarSeed: string } | null>(null);

  const sendPartnerMessage = useCallback((content: string, delayMs = 0) => {
    const p = partnerRef.current;
    // Show typing indicator delayMs - 700ms before the message arrives
    const typingDelay = Math.max(0, delayMs - 700);
    setTimeout(() => setIsPartnerTyping(true), typingDelay);
    setTimeout(() => {
      setIsPartnerTyping(false);
      setMessages(prev => [...prev, {
        id: makeId(),
        username: p.name,
        avatarSeed: p.avatar,
        timestamp: now(),
        content,
      }]);
    }, delayMs);
  }, []);

  const startSearching = useCallback(() => {
    setConnectionState('searching');
    setMessages([]);
    setReplyingTo(null);
    setEditingMessage(null);
    setEditingMessageId(null);
    const timeout = 1500 + Math.random() * 1500;
    setTimeout(() => {
      const newPartner = PARTNER_POOL[Math.floor(Math.random() * PARTNER_POOL.length)];
      partnerRef.current = newPartner;
      setPartner(newPartner);
      setConnectionState('connected');
      // Partner greets immediately after connecting
      const greetings = GREETING_POOL[Math.floor(Math.random() * GREETING_POOL.length)];
      greetings.forEach((msg, i) => {
        sendPartnerMessage(msg, 800 + i * 700);
      });
    }, timeout);
  }, [sendPartnerMessage]);

  const handleStart = () => startSearching();
  const handleStop = () => setConnectionState('idle');
  const handleSkip = () => {
    // Simulated scenario: 20% chance of "Partner Skipped" view appearing for demo
    if (messages.length > 2 && Math.random() < 0.2) {
      setConnectionState('partner_skipped');
    } else {
      startSearching();
    }
  };

  const handleReply = (message: Message) => {
    setReplyingTo(message);
    setEditingMessage(null);
    setEditingMessageId(null);
  };

  const handleProfileClick = (username: string, avatarSeed: string) => {
    setSelectedProfile({ username, avatarSeed });
    setIsProfileModalOpen(true);
  };

  const handleEdit = (message: Message) => {
    // Only allow editing your own messages
    if (message.username === 'Me') {
      setEditingMessageId(message.id);
      setEditingMessage(null);
      setReplyingTo(null);
    }
  };

  const handleSaveEdit = (id: string, newContent: string) => {
    setMessages(prev => prev.map(msg => msg.id === id ? { ...msg, content: newContent } : msg));
    setEditingMessageId(null);
  };

  const handleCancelEdit = () => setEditingMessageId(null);

  const handleReport = (message: Message) => {
    setMessageToReport(message);
    setIsReportModalOpen(true);
  };

  const handleDelete = (message: Message) => {
    setMessages(prev => prev.filter(msg => msg.id !== message.id));
  };

  const handleSendMessage = useCallback((content: string) => {
    setMessages(prev => [...prev, {
      id: makeId(),
      username: 'Me',
      avatarSeed: 'user-avatar-seed',
      timestamp: now(),
      content,
    }]);

    // Simulated partner reply
    const reply = REPLY_POOL[Math.floor(Math.random() * REPLY_POOL.length)];
    sendPartnerMessage(reply, 900 + Math.random() * 600);

    // ~35% chance of a follow-up message
    if (Math.random() < 0.35) {
      const followUp = REPLY_POOL[Math.floor(Math.random() * REPLY_POOL.length)];
      sendPartnerMessage(followUp, 2300 + Math.random() * 1000);
    }

    // Clear reply/edit state after sending
    setReplyingTo(null);
    setEditingMessage(null);
  }, [sendPartnerMessage]);

  return (
    <main className="w-full flex h-full flex-grow flex-col overflow-hidden bg-background relative">
      <div className="flex-grow overflow-hidden flex flex-col">
        {connectionState === 'searching' ? (
          <div className="flex-grow flex items-center justify-center flex-col gap-8 animate-in fade-in duration-500">
            <div className="w-24 h-24 relative flex items-center justify-center">
              <svg
                className="w-full h-full animate-logo-breathe"
                viewBox="-2.4 -2.4 28.80 28.80"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill="#FFD700"
                  d="M19.442 21.355c.55-.19.74-.256.99-.373.342-.152.605-.39.605-.818a.846.846 0 00-.605-.813c-.318-.092-.703.042-.99.122l-5.42 1.46a7.808 7.808 0 01-4.057 0l-5.407-1.46c-.287-.08-.672-.214-.99-.122a.847.847 0 00-.605.813c0 .427.263.666.605.818.25.117.44.184.99.373l5.138 1.79c1.491.52 3.104.52 4.601 0zm-9.263-3.224a7.622 7.622 0 003.636 0l8.01-1.967c.507-.122.709-.165.99-.257.354-.116.605-.415.605-.806a.847.847 0 00-.605-.813c-.281-.08-.697.024-.99.08l-8.664 1.545a6.813 6.813 0 01-2.334 0l-8.652-1.545c-.293-.056-.708-.16-.99-.08a.847.847 0 00-.604.813c0 .39.25.69.604.806.282.092.483.135.99.257zM14.75.621a24.43 24.43 0 00-5.511 0L6.495.933c-.294.03-.715.055-.99.14-.28.092-.605.355-.605.807 0 .39.257.702.605.806.281.08.696.074.99.074h11.01c.293 0 .709.006.99-.074a.835.835 0 00.605-.806c0-.452-.324-.715-.605-.807-.275-.085-.697-.11-.99-.14zm6.037 6.767c.3-.019.709-.037.99-.116a.84.84 0 000-1.614c-.281-.085-.69-.073-.99-.073H3.214c-.3 0-.709-.012-.99.073a.84.84 0 000 1.614c.281.079.69.097.99.116l7.808.556c.642.042 1.308.042 1.943 0zm1.62 4.242c.513-.08.708-.104.989-.202.354-.121.605-.409.605-.806a.84.84 0 00-.605-.806c-.28-.086-.69-.019-.99.012l-9.232.929c-.776.079-1.582.079-2.358 0l-9.22-.93c-.3-.03-.715-.097-.99-.011a.84.84.00 00-.605.806c0 .397.25.685.605.806.275.092.476.123.99.202l8.823 1.418c1.038.165 2.12.165 3.158 0Z"
                />
              </svg>
            </div>
          </div>
        ) : connectionState === 'idle' ? (
          <div className="flex-grow flex items-center justify-center flex-col gap-2">
            <p className="text-muted-foreground text-sm">Click START to begin chatting</p>
          </div>
        ) : connectionState === 'partner_skipped' ? (
          <div className="flex-grow overflow-y-auto chat-scrollbar">
            <PartnerSkippedView
              onReport={() => {
                // Mock report for the whole partner
                setIsReportModalOpen(true);
              }}
              onGetPremium={() => console.log('Premium clicked')}
            />
          </div>
        ) : (
          <MessageList
            messages={messages}
            partnerName={partner.name}
            onReply={handleReply}
            onEdit={handleEdit}
            onReport={handleReport}
            onDelete={handleDelete}
            highlightedMessageId={null}
            editingMessageId={editingMessageId}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            onProfileClick={handleProfileClick}
          />
        )}
      </div>

      <MessageInput
        replyingTo={replyingTo}
        editingMessage={editingMessage}
        onCancelReply={() => setReplyingTo(null)}
        onCancelEdit={() => setEditingMessage(null)}
        connectionState={connectionState}
        onStart={handleStart}
        onStop={handleStop}
        onSkip={handleSkip}
        onSend={handleSendMessage}
        isPartnerTyping={isPartnerTyping}
        partnerName={partner.name}
      />

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        message={messageToReport}
      />

      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        username={selectedProfile?.username || ''}
        avatarSeed={selectedProfile?.avatarSeed || ''}
      />
    </main>
  );
}
