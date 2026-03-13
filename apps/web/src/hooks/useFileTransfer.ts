import { useState, useCallback, useRef } from 'react';

interface FileTransferOptions {
    onProgress?: (progress: number) => void;
    onComplete?: (blob: Blob, isVanish?: boolean) => void;
    onError?: (error: Error) => void;
}

export function useFileTransfer(options: FileTransferOptions = {}) {
    const [isTransferring, setIsTransferring] = useState(false);
    const [progress, setProgress] = useState(0);

    // Store options in a ref so callbacks don't depend on the object identity.
    // Callers typically pass inline objects: useFileTransfer({ onComplete: ... })
    // which creates a new reference every render, breaking useCallback memoization.
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const chunksRef = useRef<BlobPart[]>([]);
    const expectedSizeRef = useRef<number>(0);
    const receivedSizeRef = useRef<number>(0);
    const isTransferringRef = useRef<boolean>(false);
    const isVanishRef = useRef<boolean>(false);
    const completionTriggeredRef = useRef<boolean>(false);
    const mimeTypeRef = useRef<string>('application/octet-stream');

    /**
     * Send a file via WebRTC DataChannel.
     * Supports an optional localProgress callback for tracking multiple concurrent or sequential transfers.
     */
    const sendFile = useCallback(async (
        dataChannel: RTCDataChannel,
        file: File,
        isVanish?: boolean,
        localProgress?: (p: number) => void
    ) => {
        if (!dataChannel || dataChannel.readyState !== 'open') {
            throw new Error('DataChannel is not open');
        }

        console.log('[useFileTransfer] Sending file:', file.name, file.size, file.type);
        setIsTransferring(true);
        isTransferringRef.current = true;
        setProgress(0);
        localProgress?.(0);

        try {
            // 1. Send Metadata Packet
            const metadata = {
                type: 'metadata',
                name: file.name,
                size: file.size,
                mime: file.type,
                vanish: isVanish
            };
            dataChannel.send(JSON.stringify(metadata));

            // 2. Stream File in Chunks
            const CHUNK_SIZE = 16384; // 16KB
            const reader = file.stream().getReader();
            let offset = 0;

            // Ensure threshold is set for backpressure
            dataChannel.bufferedAmountLowThreshold = 65536; // 64KB

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                for (let i = 0; i < value.length; i += CHUNK_SIZE) {
                    const chunk = value.slice(i, i + CHUNK_SIZE);

                    // Backpressure control
                    if (dataChannel.bufferedAmount > 1024 * 1024) { // 1MB threshold
                        await new Promise<void>((resolve) => {
                            const onLow = () => {
                                dataChannel.removeEventListener('bufferedamountlow', onLow);
                                resolve();
                            };
                            dataChannel.addEventListener('bufferedamountlow', onLow);
                        });
                    }

                    dataChannel.send(chunk);
                    offset += chunk.length;
                    const currentProgress = file.size > 0 ? (offset / file.size) * 100 : 100;
                    const clampedProgress = Math.min(100, currentProgress);

                    setProgress(clampedProgress);
                    localProgress?.(clampedProgress);
                    optionsRef.current.onProgress?.(clampedProgress);
                }
            }

            // 3. Send Done Marker
            dataChannel.send(JSON.stringify({ type: 'done' }));
            console.log('[useFileTransfer] File sent successfully');

            setIsTransferring(false);
            isTransferringRef.current = false;
            localProgress?.(100);
        } catch (err) {
            console.error('[useFileTransfer] Send error:', err);
            setIsTransferring(false);
            isTransferringRef.current = false;
            optionsRef.current.onError?.(err instanceof Error ? err : new Error('Send failed'));
            throw err;
        }
    }, []);

    const receiveChunk = useCallback((data: ArrayBuffer | string) => {
        // Handle metadata or control messages
        if (typeof data === 'string') {
            try {
                const message = JSON.parse(data);
                if (message.type === 'metadata') {
                    console.log('[useFileTransfer] Receiving file metadata:', message.name, message.size, message.mime);
                    if (isTransferringRef.current && !completionTriggeredRef.current) {
                        console.warn('[useFileTransfer] Duplicate metadata received while transfer in progress, ignoring');
                        return;
                    }
                    expectedSizeRef.current = message.size;
                    receivedSizeRef.current = 0;
                    chunksRef.current = [];
                    isVanishRef.current = !!message.vanish;
                    mimeTypeRef.current = message.mime || 'application/octet-stream';
                    isTransferringRef.current = true;
                    completionTriggeredRef.current = false;
                    setIsTransferring(true);
                    setProgress(0);
                } else if (message.type === 'done') {
                    if (!isTransferringRef.current) {
                        return;
                    }
                    if (completionTriggeredRef.current) {
                        console.warn('[useFileTransfer] Duplicate done message detected, ignoring');
                        return;
                    }
                    console.log('[useFileTransfer] Receive complete');
                    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
                    completionTriggeredRef.current = true;
                    optionsRef.current.onComplete?.(blob, isVanishRef.current);
                    chunksRef.current = [];
                    isTransferringRef.current = false;
                    setIsTransferring(false);
                    setProgress(100);
                }
                return;
            } catch (err) {
                console.error('[useFileTransfer] Failed to parse control message:', err);
                return;
            }
        }

        // Handle binary data
        if (!isTransferringRef.current) {
            console.warn('[useFileTransfer] Received binary chunk but transfer not initiated');
            return;
        }

        try {
            const chunk = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
            let chunkData = chunk;
            let chunkSize = chunkData.byteLength || chunkData.length || 0;
            if (expectedSizeRef.current > 0 && receivedSizeRef.current + chunkSize > expectedSizeRef.current) {
                const remaining = expectedSizeRef.current - receivedSizeRef.current;
                if (remaining <= 0) {
                    return;
                }
                chunkData = chunkData.subarray(0, remaining);
                chunkSize = remaining;
            }
            chunksRef.current.push(chunkData);
            receivedSizeRef.current += chunkSize;

            if (expectedSizeRef.current > 0) {
                const currentProgress = (receivedSizeRef.current / expectedSizeRef.current) * 100;
                const clampedProgress = Math.min(100, currentProgress);
                setProgress(clampedProgress);
                optionsRef.current.onProgress?.(clampedProgress);
            }
        } catch (err) {
            console.error('[useFileTransfer] Failed to process binary chunk:', err);
        }
    }, []);

    const resetTransfer = useCallback(() => {
        setIsTransferring(false);
        setProgress(0);
        chunksRef.current = [];
        expectedSizeRef.current = 0;
        receivedSizeRef.current = 0;
        isTransferringRef.current = false;
        isVanishRef.current = false;
        completionTriggeredRef.current = false;
        mimeTypeRef.current = 'application/octet-stream';
    }, []);

    return {
        sendFile,
        receiveChunk,
        resetTransfer,
        isTransferring,
        progress,
    };
}
