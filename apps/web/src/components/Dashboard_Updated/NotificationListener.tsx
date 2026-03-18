import React, { useEffect } from 'react';
import { useSignaling } from '../../hooks/useSignaling';
import { useSessionStore } from '../../stores/sessionStore';
import { toast } from 'sonner';

const NotificationListener: React.FC = () => {
    const { onFriendRequest } = useSignaling();
    const { addNotification, pushNotificationsEnabled } = useSessionStore();

    useEffect(() => {
        onFriendRequest((action, from, username, avatarSeed, avatarUrl) => {
            if (action === 'accept') {
                const newNotif = {
                    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                    type: 'friend_request_accepted' as const,
                    fromId: from,
                    fromUsername: username || 'Someone',
                    fromAvatarSeed: avatarSeed || from,
                    fromAvatarUrl: avatarUrl || null,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    content: 'accepted your friend request.',
                };

                addNotification(newNotif);
                toast.success(`${newNotif.fromUsername} accepted your friend request!`);

                if (
                    pushNotificationsEnabled &&
                    typeof window !== 'undefined' &&
                    'Notification' in window &&
                    Notification.permission === 'granted'
                ) {
                    try {
                        new Notification('BuzzU', {
                            body: `${newNotif.fromUsername} accepted your friend request!`,
                            icon: newNotif.fromAvatarUrl || '/apple-touch-icon.png',
                        });
                    } catch (_) {
                    }
                }
            }
        });
    }, [onFriendRequest, addNotification, pushNotificationsEnabled]);

    useEffect(() => {
        if (
            pushNotificationsEnabled &&
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'default'
        ) {
            Notification.requestPermission().catch(() => { });
        }
    }, [pushNotificationsEnabled]);

    return null;
};

export default NotificationListener;
