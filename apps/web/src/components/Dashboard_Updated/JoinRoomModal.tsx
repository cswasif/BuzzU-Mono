import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface JoinRoomModalProps {
    isOpen: boolean;
    onClose: () => void;
    onJoin: (roomCode: string, roomKey: string) => void;
}

export function JoinRoomModal({ isOpen, onClose, onJoin }: JoinRoomModalProps) {
    const [roomCode, setRoomCode] = useState('');
    const [roomKey, setRoomKey] = useState('');
    const [mode, setMode] = useState<'join' | 'create'>('join');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setRoomCode('');
            setRoomKey('');
            setMode('join');
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!roomCode.trim()) return;
        const code = roomCode.trim().toLowerCase().replace(/\s+/g, '-');
        onJoin(code, roomKey.trim());
        onClose();
    };

    const generateCode = () => {
        const words = ['alpha', 'beta', 'gamma', 'delta', 'echo', 'foxtrot', 'zulu', 'tango', 'sierra', 'oscar', 'nova', 'blaze', 'spark', 'drift', 'storm'];
        const w1 = words[Math.floor(Math.random() * words.length)];
        const w2 = words[Math.floor(Math.random() * words.length)];
        const num = Math.floor(Math.random() * 100);
        setRoomCode(`${w1}-${w2}-${num}`);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="bg-panel border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 pt-5 pb-2">
                        <h2 className="text-lg font-semibold text-brightness">
                            {mode === 'create' ? 'Create Room' : 'Join Room'}
                        </h2>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Mode Toggle */}
                    <div className="px-5 pb-3">
                        <div className="flex bg-muted/50 rounded-lg p-1">
                            <button
                                onClick={() => setMode('join')}
                                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'join' ? 'bg-background text-brightness shadow-sm' : 'text-muted-foreground'}`}
                            >
                                Join Existing
                            </button>
                            <button
                                onClick={() => { setMode('create'); generateCode(); }}
                                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'create' ? 'bg-background text-brightness shadow-sm' : 'text-muted-foreground'}`}
                            >
                                Create New
                            </button>
                        </div>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Room Code</label>
                            <div className="relative">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={roomCode}
                                    onChange={(e) => setRoomCode(e.target.value)}
                                    placeholder="e.g. alpha-beta-42"
                                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-brightness placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                                    autoComplete="off"
                                />
                                {mode === 'create' && (
                                    <button
                                        type="button"
                                        onClick={generateCode}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded-md hover:bg-indigo-500/10 transition-colors"
                                        title="Generate random code"
                                    >
                                        🎲 Random
                                    </button>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                Password <span className="text-muted-foreground/60">(optional)</span>
                            </label>
                            <input
                                type="password"
                                value={roomKey}
                                onChange={(e) => setRoomKey(e.target.value)}
                                placeholder="Leave empty for open room"
                                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-brightness placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                                autoComplete="off"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={!roomCode.trim()}
                            className="w-full bg-gradient-to-r from-indigo-600 to-emerald-600 text-white py-3 rounded-xl font-semibold text-sm hover:from-indigo-700 hover:to-emerald-700 transition-all shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                        >
                            {mode === 'create' ? 'Create & Join' : 'Join Room'}
                        </button>

                        <p className="text-xs text-center text-muted-foreground">
                            Share the room code with friends so they can join
                        </p>
                    </form>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

export default JoinRoomModal;
