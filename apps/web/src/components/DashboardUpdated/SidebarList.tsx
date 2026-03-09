import React from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { ChatIcon, FriendsIcon, NewChatIcon, EmptyMailboxIcon, SearchIcon, CloudyIcon, GhostIllustration } from './Icons';

interface SidebarListProps {
    activeTab: 'chat' | 'friends';
    setActiveTab: (tab: 'chat' | 'friends') => void;
}

const SidebarList: React.FC<SidebarListProps> = ({ activeTab, setActiveTab }) => {
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
                                    {Object.keys(useSessionStore.getState().friendRequestsReceived).length > 0 && (
                                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground font-bold">
                                            {Object.keys(useSessionStore.getState().friendRequestsReceived).length}
                                        </span>
                                    )}
                                </button>
                            </li>
                        </div>

                        {activeTab === 'chat' ? (
                            <>
                                {/* New Chat Button */}
                                <div className="w-full">
                                    <li>
                                        <span className="select-none disabled:select-none rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground py-2 group px-1 bg-placeholder text-placeholder-foreground h-[42px] cursor-pointer my-0 flex flex-row items-center w-full justify-start" role="button" tabIndex={0}>
                                            <NewChatIcon className="ml-1.5 w-5 h-5 p-0.5" />
                                            <div className="w-36 overflow-hidden text-ellipsis whitespace-nowrap pl-2 pr-1 font-normal focus:text-placeholder-foreground text-brightness">New Chat</div>
                                            <div className="flex-grow"></div>
                                        </span>
                                    </li>
                                </div>

                                {/* Divider */}
                                <div className="w-full">
                                    <div className="flex items-center py-0 my-2 text-sm font-bold sm:my-3 hover:text-brightness cursor-default select-none text-muted-foreground">
                                        <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] flex-grow mr-1.5"></div>
                                        DIRECT MESSAGES
                                        <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] flex-grow ml-1.5"></div>
                                    </div>
                                </div>

                                {/* Empty State */}
                                <div className="w-full">
                                    <div className="mt-6 flex flex-col items-center justify-center opacity-[var(--empty-state-opacity)] grayscale">
                                        <EmptyMailboxIcon />
                                        <p className="mt-4 text-center text-sm">Looks like you're the popular one here. no messages yet!</p>
                                    </div>
                                </div>
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

                                {/* Empty State for Friends */}
                                <div className="w-full">
                                    <div className="mt-16 flex flex-col items-center justify-center opacity-[var(--empty-state-opacity)] grayscale select-text">
                                        <CloudyIcon />
                                        <p className="mt-4 text-center text-sm">No friends, no drama. Enjoy the peace! ...or add some friends.</p>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SidebarList;