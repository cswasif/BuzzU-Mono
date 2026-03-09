import React, { useState, useEffect } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import MainContent from '../components/Dashboard_Updated/MainContent';

/**
 * ChatNewPage — Matchmaker dashboard content.
 * Renders inside DashboardLayout's <Outlet />.
 *
 * Routes:
 *   /chat/new          → Dashboard (search UI)
 *   /chat/new/:roomId  → Active matched chat (reconnects to room)
 */

interface DashboardOutletContext {
    setHideChrome: (hide: boolean) => void;
    setShowInterestsModal: (show: boolean) => void;
}

export const ChatNewPage: React.FC = () => {
    const { setHideChrome, setShowInterestsModal } = useOutletContext<DashboardOutletContext>();
    const { roomId } = useParams<{ roomId?: string }>();

    // If roomId is in the URL, go straight to chat (reconnect mode)
    const [activeArea, setActiveArea] = useState<'main' | 'chat' | 'video'>(roomId ? 'chat' : 'main');

    // When roomId appears in URL, switch to chat view.
    // We intentionally do NOT reset to 'main' when roomId disappears,
    // because ChatArea manages its own connection states (skipped, searching, idle).
    // The 'main' view is restored by: initial useState, or the sidebar 'new-chat-clicked' event.
    useEffect(() => {
        if (roomId) {
            setActiveArea('chat');
        }
    }, [roomId]);

    // Hide the shared layout chrome when in video mode
    useEffect(() => {
        setHideChrome(activeArea === 'video');
        return () => setHideChrome(false);
    }, [activeArea, setHideChrome]);

    // "New Chat" from sidebar resets to main dashboard
    useEffect(() => {
        const onNewChat = () => setActiveArea('main');
        window.addEventListener('new-chat-clicked', onNewChat);
        return () => window.removeEventListener('new-chat-clicked', onNewChat);
    }, []);

    return (
        <MainContent
            activeArea={activeArea}
            setActiveArea={setActiveArea}
            onManageInterests={() => setShowInterestsModal(true)}
            roomId={roomId}
        />
    );
};

export default ChatNewPage;
