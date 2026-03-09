import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    VideoIcon,
    MicIcon,
    Settings2Icon,
    ChevronDownIcon,
    LoadingSpinner
} from '../Dashboard_Updated/Icons';
import { CameraDevice } from '../../hooks/useCamera';

interface CameraSetupLobbyProps {
    localStream: MediaStream | null;
    availableCameras: CameraDevice[];
    availableMicrophones: CameraDevice[];
    currentCameraId: string | null;
    currentMicrophoneId: string | null;
    isCameraOn: boolean;
    isMuted: boolean;
    isMirrored: boolean;
    audioLevel: number;
    onToggleCamera: () => void;
    onToggleMute: () => void;
    onToggleMirror: () => void;
    onSwitchCamera: (deviceId: string) => void;
    onSwitchMicrophone: (deviceId: string) => void;
    onStart: () => void;
}

export const CameraSetupLobby: React.FC<CameraSetupLobbyProps> = ({
    localStream,
    availableCameras,
    availableMicrophones,
    currentCameraId,
    currentMicrophoneId,
    isCameraOn,
    isMuted,
    isMirrored,
    audioLevel,
    onToggleCamera,
    onToggleMute,
    onToggleMirror,
    onSwitchCamera,
    onSwitchMicrophone,
    onStart,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && localStream) {
            videoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    return (
        <div className="flex flex-col items-center justify-center min-h-full w-full p-4 md:p-8 bg-black/20 backdrop-blur-xl rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
            <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">

                {/* Left Side: Preview */}
                <div className="relative group">
                    <div className="relative aspect-video rounded-2xl overflow-hidden border-2 border-white/5 bg-gray-900/50 shadow-inner">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`w-full h-full object-cover transition-transform duration-500 ${isMirrored ? 'scale-x-[-1]' : ''} ${!isCameraOn ? 'opacity-0' : 'opacity-100'}`}
                        />

                        <AnimatePresence>
                            {!isCameraOn && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm"
                                >
                                    <div className="text-center">
                                        <VideoIcon className="w-16 h-16 text-white/20 mx-auto mb-4" />
                                        <p className="text-white/60 font-medium">Camera is off</p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Audio Level Overlay */}
                        <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10 w-fit">
                            <MicIcon className={`w-4 h-4 ${isMuted ? 'text-red-500' : 'text-green-500'}`} />
                            <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"
                                    animate={{
                                        width: isMuted ? '0%' : `${Math.min(audioLevel * 100, 100)}%`
                                    }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                />
                            </div>
                        </div>

                        {/* Mirror Toggle Overlay */}
                        <button
                            onClick={onToggleMirror}
                            className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-lg border border-white/10 transition-colors"
                            title="Toggle Mirror"
                        >
                            <svg
                                className={`w-5 h-5 text-white transition-opacity ${isMirrored ? 'opacity-100' : 'opacity-60'}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                        </button>
                    </div>

                    {/* Quick Controls */}
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 bg-white/5 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
                        <button
                            onClick={onToggleCamera}
                            className={`p-3 rounded-full transition-all ${isCameraOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500/80 text-white shadow-lg shadow-red-500/20'}`}
                        >
                            <VideoIcon className="w-6 h-6" />
                        </button>
                        <button
                            onClick={onToggleMute}
                            className={`p-3 rounded-full transition-all ${!isMuted ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500/80 text-white shadow-lg shadow-red-500/20'}`}
                        >
                            <MicIcon className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Right Side: Setup Options */}
                <div className="flex flex-col gap-6 lg:pl-4">
                    <div className="space-y-2">
                        <h2 className="text-3xl font-bold text-white tracking-tight">Ready to meet?</h2>
                        <p className="text-white/40 text-lg">Check your appearance and audio before joining the buzz.</p>
                    </div>

                    <div className="space-y-4">
                        {/* Camera Selection */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-white/40 uppercase tracking-widest ml-1">Video Source</label>
                            <div className="relative group/select">
                                <select
                                    value={currentCameraId || ''}
                                    onChange={(e) => onSwitchCamera(e.target.value)}
                                    className="w-full h-12 pl-12 pr-10 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white appearance-none cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-primary/40"
                                >
                                    {availableCameras.map(camera => (
                                        <option key={camera.deviceId} value={camera.deviceId} className="bg-gray-900 text-white py-2">
                                            {camera.label}
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 group-hover/select:text-white/60 transition-colors">
                                    <VideoIcon className="w-5 h-5" />
                                </div>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">
                                    <ChevronDownIcon className="w-4 h-4" />
                                </div>
                            </div>
                        </div>

                        {/* Microphone Selection */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-white/40 uppercase tracking-widest ml-1">Audio Source</label>
                            <div className="relative group/select">
                                <select
                                    value={currentMicrophoneId || ''}
                                    onChange={(e) => onSwitchMicrophone(e.target.value)}
                                    className="w-full h-12 pl-12 pr-10 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white appearance-none cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-primary/40"
                                >
                                    {availableMicrophones.map(mic => (
                                        <option key={mic.deviceId} value={mic.deviceId} className="bg-gray-900 text-white py-2">
                                            {mic.label}
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 group-hover/select:text-white/60 transition-colors">
                                    <MicIcon className="w-5 h-5" />
                                </div>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">
                                    <ChevronDownIcon className="w-4 h-4" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={onStart}
                        className="group relative w-full h-16 mt-4 overflow-hidden rounded-2xl bg-primary text-white font-bold text-xl shadow-[0_0_20px_rgba(255,107,157,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                        <div className="flex items-center justify-center gap-3">
                            <span>Start Buzzing</span>
                            <motion.div
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ repeat: Infinity, duration: 1.5 }}
                            >
                                ❤️
                            </motion.div>
                        </div>
                    </button>
                </div>
            </div>

            {/* Background Decorative Elements */}
            <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-96 h-96 bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-96 h-96 bg-blue-500/10 blur-[120px] rounded-full pointer-events-none" />
        </div>
    );
};
