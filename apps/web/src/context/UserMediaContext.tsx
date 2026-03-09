import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

interface UserMediaContextType {
    stream: MediaStream | null;
    error: Error | null;
    permissionState: 'prompt' | 'granted' | 'denied';
    requestMedia: () => Promise<void>;
    stopMedia: () => void;
}

const UserMediaContext = createContext<UserMediaContextType | undefined>(undefined);

export const UserMediaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt');
    const streamRef = useRef<MediaStream | null>(null);

    const stopMedia = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
                track.stop();
                console.log(`[UserMediaContext] Stopped track: ${track.kind}`);
            });
            streamRef.current = null;
            setStream(null);
        }
    }, []);

    const requestMedia = useCallback(async () => {
        // If we already have a functional stream, don't request again
        if (streamRef.current && streamRef.current.active && streamRef.current.getVideoTracks().length > 0) {
            console.log("[UserMediaContext] Already have active stream, skipping request");
            return;
        }

        try {
            console.log("[UserMediaContext] Requesting getUserMedia...");
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                },
                audio: true
            });

            console.log("[UserMediaContext] getUserMedia success");
            streamRef.current = mediaStream;
            setStream(mediaStream);
            setPermissionState('granted');
            setError(null);
        } catch (err: any) {
            console.error("[UserMediaContext] getUserMedia error:", err);
            setError(err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setPermissionState('denied');
            }
        }
    }, []);

    // Handle visibility changes to potentially resume stream if browser killed it
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && permissionState === 'granted' && (!streamRef.current || !streamRef.current.active)) {
                console.log("[UserMediaContext] Page visible and stream inactive, re-requesting...");
                requestMedia();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [permissionState, requestMedia]);

    // Initial request
    useEffect(() => {
        requestMedia();
        return () => {
            // Don't necessarily stop on unmount if it's a global provider,
            // but if this Provider unmounts, we should clean up.
            stopMedia();
        };
    }, [requestMedia, stopMedia]);

    return (
        <UserMediaContext.Provider value={{ stream, error, permissionState, requestMedia, stopMedia }}>
            {children}
        </UserMediaContext.Provider>
    );
};

export const useUserMediaContext = () => {
    const context = useContext(UserMediaContext);
    if (context === undefined) {
        throw new Error('useUserMediaContext must be used within a UserMediaProvider');
    }
    return context;
};
