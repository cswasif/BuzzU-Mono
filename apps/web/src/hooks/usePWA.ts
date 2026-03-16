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
    const swUrlRef = useRef<string | null>(null);
    const swRegistrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);

    const {
        needRefresh: [needRefresh, setNeedRefresh],
        offlineReady: [offlineReady, setOfflineReady],
        updateServiceWorker,
    } = useRegisterSW({
        immediate: true,
        onRegistered(r) {
            if (isMountedRef.current) {
                if (import.meta.env.DEV) {
                    console.log('SW Registered: ', r);
                }
            }
        },
        onRegisteredSW(swUrl, registration) {
            swUrlRef.current = swUrl;
            swRegistrationRef.current = registration ?? undefined;
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
        let timer: number | undefined;
        const triggerUpdateCheck = async () => {
            const registration = swRegistrationRef.current;
            const swUrl = swUrlRef.current;
            if (!registration || !swUrl) {
                return;
            }
            if (registration.installing) {
                return;
            }
            if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) {
                return;
            }
            try {
                const response = await fetch(swUrl, {
                    cache: 'no-store',
                    headers: {
                        cache: 'no-store',
                        'cache-control': 'no-cache',
                    },
                });
                if (response.status === 200) {
                    await registration.update();
                }
            } catch (error) {
                if (import.meta.env.DEV) {
                    console.warn('SW update check failed', error);
                }
            }
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void triggerUpdateCheck();
            }
        };
        timer = window.setInterval(() => {
            void triggerUpdateCheck();
        }, 60_000);
        const triggerUpdateCheckOnFocus = () => {
            void triggerUpdateCheck();
        };
        window.addEventListener('focus', triggerUpdateCheckOnFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        void triggerUpdateCheck();
        return () => {
            if (timer !== undefined) {
                window.clearInterval(timer);
            }
            window.removeEventListener('focus', triggerUpdateCheckOnFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    useEffect(() => {
        if (!needRefresh || !isMountedRef.current) return;
        updateServiceWorker(true).catch((error) => {
            console.error('SW update apply error', error);
        });
    }, [needRefresh, updateServiceWorker]);

    useEffect(() => {
        const handleBeforeInstallPrompt = (e: Event) => {
            if (!isMountedRef.current) return;
            const isLocalDevHost = import.meta.env.DEV && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
            if (isLocalDevHost) {
                return;
            }
            e.preventDefault();
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
