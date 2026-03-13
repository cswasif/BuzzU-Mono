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
    const {
        friendList,
        setDmFriend,
        activeDmFriend,
        matchHistory,
        partnerId,
        partnerName,
        partnerAvatarSeed,
        partnerAvatarUrl,
        dmMessages,
    } = useSessionStore();
    // Resolve friendId from URL → store
    useEffect(() => {
        if (!friendId) return;

        const friendFromList = friendList.find(f => f.id === friendId);
        const friendFromActive = activeDmFriend?.id === friendId ? activeDmFriend : null;
        const match = matchHistory.find(m => m.id === friendId);
        const friendFromMatch = match
            ? {
                id: match.id,
                username: match.username || 'Friend',
                avatarSeed: match.avatarSeed || match.id,
                avatarUrl: match.avatarUrl || null,
            }
            : null;
        const friendFromPartner = partnerId === friendId
            ? {
                id: partnerId,
                username: partnerName || 'Partner',
                avatarSeed: partnerAvatarSeed || partnerId,
                avatarUrl: partnerAvatarUrl || null,
            }
            : null;
        const friendFromMessages = (dmMessages[friendId] && dmMessages[friendId].length > 0)
            ? {
                id: friendId,
                username: activeDmFriend?.id === friendId ? activeDmFriend.username : 'Friend',
                avatarSeed: activeDmFriend?.id === friendId ? activeDmFriend.avatarSeed : friendId,
                avatarUrl: activeDmFriend?.id === friendId ? (activeDmFriend.avatarUrl || null) : null,
            }
            : null;
        const friendFromRoute = {
            id: friendId,
            username: 'Friend',
            avatarSeed: friendId,
            avatarUrl: null,
        };

        const friend = friendFromList || friendFromActive || friendFromMatch || friendFromPartner || friendFromMessages || friendFromRoute;
        if (friend) {
            // Read current value from store directly to avoid dep cycle
            const current = useSessionStore.getState().activeDmFriend;
            if (current?.id !== friend.id) {
                setDmFriend(friend);
            }
        }
    }, [
        friendId,
        friendList,
        activeDmFriend,
        matchHistory,
        partnerId,
        partnerName,
        partnerAvatarSeed,
        partnerAvatarUrl,
        dmMessages,
        setDmFriend,
    ]);

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
