import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Maximize2, XCircle } from 'lucide-react';

interface ModernImageProps {
    src: string;
    alt?: string;
    className?: string;
    maxHeight?: string;
    status?: 'sending' | 'sent' | 'error';
    progress?: number;
    isGif?: boolean;
}

export const ModernImage: React.FC<ModernImageProps> = ({
    src,
    alt = 'Shared image',
    className = '',
    maxHeight = '300px',
    status = 'sent',
    progress = 0,
    isGif = false
}) => {
    const [isRevealed, setIsRevealed] = useState(isGif);
    const [isHovered, setIsHovered] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);

    const toggleReveal = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isGif) {
            setIsFullScreen(true);
            return;
        }
        setIsRevealed(!isRevealed);
    };

    const handleOpenOriginal = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsFullScreen(true);
    };

    return (
        <div
            className={`relative rounded-xl overflow-hidden border border-border bg-muted/20 group cursor-pointer transition-all duration-300 ${className || 'w-fit'}`}
            style={{ maxHeight }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={toggleReveal}
        >
            {/* Blurred Placeholder / Background */}
            <motion.img
                src={src}
                alt={alt}
                onLoad={() => {
                    window.dispatchEvent(new CustomEvent('chat-media-loaded'));
                }}
                initial={false}
                animate={{
                    filter: isRevealed ? 'blur(0px)' : 'blur(40px)',
                    scale: isRevealed ? 1 : 1.1,
                    opacity: isRevealed ? 1 : 0.6
                }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="w-full h-full object-contain pointer-events-none"
                style={{ maxHeight, filter: status === 'sending' ? 'grayscale(0.5) blur(5px)' : undefined }}
            />

            {/* Progress Overlay */}
            {status === 'sending' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] z-10">
                    <div className="w-32 h-1.5 bg-white/20 rounded-full overflow-hidden mb-2">
                        <motion.div
                            className="h-full bg-primary"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                        />
                    </div>
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                        Sending {Math.round(progress)}%
                    </span>
                </div>
            )}

            {/* Modern Overlay */}
            <AnimatePresence>
                {!isRevealed && !isGif && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 backdrop-blur-[2px]"
                    >
                        <div className="bg-background/80 backdrop-blur-md rounded-full px-4 py-2 flex items-center gap-2 shadow-xl border border-white/10 text-foreground group-hover:scale-105 transition-transform duration-300">
                            <Eye className="w-4 h-4 text-primary" />
                            <span className="text-xs font-semibold">Click to View</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating Toolbar when revealed */}
            <AnimatePresence>
                {isRevealed && isHovered && !isGif && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2"
                    >
                        <button
                            onClick={toggleReveal}
                            className="p-2 rounded-full bg-background/80 backdrop-blur-md border border-white/10 text-foreground hover:bg-background transition-colors shadow-lg"
                            title="Hide"
                        >
                            <EyeOff className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleOpenOriginal}
                            className="p-2 rounded-full bg-background/80 backdrop-blur-md border border-white/10 text-foreground hover:bg-background transition-colors shadow-lg"
                            title="Open Original"
                        >
                            <Maximize2 className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Tap to Reveal Hint (Mobile) */}
            {/* Fullscreen Lightbox Overlay */}
            <AnimatePresence>
                {isFullScreen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 md:p-10"
                        onClick={() => setIsFullScreen(false)}
                    >
                        {/* Close button */}
                        <motion.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="absolute top-5 right-5 z-[110] p-2 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md border border-white/10 transition-colors"
                            onClick={(e) => { e.stopPropagation(); setIsFullScreen(false); }}
                        >
                            <XCircle className="w-6 h-6" />
                        </motion.button>

                        {/* Image Viewer */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="relative max-w-full max-h-full flex items-center justify-center overflow-hidden rounded-lg shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                            drag="y"
                            dragConstraints={{ top: 0, bottom: 0 }}
                            onDragEnd={(_, info) => {
                                if (Math.abs(info.offset.y) > 100) {
                                    setIsFullScreen(false);
                                }
                            }}
                        >
                            <img
                                src={src}
                                alt={alt}
                                className="max-w-full max-h-[90vh] object-contain select-none shadow-2xl rounded"
                                draggable={false}
                            />
                        </motion.div>

                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/50 text-xs font-medium tracking-wide bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-md md:hidden">
                            Swipe up or down to dismiss
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
