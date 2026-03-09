import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import '../dashboard_updated.css';
import Sidebar from '../components/Dashboard_Updated/Sidebar';
import Header from '../components/Dashboard_Updated/Header';
import RightSidebar from '../components/Dashboard_Updated/RightSidebar';
import { InterestsModal, SettingsModal } from '../components/Dashboard_Updated/Modals';
import Banner from '../components/Dashboard_Updated/Banner';
import FriendRequestsModal from '../components/Dashboard_Updated/FriendRequestsModal';
import InboxModal from '../components/Dashboard_Updated/InboxModal';
import { ProfileModal } from '../components/Chat/ProfileModal';
import { DmSignalingProvider } from '../context/DmSignalingContext';
import { useSessionStore } from '../stores/sessionStore';

/**
 * DashboardLayout — Shared shell for /chat/new and /chat/dm/:friendId
 *
 * Following BuzzU's Shell pattern: the sidebar, header, banner,
 * and modals are defined ONCE here. Child routes render into <Outlet />.
 *
 * Routes:
 *   /chat/new          → MainContent (matchmaker dashboard)
 *   /chat/dm/:friendId → DmChatArea (DM with specific friend)
 */
export default function DashboardLayout() {
    const { initSession, theme, setTheme } = useSessionStore();

    useEffect(() => {
        initSession();
    }, [initSession]);

    const [activeTab, setActiveTab] = useState<'chat' | 'friends'>('chat');
    const [showInterestsModal, setShowInterestsModal] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [showFriendRequestsModal, setShowFriendRequestsModal] = useState(false);
    const [showInboxModal, setShowInboxModal] = useState(false);
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);

    // Default open on desktop, closed on mobile
    const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(() => {
        if (typeof window !== 'undefined') {
            return window.innerWidth >= 1024;
        }
        return false;
    });

    const [hideChrome, setHideChrome] = useState(false);
    const [profileModal, setProfileModal] = useState<{
        isOpen: boolean; username: string; avatarSeed: string; peerId: string;
    } | null>(null);

    const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

    // Handle responsive sidebar behavior when resizing window
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 1024) {
                setIsLeftSidebarOpen(true);
            } else {
                setIsLeftSidebarOpen(false);
            }
        };

        // Use a MediaQueryList for more reliable event listening
        const mql = window.matchMedia('(min-width: 1024px)');
        mql.addEventListener('change', handleResize);

        return () => mql.removeEventListener('change', handleResize);
    }, []);

    // Global event listeners for modals/navigation
    useEffect(() => {
        const onOpenSettings = () => setShowSettingsModal(true);
        const onOpenProfile = (e: Event) => {
            const d = (e as CustomEvent).detail || {};
            setProfileModal({
                isOpen: true,
                username: d.username || 'Friend',
                avatarSeed: d.avatarSeed || '',
                peerId: d.peerId || '',
            });
        };
        const onHideChrome = (e: Event) => {
            setHideChrome((e as CustomEvent).detail?.hide ?? false);
        };

        window.addEventListener('open-settings-modal', onOpenSettings);
        window.addEventListener('open-friend-profile', onOpenProfile);
        window.addEventListener('dashboard-hide-chrome', onHideChrome);
        return () => {
            window.removeEventListener('open-settings-modal', onOpenSettings);
            window.removeEventListener('open-friend-profile', onOpenProfile);
            window.removeEventListener('dashboard-hide-chrome', onHideChrome);
        };
    }, []);

    return (
        <DmSignalingProvider>
            <div className={`chitchat-dashboard-theme ${theme === 'dark' ? 'theme-dark' : ''} min-h-[100dvh] bg-background text-foreground`}>
                <div className="text-foreground bg-background h-[100dvh] flex flex-col overflow-hidden text-sm md:text-base">
                    {/* Banner + Header — hidden when video mode etc. */}
                    {!hideChrome && <Banner />}
                    {!hideChrome && (
                        <Header
                            onMenuClick={() => setIsLeftSidebarOpen(o => !o)}
                            onHistoryClick={() => setIsRightSidebarOpen(o => !o)}
                            onFriendRequestsClick={() => setShowFriendRequestsModal(true)}
                            onInboxClick={() => setShowInboxModal(true)}
                            theme={theme}
                            toggleTheme={toggleTheme}
                            isLeftSidebarOpen={isLeftSidebarOpen}
                        />
                    )}

                    <div className="flex h-full overflow-hidden relative">
                        {/* Sidebar — shared across all dashboard routes */}
                        {!hideChrome && (
                            <Sidebar
                                activeTab={activeTab}
                                setActiveTab={setActiveTab}
                                onEditProfile={() => setShowSettingsModal(true)}
                                isOpen={isLeftSidebarOpen}
                                onClose={() => setIsLeftSidebarOpen(false)}
                                theme={theme}
                                toggleTheme={toggleTheme}
                            />
                        )}

                        {/* Route content — this is where child pages render */}
                        <Outlet context={{ setHideChrome, setShowInterestsModal }} />

                        {/* Right sidebar */}
                        {!hideChrome && (
                            <RightSidebar
                                isOpen={isRightSidebarOpen}
                                onClose={() => setIsRightSidebarOpen(false)}
                            />
                        )}
                    </div>
                </div>

                {/* Modals — defined once, shared across all child routes */}
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
                {profileModal?.isOpen && (
                    <ProfileModal
                        isOpen={true}
                        onClose={() => setProfileModal(null)}
                        username={profileModal.username}
                        avatarSeed={profileModal.avatarSeed}
                        requestStatus="friends"
                        onAddFriend={() => { }}
                    />
                )}
            </div>
        </DmSignalingProvider>
    );
}
