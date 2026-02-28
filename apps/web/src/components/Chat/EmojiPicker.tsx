import React, { useEffect, useRef } from 'react';
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
                <motion.div
                    ref={pickerRef}
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute bottom-full right-0 z-50 mb-4"
                    style={{
                        filter: 'drop-shadow(0 10px 15px rgba(0, 0, 0, 0.4))'
                    }}
                >
                    <Picker
                        data={data}
                        onEmojiSelect={onEmojiSelect}
                        theme="dark"
                        set="native"
                        icons="outline"
                        skinTonePosition="none"
                        previewPosition="none"
                        navPosition="bottom"
                        perLine={8}
                        maxFrequentRows={1}
                        autoFocus={true}
                    />
                </motion.div>
            )}
        </AnimatePresence>
    );
};
