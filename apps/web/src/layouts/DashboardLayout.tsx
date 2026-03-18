import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import '../dashboard_updated.css';
import Sidebar from '../components/Dashboard_Updated/Sidebar';
import Header from '../components/Dashboard_Updated/Header';
import RightSidebar from '../components/Dashboard_Updated/RightSidebar';
import { InterestsModal, SettingsModal } from '../components/Dashboard_Updated/Modals';
import Banner from '../components/Dashboard_Updated/Banner';
import FriendRequestsModal from '../components/Dashboard_Updated/FriendRequestsModal';
import InboxModal from '../components/Dashboard_Updated/InboxModal';
import NotificationListener from '../components/Dashboard_Updated/NotificationListener';
import { ProfileModal } from '../components/Chat/ProfileModal';
import { ChatArea } from '../components/Chat/ChatArea';
import { DmSignalingProvider } from '../context/DmSignalingContext';
import { useSessionStore } from '../stores/sessionStore';
import { usePWA } from '../hooks/usePWA';

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
    const { initSession, theme, setTheme, currentRoomId, isInChat, partnerId } = useSessionStore();
    const location = useLocation();
    const { isInstallable, installApp, needRefresh, updateApp, closeUpdateTrigger, offlineReady } = usePWA();

    useEffect(() => {
        initSession();
    }, [initSession]);

    const [activeTab, setActiveTab] = useState<'chat' | 'friends'>('chat');
    const [showInterestsModal, setShowInterestsModal] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [showFriendRequestsModal, setShowFriendRequestsModal] = useState(false);
    const [showInboxModal, setShowInboxModal] = useState(false);
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
    const [dismissedInstallPrompt, setDismissedInstallPrompt] = useState(false);
    const [dismissedUpdatePrompt, setDismissedUpdatePrompt] = useState(false);
    const [offlineNoticeVisible, setOfflineNoticeVisible] = useState(false);

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

    const [persistentRoomId, setPersistentRoomId] = useState<string | null>(currentRoomId);
    useEffect(() => {
        if (currentRoomId) {
            setPersistentRoomId(currentRoomId);
            return;
        }
        if (!isInChat || !partnerId) {
            setPersistentRoomId(null);
        }
    }, [currentRoomId, isInChat, partnerId]);

    const activeRoomId = currentRoomId || persistentRoomId;
    const isDmRoute = location.pathname.startsWith('/chat/dm/');
    const isRoomChatRoute = /^\/chat\/(?:new|text)\/[^/]+/.test(location.pathname);
    const shouldRenderPersistentChat =
        !!activeRoomId &&
        (isDmRoute || isRoomChatRoute);

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

    useEffect(() => {
        if (isInstallable) {
            setDismissedInstallPrompt(false);
        }
    }, [isInstallable]);

    useEffect(() => {
        if (needRefresh) {
            setDismissedUpdatePrompt(false);
        }
    }, [needRefresh]);

    useEffect(() => {
        if (!offlineReady) return;
        setOfflineNoticeVisible(true);
        const timer = window.setTimeout(() => setOfflineNoticeVisible(false), 4500);
        return () => window.clearTimeout(timer);
    }, [offlineReady]);

    return (
        <DmSignalingProvider>
            <div className={`chitchat-dashboard-theme ${theme === 'dark' ? 'theme-dark' : ''} min-h-full h-full w-full overflow-hidden bg-background text-foreground`}>
                <NotificationListener />
                <div className="text-foreground bg-background h-full min-h-0 flex flex-col overflow-hidden text-sm md:text-base">
                    {/* Header — hidden when video mode etc. */}
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

                    <div className="flex h-full min-h-0 overflow-hidden relative">
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
                        <Outlet
                            context={{
                                setHideChrome,
                                setShowInterestsModal,
                                suppressEmbeddedChat: shouldRenderPersistentChat,
                            }}
                        />
                        {shouldRenderPersistentChat && (
                            <div className={isDmRoute ? 'hidden' : 'flex-1 min-w-0'}>
                                <ChatArea roomId={activeRoomId ?? undefined} />
                            </div>
                        )}
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
                        peerId={profileModal.peerId}
                        username={profileModal.username}
                        avatarSeed={profileModal.avatarSeed}
                        requestStatus="friends"
                        onAddFriend={() => { }}
                    />
                )}

                {offlineNoticeVisible && (
                    <div
                        className="fixed bottom-4 left-1/2 z-[70] -translate-x-1/2 rounded-lg border border-emerald-500/40 bg-emerald-900/85 px-4 py-2 text-xs text-emerald-100 shadow-xl"
                        role="status"
                        aria-live="polite"
                    >
                        Offline mode is ready
                    </div>
                )}

                {isInstallable && !dismissedInstallPrompt && (
                    <div
                        className="fixed right-4 z-[70] max-w-[min(94vw,24rem)] rounded-xl border border-border/70 bg-panel/95 p-3 shadow-2xl backdrop-blur"
                        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
                    >
                        <p className="text-sm font-semibold text-panel-foreground">Install BuzzU app</p>
                        <p className="mt-1 text-xs text-muted-foreground">Get faster launch and a full-screen mobile experience.</p>
                        <div className="mt-3 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setDismissedInstallPrompt(true)}
                                className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/20 min-h-11"
                                aria-label="Dismiss install prompt"
                            >
                                Not now
                            </button>
                            <button
                                type="button"
                                onClick={installApp}
                                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 min-h-11"
                                aria-label="Install BuzzU app"
                            >
                                Install
                            </button>
                        </div>
                    </div>
                )}

                {needRefresh && !dismissedUpdatePrompt && (
                    <div
                        className="fixed left-4 z-[70] max-w-[min(94vw,24rem)] rounded-xl border border-border/70 bg-panel/95 p-3 shadow-2xl backdrop-blur"
                        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
                    >
                        <p className="text-sm font-semibold text-panel-foreground">Update available</p>
                        <p className="mt-1 text-xs text-muted-foreground">A newer version is ready. Reload to apply improvements.</p>
                        <div className="mt-3 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setDismissedUpdatePrompt(true);
                                    closeUpdateTrigger();
                                }}
                                className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/20 min-h-11"
                                aria-label="Dismiss update prompt"
                            >
                                Later
                            </button>
                            <button
                                type="button"
                                onClick={updateApp}
                                className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90 min-h-11"
                                aria-label="Reload to update app"
                            >
                                Reload
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </DmSignalingProvider>
    );
}
