import React, { useState, useEffect } from 'react';

interface SettingsPopoverProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const SettingsPopover: React.FC<SettingsPopoverProps> = ({ theme, onToggleTheme }) => {
  const isDarkMode = theme === 'dark';

  return (
    <div
      className="fixed z-50 bg-popover p-1 rounded-md bottom-14 left-2 w-60 border border-border shadow-lg"
      id="headlessui-popover-panel-_r_c_"
      tabIndex={-1}
      data-headlessui-state="open"
      data-open=""
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-sm font-semibold flex flex-row justify-between items-center p-2 px-1">
        <div className="flex flex-row gap-2.5 items-center justify-center">
          <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" height="16" width="16" xmlns="http://www.w3.org/2000/svg">
            <path d="M283.211 512c78.962 0 151.079-35.925 198.857-94.792 7.068-8.708-.639-21.43-11.562-19.35-124.203 23.654-238.262-71.576-238.262-196.954 0-72.222 38.662-138.635 101.498-174.394 9.686-5.512 7.25-20.197-3.756-22.23A258.156 258.156 0 0 0 283.211 0c-141.309 0-256 114.511-256 256 0 141.309 114.511 256 256 256z"></path>
          </svg>
          Dark Theme
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isDarkMode}
          value="on"
          className="peer inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: isDarkMode ? 'hsl(var(--primary))' : 'hsl(var(--placeholder))' }}
          onClick={onToggleTheme}
        >
          <span
            className="pointer-events-none relative block h-5 w-5 rounded-full shadow-lg ring-0 transition-transform"
            style={{
              transform: isDarkMode ? 'translateX(20px)' : 'translateX(0px)',
              backgroundColor: isDarkMode ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x w-4 h-4 absolute inset-0 m-auto" aria-hidden="true" style={{ display: isDarkMode ? 'none' : 'block', color: 'hsl(var(--placeholder))' }}><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-check w-4 h-4 absolute inset-0 m-auto" aria-hidden="true" style={{ display: isDarkMode ? 'block' : 'none', color: 'hsl(var(--primary))' }}><path d="M20 6 9 17l-5-5"></path></svg>
          </span>
        </button>
      </div>

      <a href="https://discord.gg/8FCbZHYDwj" target="_blank" rel="noreferrer" className="inline-flex disabled:select-none items-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 py-2 w-full justify-between px-1">
        <span className="flex flex-row gap-2">
          <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" height="18" width="18" xmlns="http://www.w3.org/2000/svg">
            <path d="M19.3034 5.33716C17.9344 4.71103 16.4805 4.2547 14.9629 4C14.7719 4.32899 14.5596 4.77471 14.411 5.12492C12.7969 4.89144 11.1944 4.89144 9.60255 5.12492C9.45397 4.77471 9.2311 4.32899 9.05068 4C7.52251 4.2547 6.06861 4.71103 4.70915 5.33716C1.96053 9.39111 1.21766 13.3495 1.5891 17.2549C3.41443 18.5815 5.17612 19.388 6.90701 19.9187C7.33151 19.3456 7.71356 18.73 8.04255 18.0827C7.41641 17.8492 6.82211 17.5627 6.24904 17.2231C6.39762 17.117 6.5462 17.0003 6.68416 16.8835C10.1438 18.4648 13.8911 18.4648 17.3082 16.8835C17.4568 17.0003 17.5948 17.117 17.7434 17.2231C17.1703 17.5627 16.576 17.8492 15.9499 18.0827C16.2789 18.73 16.6609 19.3456 17.0854 19.9187C18.8152 19.388 20.5875 18.5815 22.4033 17.2549C22.8596 12.7341 21.6806 8.80747 19.3034 5.33716ZM8.5201 14.8459C7.48007 14.8459 6.63107 13.9014 6.63107 12.7447C6.63107 11.5879 7.45884 10.6434 8.5201 10.6434C9.57071 10.6434 10.4303 11.5879 10.4091 12.7447C10.4091 13.9014 9.57071 14.8459 8.5201 14.8459ZM15.4936 14.8459C14.4535 14.8459 13.6034 13.9014 13.6034 12.7447C13.6034 11.5879 14.4323 10.6434 15.4936 10.6434C16.5442 10.6434 17.4038 11.5879 17.3825 12.7447C17.3825 13.9014 16.5548 14.8459 15.4936 14.8459Z"></path>
          </svg>
          Discord Server
        </span>
        <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" fontSize="22" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"></path>
          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"></path>
        </svg>
      </a>

      <a href="/privacy" className="inline-flex disabled:select-none items-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 py-2 w-full justify-between px-1">
        <span className="flex flex-row gap-2">
          <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 16 16" height="18" width="18" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" d="M8 0c-.69 0-1.843.265-2.928.56-1.11.3-2.229.655-2.887.87a1.54 1.54 0 0 0-1.044 1.262c-.596 4.477.787 7.795 2.465 9.99a11.8 11.8 0 0 0 2.517 2.453c.386.273.744.482 1.048.625.28.132.581.24.829.24s.548-.108.829-.24a7 7 0 0 0 1.048-.625 11.8 11.8 0 0 0 2.517-2.453c1.678-2.195 3.061-5.513 2.465-9.99a1.54 1.54 0 0 0-1.044-1.263 63 63 0 0 0-2.887-.87C9.843.266 8.69 0 8 0m0 5a1.5 1.5 0 0 1 .5 2.915l.385 1.99a.5.5 0 0 1-.491.595h-.788a.5.5 0 0 1-.49-.595l.384-1.99A1.5 1.5 0 0 1 8 5"></path>
          </svg>
          Privacy Policy
        </span>
        <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" fontSize="22" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"></path>
          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"></path>
        </svg>
      </a>

      <a href="/terms" className="inline-flex disabled:select-none items-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 py-2 w-full justify-between px-1">
        <span className="flex flex-row gap-2">
          <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 16 16" height="18" width="18" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2M5 4h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1m-.5 2.5A.5.5 0 0 1 5 6h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5M5 8h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1m0 2h3a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1"></path>
          </svg>
          Terms Of Service
        </span>
        <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" fontSize="22" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"></path>
          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"></path>
        </svg>
      </a>

      <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] w-full my-2"></div>

      <button className="inline-flex disabled:select-none items-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 py-2 w-full justify-start gap-2.5 px-1 text-destructive">
        <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 13v-2H7V8l-5 4 5 4v-3z"></path>
          <path d="M20 3h-9c-1.103 0-2 .897-2 2v4h2V5h9v14h-9v-4H9v4c0 1.103.897 2 2 2h9c1.103 0 2-.897 2-2V5c0-1.103-.897-2-2-2z"></path>
        </svg>
        Logout
      </button>
    </div>
  );
};

export default SettingsPopover;
