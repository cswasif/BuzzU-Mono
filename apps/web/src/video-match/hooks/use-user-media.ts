import { useUserMediaContext } from '../../context/UserMediaContext';

/**
 * Hook to consume the singleton media stream from UserMediaContext.
 * Provides a robust, app-wide reference to the local camera/mic.
 */
export function useUserMedia() {
    const { stream, error, permissionState, requestMedia, stopMedia } = useUserMediaContext();

    return {
        stream,
        error,
        permissionState,
        requestMedia,
        getStream: requestMedia, // Legacy alias
        stopStream: stopMedia    // Legacy alias
    };
}
