import React from 'react';

const Banner: React.FC = () => {
  return (
    <span className="flex h-8 w-full flex-row items-center justify-center bg-warning p-2 text-center text-sm select-none">
      <p className="text-xs md:text-sm font-medium text-white">You're using an anonymous account.</p>
      <span className="hidden md:flex text-white">&nbsp;all changes will be lost after logging out </span>
      <button className="inline-flex disabled:select-none items-center justify-center font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-6 rounded-md mx-1 sm:mx-2 p-1 text-xs md:text-sm">
        Claim Account
      </button>
    </span>
  );
};

export default Banner;
