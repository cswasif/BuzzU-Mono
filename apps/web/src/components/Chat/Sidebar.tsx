import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MessageSquare, Users, Crown, Volume2, Settings, MoreHorizontal, X, UserPlus, Maximize2, Minimize2 } from 'lucide-react';
import { useSessionStore } from '../../stores/sessionStore';
import { useSignalingContext } from '../../context/SignalingContext';

const AVATAR_BASE = 'https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80';

function avatarUrl(seed: string) {
  return `${AVATAR_BASE}&seed=${seed}`;
}

export function Sidebar() {
  const { avatarSeed, avatarUrl: myCustomAvatarUrl, displayName, friendList, activeDmFriend, setDmFriend, dmUnreadCounts } = useSessionStore();
  const { peersInRoom } = useSignalingContext();
  const [activeTab, setActiveTab] = React.useState<'chat' | 'friends'>('chat');
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const navigate = useNavigate();
  const location = useLocation();
  const totalUnreadDmCount = useMemo(
    () => Object.values(dmUnreadCounts).reduce((sum, count) => sum + count, 0),
    [dmUnreadCounts],
  );

  // ── Fullscreen toggle ──────────────────────────────────────────
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('[Sidebar] Fullscreen toggle failed:', err);
    }
  }, []);

  // Sync fullscreen state with browser events
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Memoize avatar URLs to avoid Dicebear URL recomputation on every render
  const myAvatarUrl = useMemo(() => myCustomAvatarUrl || avatarUrl(avatarSeed), [avatarSeed, myCustomAvatarUrl]);
  const friendAvatarUrls = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of friendList) { map[f.id] = f.avatarUrl || avatarUrl(f.avatarSeed); }
    return map;
  }, [friendList]);

  const handleOpenDM = (friend: { id: string; username: string; avatarSeed: string; avatarUrl?: string | null }) => {
    setDmFriend(friend);
    navigate(`/chat/dm/${friend.id}`);
  };

  const handleCloseDM = (e: React.MouseEvent, friendId: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (activeDmFriend?.id === friendId) {
      setDmFriend(null);
      if (location.pathname.startsWith('/chat/dm/')) {
        navigate('/chat/new');
      }
    }
  };

  const handleNewChat = () => {
    setDmFriend(null);
    const evt = new CustomEvent('open-new-chat');
    window.dispatchEvent(evt);
  };

  return (
    <aside className="h-full flex flex-col w-[15.4rem] bg-popover max-lg:hidden border-r border-border">
      {/* Logo Header */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-primary-foreground fill-current">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-9h10v2H7z" />
          </svg>
        </div>
        <span className="text-xl font-bold text-foreground tracking-tight">BuzzU</span>
      </div>

      {/* Scrollable area */}
      <div dir="ltr" data-orientation="horizontal" className="w-62 flex-1 min-h-0 overflow-hidden">
        <div className="focus:border-0 w-full max-w-full h-full overflow-hidden">
          <div dir="ltr" className="relative overflow-hidden w-full h-full list-none pr-2 pl-1" role="list" aria-label="Sidebar">
            <div data-radix-scroll-area-viewport="" className="h-full w-full rounded-[inherit]" style={{ overflow: 'hidden scroll' }}>
              <div style={{ minWidth: '100%', display: 'table' }}>

                {/* Tabs Row */}
                <li role="tablist" aria-orientation="horizontal" className="h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground grid my-2 mb-3 w-full grid-cols-2" tabIndex={0} data-orientation="horizontal" style={{ outline: 'none' }}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'chat'}
                    data-state={activeTab === 'chat' ? 'active' : 'inactive'}
                    onClick={() => setActiveTab('chat')}
                    className="relative inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-1"
                    tabIndex={-1}
                    data-orientation="horizontal"
                  >
                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" height="16" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"></path><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"></path></svg> Chat
                    {totalUnreadDmCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[10px] font-bold leading-none text-white">
                        {totalUnreadDmCount > 99 ? '99+' : totalUnreadDmCount}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'friends'}
                    data-state={activeTab === 'friends' ? 'active' : 'inactive'}
                    onClick={() => setActiveTab('friends')}
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-1"
                    tabIndex={-1}
                    data-orientation="horizontal"
                  >
                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" height="15" width="15" xmlns="http://www.w3.org/2000/svg"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"></path></svg> Friends
                  </button>
                </li>

                {/* Chat Tab Content */}
                {activeTab === 'chat' && (
                  <>
                    {/* New Chat Button */}
                    <li>
                      <span
                        className="select-none disabled:select-none rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground py-2 group px-1 bg-placeholder text-placeholder-foreground h-[42px] cursor-pointer my-0 flex flex-row items-center w-full justify-start"
                        role="button"
                        tabIndex={0}
                        onClick={handleNewChat}
                      >
                        <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 16 16" className="ml-1.5 w-5 h-5 p-0.5" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M16 8c0 3.866-3.582 7-8 7a9 9 0 0 1-2.347-.306c-.584.296-1.925.864-4.181 1.234-.2.032-.352-.176-.273-.362.354-.836.674-1.95.77-2.966C.744 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7M4.5 5a.5.5 0 0 0 0 1h7a.5.5 0 0 0 0-1zm0 2.5a.5.5 0 0 0 0 1h7a.5.5 0 0 0 0-1zm0 2.5a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1z"></path></svg>
                        <div className="w-36 overflow-hidden text-ellipsis whitespace-nowrap pl-2 pr-1 font-normal focus:text-placeholder-foreground text-brightness">New Chat</div>
                        <div className="flex-grow"></div>
                      </span>
                    </li>

                    {/* DIRECT MESSAGES divider */}
                    <div className="flex items-center py-0 my-2 text-sm font-bold sm:my-3 hover:text-brightness cursor-default select-none">
                      <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] flex-grow mr-1.5"></div>
                      DIRECT MESSAGES
                      <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] flex-grow ml-1.5"></div>
                    </div>

                    {/* Friend DM List - Real data from friendList */}
                    {friendList.length > 0 ? (
                      friendList.map((friend) => (
                        <li key={friend.id}>
                          <a
                            href="#"
                            onClick={(e) => { e.preventDefault(); handleOpenDM(friend); }}
                            className={`disabled:select-none items-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground py-2 group flex w-full justify-start px-1 h-[42px] cursor-pointer my-0 flex-row ${activeDmFriend?.id === friend.id ? 'bg-accent text-accent-foreground' : ''}`}
                          >
                            <div className="relative">
                              <span className="flex shrink-0 overflow-hidden relative h-8 w-8 rounded-full">
                                <img
                                  className="aspect-square h-full w-full"
                                  alt={friend.username}
                                  src={friendAvatarUrls[friend.id]}
                                />
                              </span>
                              <div className={`absolute rounded-full ring-2 ring-zinc-700 h-2 w-2 bottom-0 right-0 mr-[1px] mb-[1px] ${peersInRoom.includes(friend.id) ? 'bg-success' : 'bg-black'}`}></div>
                            </div>
                            <div className="w-36 overflow-hidden text-ellipsis whitespace-nowrap pl-2 pr-1 font-normal text-foreground focus:text-placeholder-foreground">{friend.username}</div>
                            <div className="flex-grow"></div>
                            {(dmUnreadCounts[friend.id] || 0) > 0 ? (
                              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1.5 text-[11px] font-bold leading-none text-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]">
                                {dmUnreadCounts[friend.id] > 99 ? '99+' : dmUnreadCounts[friend.id]}
                              </span>
                            ) : (
                              <button
                                onClick={(e) => handleCloseDM(e, friend.id)}
                                className="disabled:select-none items-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-6 rounded-md px-2 hidden flex-grow justify-end ml-auto focus:flex focus:opacity-100 group-hover:opacity-100 hover:bg-transparent text-card-foreground/70 hover:text-card-foreground md:flex md:opacity-0"
                              >
                                <X className="h-[15px] w-[15px]" />
                              </button>
                            )}
                          </a>
                        </li>
                      ))
                    ) : (
                      <div className="mt-6 flex flex-col items-center justify-center dark:opacity-25 opacity-80 grayscale">
                        <img alt="empty-message-illustration" width="140" height="140" draggable="false" src="https://proxy.extractcss.dev/https://app.chitchat.gg/icons/hugo-mailbox.svg" />
                        <p className="mt-4 text-center text-sm">Looks like you're the popular one here. no messages yet!</p>
                      </div>
                    )}
                  </>
                )}

                {/* Friends Tab Content */}
                {activeTab === 'friends' && (
                  <>
                    {friendList.length > 0 ? (
                      <>
                        <div className="flex items-center py-0 my-2 text-sm font-bold sm:my-3 hover:text-brightness cursor-default select-none">
                          <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] flex-grow mr-1.5"></div>
                          FRIENDS LIST
                          <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] flex-grow ml-1.5"></div>
                        </div>
                        {friendList.map((friend) => (
                          <li key={friend.id}>
                            <div className="disabled:select-none items-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground py-2 group flex w-full justify-start px-1 h-[42px] cursor-pointer my-0 flex-row">
                              <div className="relative">
                                <span className="flex shrink-0 overflow-hidden relative h-8 w-8 rounded-full">
                                  <img
                                    className="aspect-square h-full w-full"
                                    alt={friend.username}
                                    src={friendAvatarUrls[friend.id] || avatarUrl(friend.avatarSeed)}
                                  />
                                </span>
                                <div className={`absolute rounded-full ring-2 ring-zinc-700 h-2 w-2 bottom-0 right-0 mr-[1px] mb-[1px] ${peersInRoom.includes(friend.id) ? 'bg-success' : 'bg-black'}`}></div>
                              </div>
                              <div className="w-24 overflow-hidden text-ellipsis whitespace-nowrap pl-2 pr-1 font-normal text-foreground focus:text-placeholder-foreground">{friend.username}</div>
                              <div className="flex-grow"></div>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleOpenDM(friend)}
                                  className="inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-accent text-card-foreground/70 hover:text-card-foreground"
                                  title="Message"
                                >
                                  <MessageSquare className="h-[15px] w-[15px]" />
                                </button>
                                <button
                                  className="inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-accent text-card-foreground/70 hover:text-card-foreground"
                                  title="Add to group"
                                >
                                  <UserPlus className="h-[15px] w-[15px]" />
                                </button>
                              </div>
                            </div>
                          </li>
                        ))}
                      </>
                    ) : (
                      <div className="mt-10 flex flex-col items-center justify-center opacity-40 select-none">
                        <Users className="h-12 w-12 mb-4" />
                        <p className="text-center text-xs">No friends added yet.<br />Start matching to find friends!</p>
                      </div>
                    )}
                  </>
                )}

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="flex-shrink-0">
        <div className="bg-panel px-1 relative z-10">
          {/* Mobile Get Premium Button */}
          <button className="inline-flex disabled:select-none items-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-primary/90 h-10 py-2 mt-1.5 w-full justify-start bg-gradient-to-r from-pink-700 via-red-500 to-orange-500 px-2 sm:hidden text-white">
            <Crown className="mr-2 h-5 w-5" />
            Get Premium
          </button>

          {/* Desktop Get Premium Card */}
          <div className="relative hidden flex-col justify-end pt-6 sm:flex select-text dark:text-foreground text-background">
            <img alt="crown-icon" loading="lazy" className="absolute -top-1.5 bottom-10 left-0 right-0 z-10 mx-auto" draggable="false" height="65" width="65" src="https://proxy.extractcss.dev/https://app.chitchat.gg/icons/crown.svg" />
            <div className="rounded-lg relative w-56 justify-end self-center bg-gradient-to-tl from-indigo-700 to-emerald-700 p-2 px-2 text-center">
              <div className="text-md mt-6 font-bold"></div>
              <p className="pb-2 pt-2 text-xs text-white">Unlock chat filters, Send and recieve images and videos and more!</p>
              <button className="group relative inline-flex w-full items-center justify-center overflow-hidden rounded-md p-0.5 font-bold">
                <span className="absolute h-full w-full bg-gradient-to-br from-[#ff8a05] via-[#ff5478] to-[#ff00c6] group-hover:from-[#ff00c6] group-hover:via-[#ff5478] group-hover:to-[#ff8a05]"></span>
                <span className="duration-400 relative w-full rounded-md bg-gray-900 py-1 transition-all ease-out group-hover:bg-opacity-0">
                  <span className="relative text-sm text-white flex items-center justify-center">Get Premium</span>
                </span>
              </button>
            </div>
          </div>

          <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] w-full my-1.5"></div>

          {/* User bar */}
          <div className="flex flex-row items-center gap-0.5 rounded-sm pb-1">
            <button className="disabled:select-none rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 inline-flex grow items-center justify-start gap-2 p-1">
              <div className="relative">
                <span className="flex shrink-0 overflow-hidden relative h-8 w-8 rounded-full">
                  <img className="aspect-square h-full w-full" alt={displayName} src={myAvatarUrl} />
                </span>
                <div className="absolute rounded-full ring-2 ring-zinc-700 h-2 w-2 bottom-0 right-0 mr-[1px] mb-[1px] bg-success"></div>
              </div>
              <div className="flex w-20 flex-col items-start justify-around self-center">
                <span className="w-full text-start truncate text-sm font-bold leading-4">{displayName}</span>
                <span className="text-xs leading-3 text-muted-foreground">Free</span>
              </div>
            </button>
            <button className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground w-8 h-8">
              <Volume2 className="h-4 w-4" />
            </button>
            <button className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground w-8 h-8">
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground w-8 h-8"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground w-8 h-8">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
