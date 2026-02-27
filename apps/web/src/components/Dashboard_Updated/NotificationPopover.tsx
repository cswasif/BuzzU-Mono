import React from 'react';
import { CheckCircleIcon } from './Icons';

interface NotificationPopoverProps {
    onClose: () => void;
}

const NotificationPopover: React.FC<NotificationPopoverProps> = ({ onClose }) => {
    return (
        <>
            <div 
                className="fixed inset-0 z-40 bg-transparent"
                onClick={onClose}
            />
            <div 
                className="absolute right-0 top-12 z-50 w-80 mr-2 bg-popover rounded-lg shadow-lg border border-border overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 border-b border-border/10 bg-card">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-inbox"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>
                        Inbox
                    </h3>
                </div>
                <div className="p-8 flex flex-col items-center justify-center min-h-[150px] bg-card/50">
                    <div className="flex items-center gap-1 text-muted-foreground font-medium">
                        <CheckCircleIcon />
                        <span>No notifications</span>
                    </div>
                </div>
            </div>
        </>
    );
};

export default NotificationPopover;
