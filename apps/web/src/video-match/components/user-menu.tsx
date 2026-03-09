import { useState, useRef, useEffect } from "react";

/* ─── tiny inline SVG icons matching the reference ─── */

const ExternalLinkIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 2C2.44772 2 2 2.44772 2 3V12C2 12.5523 2.44772 13 3 13H12C12.5523 13 13 12.5523 13 12V8.5C13 8.22386 12.7761 8 12.5 8C12.2239 8 12 8.22386 12 8.5V12H3V3L6.5 3C6.77614 3 7 2.77614 7 2.5C7 2.22386 6.77614 2 6.5 2H3ZM12.8536 2.14645C12.9015 2.19439 12.9377 2.24964 12.9621 2.30861C12.9861 2.36669 12.9996 2.4303 13 2.497L13 2.5V2.50049V5.5C13 5.77614 12.7761 6 12.5 6C12.2239 6 12 5.77614 12 5.5V3.70711L6.85355 8.85355C6.65829 9.04882 6.34171 9.04882 6.14645 8.85355C5.95118 8.65829 5.95118 8.34171 6.14645 8.14645L11.2929 3H9.5C9.22386 3 9 2.77614 9 2.5C9 2.22386 9.22386 2 9.5 2H12.4999H12.5C12.5678 2 12.6324 2.01349 12.6914 2.03794C12.7504 2.06234 12.8056 2.09851 12.8536 2.14645Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="ml-auto h-4 w-4">
    <path d="M6.1584 3.13508C6.35985 2.94621 6.67627 2.95642 6.86514 3.15788L10.6151 7.15788C10.7954 7.3502 10.7954 7.64949 10.6151 7.84182L6.86514 11.8418C6.67627 12.0433 6.35985 12.0535 6.1584 11.8646C5.95694 11.6757 5.94673 11.3593 6.1356 11.1579L9.565 7.49985L6.1356 3.84182C5.94673 3.64036 5.95694 3.32394 6.1584 3.13508Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
  </svg>
);

const ChatBubbleIcon = () => (
  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" className="mr-2" height="1em" width="1em">
    <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0 1 12 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 0 1-3.476.383.39.39 0 0 0-.297.17l-2.755 4.133a.75.75 0 0 1-1.248 0l-2.755-4.133a.39.39 0 0 0-.297-.17 48.9 48.9 0 0 1-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97Z" clipRule="evenodd" />
  </svg>
);

const ShareIcon = () => (
  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 448 512" className="mr-2" height="1em" width="1em">
    <path d="M352 320c-22.608 0-43.387 7.819-59.79 20.895l-102.486-64.054a96.551 96.551 0 0 0 0-41.683l102.486-64.054C308.613 184.181 329.392 192 352 192c53.019 0 96-42.981 96-96S405.019 0 352 0s-96 42.981-96 96c0 7.158.79 14.13 2.276 20.841L155.79 180.895C139.387 167.819 118.608 160 96 160c-53.019 0-96 42.981-96 96s42.981 96 96 96c22.608 0 43.387-7.819 59.79-20.895l102.486 64.054A96.301 96.301 0 0 0 256 416c0 53.019 42.981 96 96 96s96-42.981 96-96-42.981-96-96-96z" />
  </svg>
);

const BookIcon = () => (
  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 448 512" className="mr-2" height="1em" width="1em">
    <path d="M448 360V24c0-13.3-10.7-24-24-24H96C43 0 0 43 0 96v320c0 53 43 96 96 96h328c13.3 0 24-10.7 24-24v-16c0-7.5-3.5-14.3-8.9-18.7-4.2-15.4-4.2-59.3 0-74.7 5.4-4.3 8.9-11.1 8.9-18.6zM128 134c0-3.3 2.7-6 6-6h212c3.3 0 6 2.7 6 6v20c0 3.3-2.7 6-6 6H134c-3.3 0-6-2.7-6-6v-20zm0 64c0-3.3 2.7-6 6-6h212c3.3 0 6 2.7 6 6v20c0 3.3-2.7 6-6 6H134c-3.3 0-6-2.7-6-6v-20zm253.4 250H96c-17.7 0-32-14.3-32-32 0-17.6 14.4-32 32-32h285.4c-1.9 17.1-1.9 46.9 0 64z" />
  </svg>
);

const DotsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-2" style={{ fontSize: 22 }}>
    <path d="M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM12.5 8.625C13.1213 8.625 13.625 8.12132 13.625 7.5C13.625 6.87868 13.1213 6.375 12.5 6.375C11.8787 6.375 11.375 6.87868 11.375 7.5C11.375 8.12132 11.8787 8.625 12.5 8.625Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
  </svg>
);

const LogoutIcon = () => (
  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" className="mr-2" height="1em" width="1em" style={{ fontSize: 22 }}>
    <path fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="32" d="M304 336v40a40 40 0 0 1-40 40H104a40 40 0 0 1-40-40V136a40 40 0 0 1 40-40h152c22.09 0 48 17.91 48 40v40m64 160 80-80-80-80m-192 80h256" />
  </svg>
);

const DiscordIcon = () => (
  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 640 512" className="mr-2" height="1em" width="1em">
    <path d="M524.531,69.836a1.5,1.5,0,0,0-.764-.7A485.065,485.065,0,0,0,404.081,32.03a1.816,1.816,0,0,0-1.923.91,337.461,337.461,0,0,0-14.9,30.6,447.848,447.848,0,0,0-134.426,0,309.541,309.541,0,0,0-15.135-30.6,1.89,1.89,0,0,0-1.924-.91A483.689,483.689,0,0,0,116.085,69.137a1.712,1.712,0,0,0-.788.676C39.068,183.651,18.186,294.69,28.43,404.354a2.016,2.016,0,0,0,.765,1.375A487.666,487.666,0,0,0,176.02,479.918a1.9,1.9,0,0,0,2.063-.676A348.2,348.2,0,0,0,208.12,430.4a1.86,1.86,0,0,0-1.019-2.588,321.173,321.173,0,0,1-45.868-21.853,1.885,1.885,0,0,1-.185-3.126c3.082-2.309,6.166-4.711,9.109-7.137a1.819,1.819,0,0,1,1.9-.256c96.229,43.917,200.41,43.917,295.5,0a1.812,1.812,0,0,1,1.924.233c2.944,2.426,6.027,4.851,9.132,7.16a1.884,1.884,0,0,1-.162,3.126,301.407,301.407,0,0,1-45.89,21.83,1.875,1.875,0,0,0-1,2.611,391.055,391.055,0,0,0,30.014,48.815,1.864,1.864,0,0,0,2.063.7A486.048,486.048,0,0,0,610.7,405.729a1.882,1.882,0,0,0,.765-1.352C623.729,277.594,590.933,167.465,524.531,69.836ZM222.491,337.58c-28.972,0-52.844-26.587-52.844-59.239S193.056,219.1,222.491,219.1c29.665,0,53.306,26.82,52.843,59.239C275.334,310.993,251.924,337.58,222.491,337.58Zm195.38,0c-28.971,0-52.843-26.587-52.843-59.239S388.437,219.1,417.871,219.1c29.667,0,53.307,26.82,52.844,59.239C470.715,310.993,447.538,337.58,417.871,337.58Z" />
  </svg>
);

const InstagramIcon = () => (
  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 448 512" className="mr-2" height="1em" width="1em">
    <path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z" />
  </svg>
);

const TwitterIcon = () => (
  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" className="mr-2" height="1em" width="1em">
    <path d="M459.37 151.716c.325 4.548.325 9.097.325 13.645 0 138.72-105.583 298.558-298.558 298.558-59.452 0-114.68-17.219-161.137-47.106 8.447.974 16.568 1.299 25.34 1.299 49.055 0 94.213-16.568 130.274-44.832-46.132-.975-84.792-31.188-98.112-72.772 6.498.974 12.995 1.624 19.818 1.624 9.421 0 18.843-1.3 27.614-3.573-48.081-9.747-84.143-51.98-84.143-102.985v-1.299c13.969 7.797 30.214 12.67 47.431 13.319-28.264-18.843-46.781-51.005-46.781-87.391 0-19.492 5.197-37.36 14.294-52.954 51.655 63.675 129.3 105.258 216.365 109.807-1.624-7.797-2.599-15.918-2.599-24.04 0-57.828 46.782-104.934 104.934-104.934 30.213 0 57.502 12.67 76.67 33.137 23.715-4.548 46.456-13.32 66.599-25.34-7.798 24.366-24.366 44.833-46.132 57.827 21.117-2.273 41.584-8.122 60.426-16.243-14.292 20.791-32.161 39.308-52.628 54.253z" />
  </svg>
);

