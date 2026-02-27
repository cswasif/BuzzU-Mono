import React, { useState } from 'react';
import '../dashboard_updated.css';
import Sidebar from '../components/Dashboard_Updated/Sidebar';
import MainContent from '../components/Dashboard_Updated/MainContent';
import Header from '../components/Dashboard_Updated/Header';
import RightSidebar from '../components/Dashboard_Updated/RightSidebar';
import { InterestsModal, SettingsModal } from '../components/Dashboard_Updated/Modals';
import Banner from '../components/Dashboard_Updated/Banner';
import FriendRequestsModal from '../components/Dashboard_Updated/FriendRequestsModal';
import InboxModal from '../components/Dashboard_Updated/InboxModal';

export const ChatNewPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'chat' | 'friends'>('chat');
    const [showInterestsModal, setShowInterestsModal] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [showFriendRequestsModal, setShowFriendRequestsModal] = useState(false);
    const [showInboxModal, setShowInboxModal] = useState(false);
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
    const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
    const [theme, setTheme] = useState<'light' | 'dark'>('dark');

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    const handleOpenSettings = () => {
        setShowSettingsModal(true);
    };

    return (
        <div className={`chitchat-dashboard-theme ${theme === 'dark' ? 'theme-dark' : ''} min-h-screen bg-background text-foreground`}>
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
                    theme={theme}
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

export default ChatNewPage;
