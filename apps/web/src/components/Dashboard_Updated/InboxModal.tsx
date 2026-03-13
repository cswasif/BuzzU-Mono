import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../stores/sessionStore';
import { CheckCircleIcon } from './Icons';

interface InboxModalProps {
  onClose: () => void;
}

const InboxModal: React.FC<InboxModalProps> = ({ onClose }) => {
  const { notifications, removeNotification, setDmFriend } = useSessionStore();
  const navigate = useNavigate();

  const handleChat = (id: string, fromId: string, fromUsername: string, fromAvatarSeed: string, fromAvatarUrl?: string | null) => {
    setDmFriend({ id: fromId, username: fromUsername, avatarSeed: fromAvatarSeed, avatarUrl: fromAvatarUrl });
    onClose();
    navigate(`/chat/dm/${fromId}`);
  };

  const handleDismiss = (id: string) => {
    removeNotification(id);
  };

  return (
    <div className="fixed inset-0 z-50 bg-transparent" onClick={onClose}>
      <div
        className="absolute top-[56px] right-4 z-50 w-72 bg-popover text-popover-foreground outline-none rounded-md border border-neutral-900 border-1 p-0 shadow-neutral-900/50 shadow-lg xs:w-72 sm:w-80 drop-shadow-sm animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        style={{
          '--radix-popover-content-transform-origin': 'var(--radix-popper-transform-origin)',
        } as React.CSSProperties}
      >
        <span className="flex w-full flex-row items-center gap-1 rounded-t-lg bg-muted px-4 py-4 text-lg font-bold">
          <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" height="22" width="22" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clipRule="evenodd"></path>
          </svg>
          Inbox
        </span>
        <div dir="ltr" className="relative flex max-h-96 flex-col overflow-auto last:rounded-b-box">
          <div className="h-full w-full rounded-[inherit] overflow-hidden scrollbar-hide">
            {notifications.length === 0 ? (
              <div className="flex flex-row items-center justify-center px-4 py-9 gap-2">
                <CheckCircleIcon className="w-5 h-5" />
                <span className="text-base">No notifications</span>
              </div>
            ) : (
              <div style={{ minWidth: '100%', display: 'table' }}>
                <ul className="m-0 p-0 list-none">
                  {notifications.map((notif) => (
                    <li key={notif.id} className="flex cursor-pointer flex-row items-center gap-4 px-3 py-3 hover:bg-card transition-colors">
                      <span className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full">
                        <img
                          className="aspect-square h-full w-full"
                          alt={notif.fromUsername}
                          src={notif.fromAvatarUrl || `https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&seed=${notif.fromAvatarSeed}&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80`}
                        />
                      </span>
                      <div className="flex flex-col justify-center text-sm">
                        <span className="text-sm font-bold text-base leading-tight">
                          <b className="font-bold">{notif.fromUsername}</b> {notif.content}
                        </span>
                        <div className="mt-2 flex gap-3">
                          <button
                            onClick={() => handleChat(notif.id, notif.fromId, notif.fromUsername, notif.fromAvatarSeed, notif.fromAvatarUrl)}
                            className="inline-flex disabled:select-none items-center justify-center text-xs font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-6 rounded-md px-3 cursor-pointer transition-all active:scale-95"
                          >
                            Chat
                          </button>
                          <button
                            onClick={() => handleDismiss(notif.id)}
                            className="inline-flex disabled:select-none items-center justify-center text-xs font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-6 rounded-md px-3 cursor-pointer transition-all active:scale-95"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InboxModal;
