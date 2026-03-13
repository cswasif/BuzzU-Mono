import { useState, useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Extend the Window interface to handle beforeinstallprompt
interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{
        outcome: 'accepted' | 'dismissed';
        platform: string;
    }>;
    prompt(): Promise<void>;
}

export function usePWA() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstallable, setIsInstallable] = useState(false);
    const isMountedRef = useRef(true);

    const {
        needRefresh: [needRefresh, setNeedRefresh],
        offlineReady: [offlineReady, setOfflineReady],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            if (isMountedRef.current) {
                if (import.meta.env.DEV) {
                    console.log('SW Registered: ', r);
                }
            }
        },
        onRegisterError(error) {
            if (isMountedRef.current) {
                console.error('SW registration error', error);
            }
        },
    });

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        const handleBeforeInstallPrompt = (e: Event) => {
            if (!isMountedRef.current) return;
            // Prevent Chrome 67 and earlier from automatically showing the prompt
            e.preventDefault();
            // Stash the event so it can be triggered later.
            if (import.meta.env.DEV) {
                console.log('App is installable. Stashing prompt.');
            }
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setIsInstallable(true);
        };

        const handleAppInstalled = () => {
            if (!isMountedRef.current) return;
            if (import.meta.env.DEV) {
                console.log('App was installed successfully');
            }
            setIsInstallable(false);
            setDeferredPrompt(null);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const installApp = async () => {
        if (!deferredPrompt) return false;

        // Show the install prompt
        await deferredPrompt.prompt();

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            if (import.meta.env.DEV) {
                console.log('User accepted the install prompt');
            }
        } else {
            if (import.meta.env.DEV) {
                console.log('User dismissed the install prompt');
            }
        }

        // Clear the deferred prompt, it can only be used once.
        setDeferredPrompt(null);
        setIsInstallable(false);
        return outcome === 'accepted';
    };

    const closeUpdateTrigger = () => {
        setNeedRefresh(false);
    };

    const updateApp = async () => {
        await updateServiceWorker(true);
    };

    return {
        isInstallable,
        installApp,
        needRefresh,
        offlineReady,
        updateApp,
        closeUpdateTrigger,
    };
}
