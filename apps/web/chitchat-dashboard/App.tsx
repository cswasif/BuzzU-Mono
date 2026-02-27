import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import Header from './components/Header';
import RightSidebar from './components/RightSidebar';
import { InterestsModal, SettingsModal } from './components/Modals';

import Banner from './components/Banner';

import FriendRequestsModal from './components/FriendRequestsModal';
import InboxModal from './components/InboxModal';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chat' | 'friends'>('chat');
  const [showInterestsModal, setShowInterestsModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showFriendRequestsModal, setShowFriendRequestsModal] = useState(false);
  const [showInboxModal, setShowInboxModal] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  React.useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleOpenSettings = () => {
    setShowSettingsModal(true);
  };

  return (
    <div className={`chitchat-dashboard-theme ${theme === 'dark' ? 'dark' : ''}`}>
      <div className="text-foreground bg-background h-screen flex flex-col overflow-hidden text-sm md:text-base">
        <Banner />

        <Header
          onMenuClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
          onHistoryClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
          onFriendRequestsClick={() => setShowFriendRequestsModal(true)}
          onInboxClick={() => setShowInboxModal(true)}
          theme={theme}
          toggleTheme={toggleTheme}
        />

        <div className="flex h-full overflow-hidden relative">
          <Sidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onEditProfile={handleOpenSettings}
            isOpen={isLeftSidebarOpen}
            onClose={() => setIsLeftSidebarOpen(false)}
            theme={theme}
            toggleTheme={toggleTheme}
          />
          <MainContent onManageInterests={() => setShowInterestsModal(true)} />
          <RightSidebar isOpen={isRightSidebarOpen} onClose={() => setIsRightSidebarOpen(false)} />
        </div>
      </div>

      {/* Modals & Popovers */}
      {showInterestsModal && (
        <InterestsModal onClose={() => setShowInterestsModal(false)} />
      )}

      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          onOpenInterests={() => {
            setShowSettingsModal(false);
            setShowInterestsModal(true);
          }}
        />
      )}

      {showFriendRequestsModal && (
        <FriendRequestsModal onClose={() => setShowFriendRequestsModal(false)} />
      )}

      {showInboxModal && (
        <InboxModal onClose={() => setShowInboxModal(false)} />
      )}
    </div>
  );
};

export default App;