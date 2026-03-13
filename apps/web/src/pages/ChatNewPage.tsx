import React, { useState, useEffect } from 'react';
import { useOutletContext, useParams, useLocation } from 'react-router-dom';
import MainContent from '../components/Dashboard_Updated/MainContent';

/**
 * ChatNewPage — Matchmaker dashboard content.
 * Renders inside DashboardLayout's <Outlet />.
 *
 * Routes:
 *   /chat/new          → Dashboard (search UI)
 *   /chat/new/:roomId  → Active matched chat (reconnects to room)
 *   /chat/text         → Text chat mode (alias for /chat/new in chat mode)
 *   /chat/text/:roomId → Active matched chat with room reconnect
 */

interface DashboardOutletContext {
    setHideChrome: (hide: boolean) => void;
    setShowInterestsModal: (show: boolean) => void;
}

export const ChatNewPage: React.FC = () => {
    const { setHideChrome, setShowInterestsModal } = useOutletContext<DashboardOutletContext>();
    const { roomId } = useParams<{ roomId?: string }>();
    const location = useLocation();

    // Derive activeArea from URL path
    const getInitialArea = (): 'main' | 'chat' => {
        const path = location.pathname;
        if (path.startsWith('/chat/text')) return 'chat';
        if (roomId) return 'chat';
        return 'main';
    };

    const [activeArea, setActiveArea] = useState<'main' | 'chat'>(getInitialArea);

    // When URL changes, update activeArea accordingly
    useEffect(() => {
        const path = location.pathname;
        if (path.startsWith('/chat/text')) {
            setActiveArea('chat');
        } else if (roomId) {
            setActiveArea('chat');
        }
    }, [location.pathname, roomId]);

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
