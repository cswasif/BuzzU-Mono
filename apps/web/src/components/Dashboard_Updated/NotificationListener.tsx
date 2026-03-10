import React, { useEffect } from 'react';
import { useSignaling } from '../../hooks/useSignaling';
import { useSessionStore } from '../../stores/sessionStore';
import { toast } from 'sonner';

const NotificationListener: React.FC = () => {
    const { onFriendRequest } = useSignaling();
    const { addNotification, peerId } = useSessionStore();

    useEffect(() => {
        // Listen for friend request acceptance
        onFriendRequest((action, from, username, avatarSeed) => {
            if (action === 'accept') {
                const newNotif = {
                    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                    type: 'friend_request_accepted' as const,
                    fromId: from,
                    fromUsername: username || 'Someone',
                    fromAvatarSeed: avatarSeed || from,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    content: 'accepted your friend request.',
                };

                addNotification(newNotif);

                // Show a small toast as well
                toast.success(`${newNotif.fromUsername} accepted your friend request!`);
            }
        });
    }, [onFriendRequest, addNotification]);

    return null; // This component doesn't render anything
};

export default NotificationListener;
