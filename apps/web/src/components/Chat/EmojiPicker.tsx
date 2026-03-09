import React, { useRef, useEffect } from 'react';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { motion, AnimatePresence } from 'framer-motion';

interface EmojiPickerProps {
    onEmojiSelect: (emoji: any) => void;
    isOpen: boolean;
    onClose: () => void;
    anchorRef: React.RefObject<HTMLElement | null>;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
    onEmojiSelect,
    isOpen,
    onClose,
    anchorRef
}) => {
    const pickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                isOpen &&
                pickerRef.current &&
                !pickerRef.current.contains(event.target as Node) &&
                anchorRef.current &&
                !anchorRef.current.contains(event.target as Node)
            ) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose, anchorRef]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Click-outside backdrop */}
                    <div
                        className="fixed inset-0 z-[60]"
                        onClick={onClose}
                    />

                    {/* Picker Container */}
                    <motion.div
                        ref={pickerRef}
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="absolute right-0 z-[70]"
                        style={{
                            bottom: 'calc(100% + 20px)',
                            filter: 'drop-shadow(0 10px 15px rgba(0, 0, 0, 0.4))'
                        }}
                    >
                        <Picker
                            data={data}
                            onEmojiSelect={onEmojiSelect}
                            theme={document.documentElement.classList.contains('dark') || document.body.classList.contains('theme-dark') ? 'dark' : 'light'}
                            set="native"
                            icons="outline"
                            previewPosition="none"
                            skinTonePosition="none"
                            navPosition="bottom"
                            perLine={8}
                        />
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};
