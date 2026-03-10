import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SignalingMessage } from '../../context/SignalingContext';
import { Message } from './types';
import { Smartphone, MonitorPlay, PictureInPicture, X } from 'lucide-react';

interface BackgroundKeepAliveProps {
    partnerName: string;
    messages: Message[];
    isActive: boolean;
}

/**
 * BackgroundKeepAlive
 * 
 * Implements the "Stay-Alive" Picture-in-Picture pattern for mobile browsers.
 * 1. Renders a live "Status & Chat" UI to a hidden canvas.
 * 2. Captures the canvas stream.
 * 3. Adds a silent audio track (crucial for iOS background persistence).
 * 4. Triggers PiP on a hidden video element.
 */
export const BackgroundKeepAlive: React.FC<BackgroundKeepAliveProps> = ({
    partnerName,
    messages,
    isActive
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPiPActive, setIsPiPActive] = useState(false);
    const [supportPiP, setSupportPiP] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const drawIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Check for PiP support on mount
    useEffect(() => {
        setSupportPiP(!!document.pictureInPictureEnabled);
    }, []);

    // Canvas Renderer Loop
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear and draw background
        ctx.fillStyle = '#09090b'; // zinc-950
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Header
        ctx.fillStyle = '#6366f1'; // indigo-500
        ctx.font = 'bold 24px Inter, system-ui, sans-serif';
        ctx.fillText('BuzzU Live', 20, 40);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '16px Inter, system-ui, sans-serif';
        ctx.fillText(`Chatting with ${partnerName || 'Companion'}`, 20, 70);

        // Divider
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.moveTo(20, 90);
        ctx.lineTo(canvas.width - 20, 90);
        ctx.stroke();

        // Draw last 3 messages
        const lastMessages = messages.slice(-3);
        let y = 130;

        lastMessages.forEach((msg) => {
            const isMe = msg.username === 'Me';

            // Draw name/dot
            ctx.fillStyle = isMe ? '#818cf8' : '#10b981';
            ctx.beginPath();
            ctx.arc(30, y - 6, 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = isMe ? '#818cf8' : '#10b981';
            ctx.font = 'bold 14px Inter, system-ui, sans-serif';
            const name = isMe ? 'You' : (msg.username || partnerName);
            ctx.fillText(name, 45, y);

            // Draw content (simple wrap check)
            ctx.fillStyle = '#ffffff';
            ctx.font = '14px Inter, system-ui, sans-serif';

            let content = msg.content;
            if (content.length > 40) content = content.substring(0, 37) + '...';
            ctx.fillText(content, 45, y + 22);

            y += 55;
        });

        // "Connected" Badge
        ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
        ctx.roundRect?.(20, canvas.height - 50, 110, 30, 15);
        ctx.fill();

        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 12px Inter, system-ui, sans-serif';
        ctx.fillText('● CONNECTED', 35, canvas.height - 30);
    }, [partnerName, messages]);

    // Rendering Loop Control
    useEffect(() => {
        if (isPiPActive) {
            // Use setInterval (200ms = 5fps) for background resilience.
            // requestAnimationFrame is heavily throttled in background tabs.
            drawIntervalRef.current = setInterval(draw, 200);
        } else {
            if (drawIntervalRef.current) clearInterval(drawIntervalRef.current);
            // Clear canvas when not in use
            const canvas = canvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx?.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
        return () => {
            if (drawIntervalRef.current) clearInterval(drawIntervalRef.current);
        };
    }, [isPiPActive, draw]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (audioContextRef.current) {
                audioContextRef.current.close().catch(console.error);
            }
        };
    }, []);

    const startPiP = async () => {
        if (isPiPActive) return;

        try {
            const canvas = canvasRef.current;
            const video = videoRef.current;
            if (!canvas || !video) return;

            // 1. Setup/Resume AudioContext (Must be in user gesture)
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }

            if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
            }

            // 2. Setup Silent Audio Anchor
            const oscillator = audioContextRef.current.createOscillator();
            const gainNode = audioContextRef.current.createGain();
            gainNode.gain.value = 0.001; // Tiny value sometimes better than 0 for keeping some OSs happy
            const silentGain = audioContextRef.current.createGain();
            silentGain.gain.value = 0; // Final silence

            oscillator.connect(gainNode);
            gainNode.connect(silentGain);
            silentGain.connect(audioContextRef.current.destination);
            oscillator.start();

            // 3. Setup Canvas Stream
            // @ts-ignore
            const stream = canvas.captureStream(5);
            streamRef.current = stream;

            // Add silent audio track to the stream
            const audioDestination = audioContextRef.current.createMediaStreamDestination();
            silentGain.connect(audioDestination);
            stream.addTrack(audioDestination.stream.getAudioTracks()[0]);

            // 4. Play stream on video
            video.srcObject = stream;
            await video.play();

            // 5. Request PiP
            await video.requestPictureInPicture();
            setIsPiPActive(true);

            video.addEventListener('leavepictureinpicture', () => {
                setIsPiPActive(false);
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(t => t.stop());
                    streamRef.current = null;
                }
            }, { once: true });

        } catch (err) {
            console.error('[BackgroundKeepAlive] Failed to start PiP:', err);
            setIsPiPActive(false);
        }
    };

    if (!supportPiP || !isActive) return null;

    return (
        <div className="flex flex-col gap-2 p-1">
            <button
                onClick={startPiP}
                disabled={isPiPActive}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl transition-all duration-300 font-semibold text-sm ${isPiPActive
                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 active:scale-95'
                    }`}
            >
                {isPiPActive ? (
                    <>
                        <PictureInPicture className="w-4 h-4" />
                        <span>Background Mode Active</span>
                    </>
                ) : (
                    <>
                        <Smartphone className="w-4 h-4" />
                        <span>Stay Connected in Background</span>
                    </>
                )}
            </button>

            {/* Hidden elements required for PiP trick */}
            <div className="hidden">
                <canvas
                    ref={canvasRef}
                    width={400}
                    height={300}
                />
                <video
                    ref={videoRef}
                    muted
                    playsInline
                    autoPlay
                />
            </div>
        </div>
    );
};