const TikTokIcon = () => (
  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 448 512" className="mr-2" height="1em" width="1em">
    <path d="M448,209.91a210.06,210.06,0,0,1-122.77-39.25V349.38A162.55,162.55,0,1,1,185,188.31V278.2a74.62,74.62,0,1,0,52.23,71.18V0l88,0a121.18,121.18,0,0,0,1.86,22.17h0A122.18,122.18,0,0,0,381,102.39a121.43,121.43,0,0,0,67,20.14Z" />
  </svg>
);

/* Male emoji SVG from reference */
const MaleGenderIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 48 48" aria-label="Male" role="img" className="size-5">
    <path fill="#9b9b9b" d="M9 45.5a15 1.5 0 1 0 30 0a15 1.5 0 1 0-30 0" opacity="0.15" />
    <path fill="#ffcebf" stroke="#45413c" strokeLinecap="round" strokeLinejoin="round" d="M10.75 12.3a11.76 11.76 0 0 1 7.78-3.78A1.39 1.39 0 0 1 20 10a1.37 1.37 0 0 1-.49 1l-4.7 3.93Zm26.5 0a11.76 11.76 0 0 0-7.78-3.78A1.39 1.39 0 0 0 28 10a1.37 1.37 0 0 0 .49 1l4.7 3.93Z" />
    <path fill="#00b8f0" d="M38.31 12.84a1 1 0 0 0-1.39-.32l-4.71 2.39s2.29 3.23 1.67 10.16c-.38 4.21-1 7.36-2.31 9.23a3 3 0 0 1-3.48 1.14a12 12 0 0 0-8.18 0a3 3 0 0 1-3.48-1.14c-1.29-1.87-1.93-5-2.31-9.23c-.62-6.93 1.67-10.16 1.67-10.16l-4.71-2.39a1 1 0 0 0-1.39.32c-1.19 2-3.79 6.35-3.3 15.51C7 40.57 13.37 45 13.37 45h21.26s6.34-4.43 7-16.65c.47-9.16-2.13-13.55-3.32-15.51" />
    <path fill="none" stroke="#45413c" strokeLinecap="round" strokeLinejoin="round" d="M38.31 12.84a1 1 0 0 0-1.39-.32l-4.71 2.39s2.29 3.23 1.67 10.16c-.38 4.21-1 7.36-2.31 9.23a3 3 0 0 1-3.48 1.14a12 12 0 0 0-8.18 0a3 3 0 0 1-3.48-1.14c-1.29-1.87-1.93-5-2.31-9.23c-.62-6.93 1.67-10.16 1.67-10.16l-4.71-2.39a1 1 0 0 0-1.39.32c-1.19 2-3.79 6.35-3.3 15.51C7 40.57 13.37 45 13.37 45h21.26s6.34-4.43 7-16.65c.47-9.16-2.13-13.55-3.32-15.51" />
    <circle cx="24" cy="24" r="8" fill="#ffcebf" stroke="#45413c" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="21" cy="24" r="1" fill="#45413c" />
    <circle cx="27" cy="24" r="1" fill="#45413c" />
    <path fill="#ff6242" d="M22 27.5a2.5 2.5 0 0 0 4 0Z" />
  </svg>
);

/* ─── Separator ─── */
const MenuSeparator = () => (
  <div role="separator" className="-mx-1 my-1 h-px" style={{ backgroundColor: "hsl(260, 6%, 15%)" }} />
);

