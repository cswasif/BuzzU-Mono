import React from 'react';

const PremiumCard: React.FC = () => {
  return (
    <div className="bg-panel px-1 relative z-10">
      <button className="inline-flex disabled:select-none items-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-primary/90 h-10 py-2 mt-1.5 w-full justify-start bg-gradient-to-r from-pink-700 via-red-500 to-orange-500 px-2 sm:hidden text-brightness">
        <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-5 w-5" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 5h12l3 5l-8.5 9.5a.7 .7 0 0 1 -1 0l-8.5 -9.5l3 -5"></path>
          <path d="M10 12l-2 -2.2l.6 -1"></path>
        </svg>
        Get Premium
      </button>
      <div className="relative hidden flex-col justify-end pt-6 sm:flex select-text dark:text-foreground text-background">
        <img alt="crown-icon" loading="lazy" className="absolute -top-1.5 bottom-10 left-0 right-0 z-10 mx-auto" draggable="false" height="65" width="65" src="https://app.chitchat.gg/icons/crown.svg" />
        <div className="rounded-lg relative w-56 justify-end self-center bg-gradient-to-tl from-indigo-700 to-emerald-700 p-2 px-2 text-center">
          <div className="text-md mt-6 font-bold"></div>
          <p className="pb-2 pt-2 text-xs">Unlock chat filters, Send and recieve images and videos and more!</p>
          <button className="group relative inline-flex w-full items-center justify-center overflow-hidden rounded-md p-0.5 font-bold">
            <span className="absolute h-full w-full bg-gradient-to-br from-[#ff8a05] via-[#ff5478] to-[#ff00c6] group-hover:from-[#ff00c6] group-hover:via-[#ff5478] group-hover:to-[#ff8a05]"></span>
            <span className="duration-400 relative w-full rounded-md bg-gray-900 py-1 transition-all ease-out group-hover:bg-opacity-0">
              <span className="relative text-sm text-white flex items-center justify-center">Get Premium</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PremiumCard;
