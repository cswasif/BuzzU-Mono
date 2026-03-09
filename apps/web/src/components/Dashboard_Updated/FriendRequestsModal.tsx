import React, { useCallback } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useSignaling } from '../../hooks/useSignaling';
import { X, Check } from 'lucide-react';

interface FriendRequestsModalProps {
  onClose: () => void;
}

const FriendRequestsModal: React.FC<FriendRequestsModalProps> = ({ onClose }) => {
  const { friendRequestsReceived, acceptFriendRequest, declineFriendRequest, avatarSeed, displayName } = useSessionStore();
  const { sendFriendRequest: sendFriendRequestSignaling } = useSignaling();

  const handleAccept = useCallback((peerId: string) => {
    acceptFriendRequest(peerId);
    sendFriendRequestSignaling(peerId, 'accept', displayName, avatarSeed);
  }, [acceptFriendRequest, sendFriendRequestSignaling, displayName, avatarSeed]);

  const handleDecline = useCallback((peerId: string) => {
    declineFriendRequest(peerId);
    sendFriendRequestSignaling(peerId, 'decline');
  }, [declineFriendRequest, sendFriendRequestSignaling]);

  const requestIds = Object.keys(friendRequestsReceived);

  return (
    <div className="fixed inset-0 z-50 bg-transparent" onClick={onClose}>
      <div
        className="absolute top-[56px] right-4 sm:right-24 z-50 w-72 bg-popover text-popover-foreground outline-none rounded-lg border border-border mt-3 p-0 shadow-2xl xs:w-72 sm:w-80 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-full flex-row items-center gap-2 bg-muted/50 px-4 py-3 text-sm font-bold border-b border-border">
          <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" height="18" width="18" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"></path>
          </svg>
          Friend Requests
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {requestIds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-2">
              <div className="p-3 rounded-full bg-muted/30">
                <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" height="24" width="24" xmlns="http://www.w3.org/2000/svg" className="text-muted-foreground/50">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                </svg>
              </div>
              <span className="text-xs font-semibold text-muted-foreground">No pending friend requests.</span>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {requestIds.map((id) => {
                const request = friendRequestsReceived[id];
                return (
                  <div key={id} className="flex items-center justify-between p-3 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <img
                          src={`https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&seed=${request.avatarSeed}&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80`}
                          alt={request.username}
                          className="w-10 h-10 rounded-xl bg-muted object-cover border border-border/50"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold truncate max-w-[120px]">{request.username}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">ID:{id.split('_').pop()?.substring(0, 6)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleAccept(id)}
                        className="p-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200"
                        title="Accept"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDecline(id)}
                        className="p-1.5 rounded-md bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all duration-200"
                        title="Decline"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FriendRequestsModal;