/* ─── Menu Item ─── */
function MenuItem({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div
      role="menuitem"
      onClick={onClick}
      className={`relative my-1.5 cursor-pointer flex select-none items-center rounded-sm px-2 py-1.5 text-sm outline-hidden transition-colors hover:bg-[hsl(265,8%,25%)] ${className}`}
      style={{ color: "hsl(264, 3.9%, 96.95%)" }}
      tabIndex={-1}
    >
      {children}
    </div>
  );
}

/* ─── Badge for shortcuts / external link ─── */
function MenuBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="ml-auto text-xs tracking-widest flex flex-row gap-1"
      style={{ color: "hsl(240, 5%, 65%)" }}
    >
      {children}
    </span>
  );
}

/* ─── Socials sub-menu ─── */
function SocialsSubMenu({ show }: { show: boolean }) {
  if (!show) return null;

  const socials = [
    { label: "Discord", Icon: DiscordIcon },
    { label: "Instagram", Icon: InstagramIcon },
    { label: "Twitter", Icon: TwitterIcon },
    { label: "TikTok", Icon: TikTokIcon },
  ];

  return (
    <div
      className="absolute left-full top-0 ml-1 z-50 min-w-32 overflow-hidden rounded-md p-1 shadow-lg"
      style={{
        backgroundColor: "hsl(250, 6%, 15%)",
        color: "hsl(264, 3.9%, 96.95%)",
      }}
    >
      {socials.map((s) => (
        <MenuItem key={s.label}>
          <s.Icon />
          {s.label}
          <MenuBadge>
            <ExternalLinkIcon />
          </MenuBadge>
        </MenuItem>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Main User Menu component
   ═══════════════════════════════════════════ */

interface UserMenuProps {
  open: boolean;
  onClose: () => void;
  onMore?: () => void;
}

export function UserMenu({ open, onClose, onMore }: UserMenuProps) {
  const [socialsOpen, setSocialsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setSocialsOpen(false);
      return;
    }
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      className="z-50 min-w-48 overflow-hidden shadow-md mr-3 rounded-2xl p-2.5"
      style={{
        fontFamily: "'DM Sans', sans-serif",
        backgroundColor: "hsl(252, 6%, 10%)",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "hsl(250, 6%, 15%)",
        color: "hsl(264, 3.9%, 96.95%)",
        position: "absolute",
        top: "100%",
        right: 0,
        marginTop: 4,
      }}
    >
      {/* ─── You ─── */}
      <MenuItem className="font-semibold">
        <img
          alt="avatar"
          loading="lazy"
          className="size-8 rounded-full mr-2"
          src="https://proxy.extractcss.dev/https://video.chitchat.gg/images/avatar-placeholder.svg"
        />
        You
        <MenuBadge>
          <img
            data-testid="circle-country-flag"
            className="size-5"
            title="bd"
            height="100"
            width="100"
            src="https://react-circle-flags.pages.dev/bd.svg"
          />
          <MaleGenderIcon />
        </MenuBadge>
      </MenuItem>

      <MenuSeparator />

      {/* ─── Text Chat ─── */}
      <MenuItem>
        <ChatBubbleIcon />
        Text Chat
        <MenuBadge>
          <ExternalLinkIcon />
        </MenuBadge>
      </MenuItem>

      <MenuSeparator />

      {/* ─── Socials (with sub-menu) ─── */}
      <div className="relative">
        <MenuItem
          onClick={() => setSocialsOpen(!socialsOpen)}
        >
          <ShareIcon />
          Socials
          <ChevronRightIcon />
        </MenuItem>
        <SocialsSubMenu show={socialsOpen} />
      </div>

      <MenuSeparator />

      {/* ─── Rules ─── */}
      <MenuItem>
        <BookIcon />
        Rules
      </MenuItem>

      <MenuSeparator />

      {/* ─── More ─── */}
      <MenuItem onClick={() => { onClose(); onMore?.(); }}>
        <DotsIcon />
        More
      </MenuItem>

      <MenuSeparator />

      {/* ─── Logout ─── */}
      <MenuItem>
        <LogoutIcon />
        Logout
      </MenuItem>
    </div>
  );
}
