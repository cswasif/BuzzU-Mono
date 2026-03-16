import React, { useCallback } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useSignaling } from '../../hooks/useSignaling';

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
        role="dialog"
        aria-label="Friend Requests"
        data-state="open"
        className="absolute top-[56px] right-3 sm:right-4 md:right-24 z-50 w-[min(20rem,calc(100vw-1.5rem))] bg-popover text-popover-foreground outline-none rounded-md border border-border mt-3 p-0 shadow-neutral-900/50 shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-full flex-row items-center gap-1 rounded-t-lg bg-muted px-4 py-4 text-lg font-bold">
          <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 16 16" aria-hidden="true" height="21" width="21" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.5 9a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7m.354 5.854 1.5-1.5a.5.5 0 0 0-.708-.708l-.646.647V10.5a.5.5 0 0 0-1 0v2.793l-.646-.647a.5.5 0 0 0-.708.708l1.5 1.5a.5.5 0 0 0 .708 0M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0"></path>
            <path d="M2 13c0 1 1 1 1 1h5.256A4.5 4.5 0 0 1 8 12.5a4.5 4.5 0 0 1 1.544-3.393Q8.844 9.002 8 9c-5 0-6 3-6 4"></path>
          </svg>
          Friend Requests
          {requestIds.length > 0 && (
            <span className="ml-auto bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded-full">
              {requestIds.length}
            </span>
          )}
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {requestIds.length === 0 ? (
            <div className="rounded-b-box flex flex-row items-center justify-center px-4 py-9 gap-2">
              <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
              </svg>
              <span className="text-sm sm:text-base">No pending friend requests.</span>
            </div>
          ) : (
            <ul className="relative flex max-h-96 flex-col overflow-auto last:rounded-b-box">
              {requestIds.map((id) => {
                const request = friendRequestsReceived[id];
                return (
                  <li key={id} className="flex cursor-pointer flex-row items-center gap-4 px-2 py-3 hover:bg-card">
                    <span className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full">
                      <img
                        className="aspect-square h-full w-full"
                        src={`https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&seed=${request.avatarSeed}&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80`}
                        alt={request.username}
                      />
                    </span>
                    <div className="flex flex-col justify-center text-sm min-w-0">
                      <div className="text-sm leading-tight">
                        <b className="text-base">{request.username}</b> sent you a friend request.
                      </div>
                      <div className="mt-2 flex gap-3">
                        <button
                          onClick={() => handleAccept(id)}
                          className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-6 rounded-md px-2"
                          title="Accept"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleDecline(id)}
                          className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-6 rounded-md px-2"
                          title="Ignore"
                        >
                          Ignore
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default FriendRequestsModal;
