import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DmChatArea } from '../components/Chat/DmChatArea';
import { useSessionStore } from '../stores/sessionStore';

/**
 * DmChatPage — DM conversation content.
 * Renders inside DashboardLayout's <Outlet />.
 *
 * Route: /chat/dm/:friendId
 *
 * This is intentionally thin — it just resolves the friendId
 * from the URL, sets the active DM friend in the store,
 * and renders DmChatArea. All layout chrome (sidebar, header,
 * banner, modals) lives in the shared DashboardLayout.
 */
export const DmChatPage: React.FC = () => {
    const { friendId } = useParams<{ friendId: string }>();
    const navigate = useNavigate();
    const { friendList, setDmFriend } = useSessionStore();

    // Resolve friendId from URL → store
    useEffect(() => {
        if (!friendId) return;

        const friend = friendList.find(f => f.id === friendId);
        if (friend) {
            // Read current value from store directly to avoid dep cycle
            const current = useSessionStore.getState().activeDmFriend;
            if (current?.id !== friend.id) {
                setDmFriend(friend);
            }
        } else {
            // Friend not found — go back to dashboard
            navigate('/chat/new', { replace: true });
        }
    }, [friendId, friendList, setDmFriend, navigate]);

    // "New Chat" from sidebar → back to dashboard
    useEffect(() => {
        const onNewChat = () => navigate('/chat/new');
        window.addEventListener('new-chat-clicked', onNewChat);
        return () => window.removeEventListener('new-chat-clicked', onNewChat);
    }, [navigate]);

    const handleBack = () => {
        // Return to the active matched chat room if one exists,
        // otherwise fall back to the bare dashboard.
        const { currentRoomId, isInChat } = useSessionStore.getState();
        if (isInChat && currentRoomId) {
            navigate(`/chat/new/${currentRoomId}`);
        } else {
            navigate('/chat/new');
        }
    };

    return <DmChatArea onBack={handleBack} />;
};

export default DmChatPage;
