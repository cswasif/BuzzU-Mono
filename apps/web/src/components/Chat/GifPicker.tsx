import React, { useRef, useEffect } from 'react';
import { GifPicker as KlipyPicker } from './klipy/components/GifPicker';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { X } from 'lucide-react';
import './klipy/styles.css';

interface GifPickerProps {
    onGifSelect: (gif: any) => void;
    isOpen: boolean;
    onClose: () => void;
    anchorRef?: React.RefObject<HTMLElement | null>;
    variant?: 'floating' | 'docked';
    compact?: boolean;
}

export const GifPicker: React.FC<GifPickerProps> = ({
    onGifSelect,
    isOpen,
    onClose,
    anchorRef,
    variant = 'floating',
    compact = false
}) => {
    const isDocked = variant === 'docked';
    const pickerRef = useRef<HTMLDivElement>(null);
    const isMobile = useMediaQuery('(max-width: 1024px)');
    const { resolvedTheme } = useTheme();
    const [isDarkMode, setIsDarkMode] = React.useState(false);

    useEffect(() => {
        const updateTheme = () => {
            const container = pickerRef.current?.closest('.chitchat-dashboard-theme');
            if (container) {
                setIsDarkMode(container.classList.contains('theme-dark'));
                return;
            }

            const isDark = document.documentElement.classList.contains('dark') ||
                document.body.classList.contains('theme-dark') ||
                resolvedTheme === 'dark';
            setIsDarkMode(isDark);
        };

        updateTheme();

        const container = pickerRef.current?.closest('.chitchat-dashboard-theme');
        const observerTarget = container ?? document.documentElement;
        const observer = new MutationObserver(updateTheme);
        observer.observe(observerTarget, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, [resolvedTheme, isOpen]);

    // Click outside to close (only applies for floating mode)
    useEffect(() => {
        if (!isOpen || isDocked) return;

        const handlePointerDown = (event: MouseEvent | TouchEvent) => {
            const target = event.target as Node;
            if (pickerRef.current?.contains(target)) return;
            if (anchorRef?.current?.contains(target)) return;

            // Don't close if clicking within the klipy picker
            if ((target as Element).closest('.gpr-picker')) return;

            onClose();
        };

        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handlePointerDown);
            document.addEventListener('touchstart', handlePointerDown);
        }, 100);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('touchstart', handlePointerDown);
        };
    }, [isOpen, onClose, anchorRef, isDocked]);

    // isDarkMode is now handled via state and useTheme hook

    if (!isOpen) return null;

    if (isDocked) {
        return (
            <div ref={pickerRef} className="h-full w-full flex flex-col bg-popover">
                <KlipyPicker
                    klipyApiKey={process.env.KLIPY_API_KEY!}
                    theme={isDarkMode ? 'dark' : 'light'}
                    onGifClick={onGifSelect}
                    width="100%"
                    height="100%"
                />
            </div>
        );
    }

    // Floating dimensions
    const desktopWidth = compact ? 360 : 450;
    const desktopHeight = compact ? 320 : 450;
    const mobileWidth = compact ? 280 : 320;
    const mobileHeight = compact ? 220 : 350;

    return (
        <AnimatePresence>
            {!isDocked && (
                <motion.div
                    ref={pickerRef}
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="absolute z-[100]"
                    style={{
                        bottom: isMobile ? 'calc(100% + 8px)' : (anchorRef?.current ? `${window.innerHeight - anchorRef.current.getBoundingClientRect().top + 12}px` : '80px'),
                        left: 'auto',
                        right: isMobile ? '8px' : '12px',
                        width: isMobile ? `${mobileWidth}px` : `${desktopWidth}px`,
                        height: isMobile ? `${mobileHeight}px` : `${desktopHeight}px`,
                        maxHeight: isMobile ? `${mobileHeight}px` : `${desktopHeight}px`,
                        maxWidth: isMobile ? 'calc(100vw - 16px)' : `${desktopWidth}px`,
                        borderRadius: '12px',
                        overflow: 'hidden',
                        boxShadow: '0 -10px 40px -10px rgba(0, 0, 0, 0.5), 0 -4px 10px -2px rgba(0, 0, 0, 0.2)',
                        transformOrigin: 'bottom right',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                >
                    <div className="flex flex-col h-full bg-popover border-t lg:border border-border flex-1 min-h-0">
                        {isMobile && (
                            <div className="flex items-center justify-end p-2 border-b border-border bg-muted/20 h-10 shrink-0">
                                <button
                                    onClick={onClose}
                                    className="p-1 hover:bg-muted rounded-full text-muted-foreground"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        )}
                        <div className="flex-1 min-h-0 flex flex-col relative w-full h-full klipy-container-override">
                            <KlipyPicker
                                klipyApiKey={process.env.KLIPY_API_KEY!}
                                theme={isDarkMode ? 'dark' : 'light'}
                                onGifClick={onGifSelect}
                                width="100%"
                                height="100%"
                            />
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
