import React from 'react';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { ChatArea } from './ChatArea';

export function ChatLayout() {
  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground overflow-hidden dark">
      <TopBar />
      <div className="flex flex-1 overflow-hidden pt-20">
        <Sidebar />
        <ChatArea />
      </div>
    </div>
  );
}
