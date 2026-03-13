import React, { useCallback } from 'react';
import { useSessionStore, MatchRecord } from '../../stores/sessionStore';
import { useSignaling } from '../../hooks/useSignaling';
import { HistoryIcon, StarIllustration } from './Icons';
import { UserPlus, UserCheck, Check, Clock, ShieldCheck, MessageSquare, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface RightSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const RightSidebar: React.FC<RightSidebarProps> = ({ isOpen, onClose }) => {
  const {
    matchHistory,
    friendList,
    friendRequestsSent,
    friendRequestsReceived,
    sendFriendRequest: sendFriendRequestAction,
    acceptFriendRequest,
    displayName,
    avatarSeed,
  } = useSessionStore();

  const { sendFriendRequest: sendFriendRequestSignaling } = useSignaling();

  const getStatus = (peerId: string) => {
    if (friendList.some((f) => f.id === peerId)) return 'friends';
    if (friendRequestsSent.includes(peerId)) return 'sent';
    if (friendRequestsReceived[peerId]) return 'received';
    return 'none';
  };

  const handleAction = useCallback(
    (match: MatchRecord) => {
      const status = getStatus(match.id);
      if (status === 'none') {
        sendFriendRequestAction(match.id);
        sendFriendRequestSignaling(match.id, 'send', displayName, avatarSeed, useSessionStore.getState().avatarUrl);
      } else if (status === 'received') {
        acceptFriendRequest(match.id, displayName, avatarSeed, useSessionStore.getState().avatarUrl);
        sendFriendRequestSignaling(match.id, 'accept', displayName, avatarSeed, useSessionStore.getState().avatarUrl);
      }
    },
    [
      sendFriendRequestAction,
      sendFriendRequestSignaling,
      acceptFriendRequest,
      displayName,
      avatarSeed,
      friendList,
      friendRequestsSent,
      friendRequestsReceived,
    ]
  );

  const openProfile = (match: MatchRecord) => {
    window.dispatchEvent(new CustomEvent('open-friend-profile', {
      detail: {
        username: match.username,
        avatarSeed: match.avatarSeed,
        avatarUrl: match.avatarUrl,
        peerId: match.id,
      }
    }));
  };

  const renderActionButton = (match: MatchRecord) => {
    const status = getStatus(match.id);

    if (status === 'friends') {
      return (
        <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-400/80 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">
          <UserCheck className="w-3 h-3" />
        </div>
      );
    }

    if (status === 'sent') {
      return (
        <div className="flex items-center gap-1 text-[10px] font-bold text-[#8d96f6]/80 bg-[#8d96f6]/10 px-1.5 py-0.5 rounded-full">
          <Clock className="w-3 h-3" />
        </div>
      );
    }

    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleAction(match);
        }}
        className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md transition-all duration-200 ${status === 'received'
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'hover:bg-accent text-muted-foreground hover:text-foreground'
          }`}
      >
        {status === 'received' ? <Check className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
        {status === 'received' ? 'ACCEPT' : ''}
      </button>
    );
  };

  return (
    <>
      <style>{`
        [data-radix-scroll-area-viewport] {
          scrollbar-width: none;
          -ms-overflow-style: none;
          -webkit-overflow-scrolling: touch;
        }
        [data-radix-scroll-area-viewport]::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {/* Overlay */}
      <div
        className={`fixed inset-0 z-20 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ease-in-out lg:hidden ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        onClick={onClose}
      ></div>

      {/* Right Sidebar */}
      <div
        dir="ltr"
        className={`absolute right-0 top-0 z-30 h-full w-80 bg-popover transition-transform duration-300 ease-in-out transform border-l border-border/10 flex flex-col ${isOpen ? 'translate-x-0 block shadow-2xl' : 'translate-x-full hidden lg:translate-x-full'
          }`}
        style={{ position: 'absolute', '--radix-scroll-area-corner-width': '0px', '--radix-scroll-area-corner-height': '0px' } as React.CSSProperties}
      >
        <div data-radix-scroll-area-viewport="" className="h-full w-full rounded-[inherit]" style={{ overflow: 'hidden scroll' }}>
          <div style={{ minWidth: '100%', display: 'table' }}>
            <ul className="h-full w-full px-1 pt-1">
              <div dir="ltr" className="relative overflow-hidden w-full px-2" style={{ position: 'relative' }}>
                <div data-radix-scroll-area-viewport="" className="h-full w-full rounded-[inherit]" style={{ overflow: 'hidden scroll' }}>
                  <div style={{ minWidth: '100%', display: 'table' }}>

                    {/* Header */}
                    <div className="mt-2 flex flex-row items-center justify-between px-3 sm:mt-3">
                      <div className="flex items-center gap-2">
                        <HistoryIcon className="h-4 w-4" />
                        <span className="text-sm font-bold">MATCH HISTORY</span>
                      </div>
                      <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-accent transition-colors"
                        aria-label="Close Sidebar"
                      >
                        <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                      </button>
                    </div>

                    <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] w-full divider my-3"></div>

                    {/* Content */}
                    <div className="flex flex-col w-full h-full pb-6">
                      {matchHistory.length === 0 ? (
                        <div className="mt-12 flex flex-col items-center justify-center opacity-40 grayscale">
                          <StarIllustration />
                          <p className="mt-4 text-center text-[11px] px-4 font-medium">No matches yet! Once you chat with someone, they'll appear here.</p>
                        </div>
                      ) : (
                        <>
                          <span className="text-[10px] text-start mb-2 px-1 items-center justify-center gap-1 font-bold tracking-wider text-muted-foreground uppercase">
                            Recent Matches
                          </span>

                          {matchHistory.map((match) => (
                            <li key={`${match.id}-${match.timestamp}`} className="group relative my-0.5">
                              <div
                                onClick={() => openProfile(match)}
                                className="flex flex-row items-center w-full justify-start h-[42px] px-1 rounded-md transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer group"
                              >
                                <span className="flex shrink-0 overflow-hidden relative h-8 w-8 rounded-full border border-border/20">
                                  <img
                                    className="aspect-square h-full w-full"
                                    alt={match.username}
                                    src={match.avatarUrl || `https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&seed=${match.avatarSeed}&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80`}
                                  />
                                  {match.isVerified && (
                                    <div className="absolute top-0 right-0 bg-primary text-primary-foreground rounded-full p-0.5 ring-1 ring-popover scale-[0.6]">
                                      <ShieldCheck className="w-3 h-3" />
                                    </div>
                                  )}
                                </span>

                                <div className="flex flex-col min-w-0 pl-2 flex-grow pr-1">
                                  <div className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                                    {match.username}
                                  </div>
                                  <div className="text-[9px] text-muted-foreground/60 font-bold truncate">
                                    {formatDistanceToNow(new Date(match.timestamp), { addSuffix: true })}
                                  </div>
                                </div>

                                <div className="shrink-0 flex items-center gap-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openProfile(match);
                                    }}
                                    className="p-1.5 rounded-md hover:bg-popover text-muted-foreground hover:text-foreground transition-colors"
                                    title="View Profile"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                  </button>
                                  {renderActionButton(match)}
                                </div>
                              </div>
                            </li>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default RightSidebar;
