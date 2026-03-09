import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSessionStore } from '../../stores/sessionStore';
import { ChatIcon, FriendsIcon, NewChatIcon, EmptyMailboxIcon, SearchIcon, CloudyIcon, GhostIllustration } from './Icons';

const AVATAR_BASE = 'https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80';
function avatarUrl(seed: string) { return `${AVATAR_BASE}&seed=${seed}`; }

/* SVG icons matching BuzzU exactly */
const MessageBubbleIcon = () => (
    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zM7 8H5v2h2V8zm2 0h2v2H9V8zm6 0h-2v2h2V8z" clipRule="evenodd"></path>
    </svg>
);

const RemoveFriendIcon = () => (
    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
        <path d="M11 6a3 3 0 11-6 0 3 3 0 016 0zM14 17a6 6 0 00-12 0h12zM13 8a1 1 0 100 2h4a1 1 0 100-2h-4z"></path>
    </svg>
);

interface SidebarListProps {
    activeTab: 'chat' | 'friends';
    setActiveTab: (tab: 'chat' | 'friends') => void;
}

const SidebarList: React.FC<SidebarListProps> = ({ activeTab, setActiveTab }) => {
    const { friendList, activeDmFriend, setDmFriend, friendRequestsReceived, removeFriend, currentRoomId, isInChat, partnerName, partnerAvatarSeed, partnerAvatarUrl } = useSessionStore();
    const [searchQuery, setSearchQuery] = useState('');
    const navigate = useNavigate();
    const location = useLocation();

    const handleOpenDM = (friend: { id: string; username: string; avatarSeed: string }) => {
        setDmFriend(friend);
        // If we're already on a DM page, navigate to the new friend's DM URL
        // If we're on /chat/new or anywhere else, navigate to the DM URL
        navigate(`/chat/dm/${friend.id}`);
    };

    const handleCloseDM = (e: React.MouseEvent, friendId: string) => {
        e.stopPropagation();
        e.preventDefault();
        if (activeDmFriend?.id === friendId) {
            setDmFriend(null);
            // If we're on the DM page for this friend, go back to dashboard
            if (location.pathname.startsWith('/chat/dm/')) {
                navigate('/chat/new');
            }
        }
    };

    const handleOpenProfile = (friend: { id: string; username: string; avatarSeed: string }) => {
        const evt = new CustomEvent('open-friend-profile', {
            detail: { peerId: friend.id, username: friend.username, avatarSeed: friend.avatarSeed }
        });
        window.dispatchEvent(evt);
    };

    const handleRemoveFriend = (e: React.MouseEvent, friendId: string) => {
        e.stopPropagation();
        removeFriend(friendId);
    };

    const filteredFriends = searchQuery
        ? friendList.filter(f => f.username.toLowerCase().includes(searchQuery.toLowerCase()))
        : friendList;

    return (
        <div dir="ltr" className="relative overflow-hidden w-full h-full list-none pr-2 pl-1" role="list" aria-label="Sidebar">
            <div data-radix-scroll-area-viewport="" className="h-full w-full rounded-[inherit]" style={{ overflow: 'hidden scroll' }}>
                <div style={{ minWidth: '100%', display: 'table' }}>
                    <div className="flex flex-col w-full h-full">
                        {/* Tabs */}
                        <div className="w-full">
                            <li role="tablist" aria-orientation="horizontal" className="h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground grid my-2 mb-3 w-full grid-cols-2" tabIndex={0} data-orientation="horizontal" style={{ outline: 'none' }}>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={activeTab === 'chat'}
                                    aria-controls="radix-_r_5_-content-chat"
                                    data-state={activeTab === 'chat' ? 'active' : 'inactive'}
                                    id="radix-_r_5_-trigger-chat"
                                    className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-1"
                                    tabIndex={-1}
                                    data-orientation="horizontal"
                                    data-radix-collection-item=""
                                    onClick={() => setActiveTab('chat')}
                                >
                                    <ChatIcon /> Chat
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={activeTab === 'friends'}
                                    aria-controls="radix-_r_5_-content-friends"
                                    data-state={activeTab === 'friends' ? 'active' : 'inactive'}
                                    id="radix-_r_5_-trigger-friends"
                                    className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-1 relative"
                                    tabIndex={-1}
                                    data-orientation="horizontal"
                                    data-radix-collection-item=""
                                    onClick={() => setActiveTab('friends')}
                                >
                                    <FriendsIcon /> Friends
                                    {Object.keys(friendRequestsReceived).length > 0 && (
                                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground font-bold">
                                            {Object.keys(friendRequestsReceived).length}
                                        </span>
                                    )}
                                </button>
                            </li>
                        </div>

                        {activeTab === 'chat' ? (
                            <>
                                {/* Active matched chat OR New Chat button */}
                                <div className="w-full">
                                    {isInChat && currentRoomId && partnerName ? (
                                        /* Active matched chat — show @partnerName like BuzzU */
                                        <li>
                                            <a
                                                href="#"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setDmFriend(null);
                                                    navigate(`/chat/new/${currentRoomId}`);
                                                }}
                                                className={`disabled:select-none items-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground py-2 group flex w-full justify-start px-1 h-[42px] cursor-pointer my-0 flex-row ${location.pathname.startsWith('/chat/new/') ? 'bg-accent text-accent-foreground' : ''}`}
                                            >
                                                <div className="relative">
                                                    <span className="flex shrink-0 overflow-hidden relative h-8 w-8 rounded-full">
                                                        <img
                                                            className="aspect-square h-full w-full"
                                                            alt={partnerName}
                                                            src={partnerAvatarUrl || avatarUrl(partnerAvatarSeed || '')}
                                                        />
                                                    </span>
                                                    <div className="absolute bg-emerald-500 rounded-full ring-2 ring-zinc-700 h-2 w-2 bottom-0 right-0 mr-[1px] mb-[1px]"></div>
                                                </div>
                                                <div className="w-36 overflow-hidden text-ellipsis whitespace-nowrap pl-2 pr-1 font-normal text-foreground focus:text-placeholder-foreground">@{partnerName}</div>
                                                <div className="flex-grow"></div>
                                            </a>
                                        </li>
                                    ) : (
                                        /* No active chat — show New Chat button */
                                        <li>
                                            <span
                                                className="select-none disabled:select-none rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground py-2 group px-1 bg-placeholder text-placeholder-foreground h-[42px] cursor-pointer my-0 flex flex-row items-center w-full justify-start"
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => {
                                                    setDmFriend(null);
                                                    window.dispatchEvent(new CustomEvent('new-chat-clicked'));
                                                    navigate('/chat/new');
                                                }}
                                            >
                                                <NewChatIcon className="ml-1.5 w-5 h-5 p-0.5" />
                                                <div className="w-36 overflow-hidden text-ellipsis whitespace-nowrap pl-2 pr-1 font-normal focus:text-placeholder-foreground text-brightness">New Chat</div>
                                                <div className="flex-grow"></div>
                                            </span>
                                        </li>
                                    )}
                                </div>

                                {/* Divider */}
                                <div className="w-full">
                                    <div className="flex items-center py-0 my-2 text-sm font-bold sm:my-3 hover:text-brightness cursor-default select-none text-muted-foreground">
                                        <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] flex-grow mr-1.5"></div>
                                        DIRECT MESSAGES
                                        <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] flex-grow ml-1.5"></div>
                                    </div>
                                </div>

                                {/* DM Friend List or Empty State */}
                                {friendList.length > 0 ? (
                                    <div className="w-full">
                                        {friendList.map((friend) => (
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
                                                                src={avatarUrl(friend.avatarSeed)}
                                                            />
                                                        </span>
                                                        <div className="absolute bg-black rounded-full ring-2 ring-zinc-700 h-2 w-2 bottom-0 right-0 mr-[1px] mb-[1px]"></div>
                                                    </div>
                                                    <div className="w-36 overflow-hidden text-ellipsis whitespace-nowrap pl-2 pr-1 font-normal text-foreground focus:text-placeholder-foreground">{friend.username}</div>
                                                    <div className="flex-grow"></div>
                                                    <button
                                                        onClick={(e) => handleCloseDM(e, friend.id)}
                                                        className="disabled:select-none items-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-6 rounded-md px-2 hidden flex-grow justify-end ml-auto focus:flex focus:opacity-100 group-hover:opacity-100 hover:bg-transparent text-card-foreground/70 hover:text-card-foreground md:flex md:opacity-0"
                                                    >
                                                        <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]" xmlns="http://www.w3.org/2000/svg"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                    </button>
                                                </a>
                                            </li>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="w-full">
                                        <div className="mt-6 flex flex-col items-center justify-center opacity-[var(--empty-state-opacity)] grayscale">
                                            <EmptyMailboxIcon />
                                            <p className="mt-4 text-center text-sm">Looks like you're the popular one here. no messages yet!</p>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                {/* Search Bar */}
                                <div className="w-full">
                                    <div className="relative">
                                        <input
                                            className="flex rounded-md border border-input bg-field px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pr-10 w-full h-[42px]"
                                            placeholder="Search Friends"
                                            maxLength={32}
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                        />
                                        <span className="absolute inset-y-0 right-3 flex items-center cursor-default">
                                            <SearchIcon />
                                        </span>
                                    </div>
                                </div>

                                {/* Divider */}
                                <div className="w-full">
                                    <div className="flex items-center py-0 my-2 text-sm font-bold sm:my-3 hover:text-brightness cursor-default select-none">
                                        <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] flex-grow mr-1.5"></div>
                                        FRIENDS LIST
                                        <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] flex-grow ml-1.5"></div>
                                    </div>
                                </div>

                                {/* Friends List or Empty State */}
                                {filteredFriends.length > 0 ? (
                                    <div className="w-full">
                                {filteredFriends.map((friend) => (
                                            <li key={friend.id}>
                                                <span className="flex">
                                                    <div
                                                        className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3 m-0 w-full cursor-pointer justify-start !px-0.5 py-6"
                                                        role="button"
                                                        aria-label="Friend"
                                                        tabIndex={0}
                                                    >
                                                        {/* Avatar — clickable to open profile */}
                                                        <div
                                                            className="relative cursor-pointer"
                                                            onClick={() => handleOpenProfile(friend)}
                                                        >
                                                            <span className="flex shrink-0 overflow-hidden relative h-8 w-8 rounded-full">
                                                                <img
                                                                    className="aspect-square h-full w-full"
                                                                    alt={friend.username}
                                                                    src={avatarUrl(friend.avatarSeed)}
                                                                />
                                                            </span>
                                                            <div className="absolute bg-black rounded-full ring-2 ring-zinc-700 h-2 w-2 bottom-0 right-0 mr-[1px] mb-[1px]"></div>
                                                        </div>

                                                        {/* Username */}
                                                        <div className="w-32 overflow-hidden text-ellipsis whitespace-nowrap pl-2 pr-1 text-sm font-normal">{friend.username}</div>

                                                        {/* Action buttons */}
                                                        <div className="ml-auto flex flex-row gap-1">
                                                            {/* Message button */}
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleOpenDM(friend); }}
                                                                className="inline-flex items-center justify-center bg-transparent hover:bg-accent hover:text-accent-foreground h-7 w-7 rounded-full"
                                                                style={{ border: 'none' }}
                                                                title="Message"
                                                            >
                                                                <MessageBubbleIcon />
                                                            </button>
                                                            {/* Remove friend button */}
                                                            <button
                                                                onClick={(e) => handleRemoveFriend(e, friend.id)}
                                                                className="inline-flex items-center justify-center bg-transparent hover:bg-accent hover:text-accent-foreground h-7 w-7 rounded-full"
                                                                style={{ border: 'none' }}
                                                                title="Remove Friend"
                                                            >
                                                                <RemoveFriendIcon />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </span>
                                            </li>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="w-full">
                                        <div className="mt-16 flex flex-col items-center justify-center opacity-[var(--empty-state-opacity)] grayscale select-text">
                                            <CloudyIcon />
                                            <p className="mt-4 text-center text-sm">
                                                {searchQuery
                                                    ? `No friends matching "${searchQuery}"`
                                                    : 'No friends, no drama. Enjoy the peace! ...or add some friends.'
                                                }
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SidebarList;
