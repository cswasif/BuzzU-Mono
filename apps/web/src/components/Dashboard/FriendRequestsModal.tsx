import React from 'react';
import { useSessionStore } from '../../stores/sessionStore';

interface FriendRequestsModalProps {
  onClose: () => void;
}

const FriendRequestsModal: React.FC<FriendRequestsModalProps> = ({ onClose }) => {
  const { friendRequestsReceived, acceptFriendRequest, declineFriendRequest, avatarSeed } = useSessionStore();
  const requestEntries = Object.entries(friendRequestsReceived);

  return (
    <div className="fixed inset-0 z-50 bg-transparent" onClick={onClose}>
      <div
        className="absolute top-[56px] right-24 z-50 w-72 bg-popover text-popover-foreground outline-none rounded-md border border-border mt-3 p-0 shadow-lg xs:w-72 sm:w-80 drop-shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex w-full flex-row items-center gap-2 rounded-t-lg bg-muted px-4 py-4 text-lg font-bold">
          <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" height="22" width="22" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"></path>
          </svg>
          Friend Requests
          {requestEntries.length > 0 && (
            <span className="ml-auto bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded-full">
              {requestEntries.length}
            </span>
          )}
        </span>
        <div className="max-h-96 overflow-y-auto">
          {requestEntries.length === 0 ? (
            <div className="rounded-b-box flex flex-row items-center justify-center px-4 py-9 gap-2">
              <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
              </svg>
              <span className="text-base font-bold">No pending friend requests.</span>
            </div>
          ) : (
            requestEntries.map(([peerId, { username, avatarSeed }]) => (
              <div
                key={peerId}
                className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center text-primary font-bold">
                  {username.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{username}</p>
                  <p className="text-xs text-muted-foreground truncate">Wants to be friends</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => acceptFriendRequest(peerId)}
                    className="p-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    title="Accept"
                  >
                    <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </button>
                  <button
                    onClick={() => declineFriendRequest(peerId)}
                    className="p-2 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                    title="Decline"
                  >
                    <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default FriendRequestsModal;
