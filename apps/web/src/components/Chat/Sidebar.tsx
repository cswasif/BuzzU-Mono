import React from 'react';
import { MessageSquare, Users, Crown, Volume2, Settings, MoreHorizontal } from 'lucide-react';

export function Sidebar() {
  return (
    <aside className="h-full flex flex-col w-[15.4rem] bg-popover max-lg:hidden border-r border-border">
      <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-current">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-9h10v2H7z"/>
          </svg>
        </div>
        <span className="text-xl font-bold text-foreground tracking-tight">Chitchat.gg</span>
      </div>
      <div dir="ltr" data-orientation="horizontal" className="w-full flex-1 min-h-0 overflow-hidden">
        <div className="focus:border-0 w-full max-w-full h-full overflow-hidden">
          <div dir="ltr" className="relative overflow-hidden w-full h-full list-none pr-2 pl-1 flex flex-col">
            <div className="h-full w-full rounded-[inherit] overflow-y-auto scrollbar-t">
              <div style={{ minWidth: '100%', display: 'table' }}>
                <div className="flex flex-col w-full relative">
                  
                  {/* Tabs */}
                  <div className="sticky top-0 z-10 bg-popover pb-2 pt-2">
                    <div role="tablist" aria-orientation="horizontal" className="h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground grid w-full grid-cols-2">
                      <button type="button" role="tab" aria-selected="true" className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-background text-foreground shadow-sm gap-1">
                        <MessageSquare className="h-4 w-4" /> Chat
                      </button>
                      <button type="button" role="tab" aria-selected="false" className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 gap-1 hover:bg-background/50 hover:text-foreground">
                        <Users className="h-4 w-4" /> Friends
                      </button>
                    </div>
                  </div>

                  {/* Chat List */}
                  <div className="px-1">
                    <div className="select-none disabled:select-none rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground py-2 group px-1 bg-placeholder text-placeholder-foreground h-[42px] cursor-pointer my-0 flex flex-row items-center w-full justify-start">
                      <MessageSquare className="ml-1.5 h-4 w-4 p-0.5" />
                      <div className="w-36 overflow-hidden text-ellipsis whitespace-nowrap pl-2 pr-1 font-normal focus:text-placeholder-foreground text-foreground">@Hooman</div>
                    </div>

                    <div className="flex items-center py-0 my-2 text-sm font-bold sm:my-3 hover:text-foreground cursor-default select-none">
                      <div className="shrink-0 bg-border h-[1px] flex-grow mr-1.5"></div>
                      DIRECT MESSAGES
                      <div className="shrink-0 bg-border h-[1px] flex-grow ml-1.5"></div>
                    </div>

                    <div className="mt-6 flex flex-col items-center justify-center dark:opacity-25 opacity-80 grayscale">
                      <img alt="empty-message-illustration" width="140" height="140" draggable="false" src="https://proxy.extractcss.dev/https://app.chitchat.gg/icons/hugo-mailbox.svg" />
                      <p className="mt-4 text-center text-sm">Looks like you're the popular one here. no messages yet!</p>
                    </div>
                  </div>
                </div>
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
            <div className="rounded-lg relative w-56 justify-end self-center bg-gradient-to-tl from-indigo-700 to-purple-700 p-2 px-2 text-center">
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
          
          <div className="flex flex-row items-center gap-0.5 rounded-sm pb-1">
            <button className="disabled:select-none rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 inline-flex grow items-center justify-start gap-2 p-1">
              <div className="relative">
                <span className="flex shrink-0 overflow-hidden relative h-8 w-8 rounded-full">
                  <img className="aspect-square h-full w-full" alt="scattered ointment" src="https://proxy.extractcss.dev/https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&&seed=69a013653ea2c25043517edd&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80" />
                </span>
                <div className="absolute rounded-full ring-2 ring-zinc-700 h-2 w-2 bottom-0 right-0 mr-[1px] mb-[1px] bg-success"></div>
              </div>
              <div className="flex w-20 flex-col items-start justify-around self-center">
                <span className="w-full text-start truncate text-sm font-bold leading-4">scattered ointment</span>
                <span className="text-xs leading-3 text-muted-foreground">Free</span>
              </div>
            </button>
            <button className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground w-8 h-8">
              <Volume2 className="h-4 w-4" />
            </button>
            <button className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground w-8 h-8">
              <Settings className="h-4 w-4" />
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
