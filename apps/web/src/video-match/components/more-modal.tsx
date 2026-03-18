import { useState } from "react";
import { deepCleanAccountData } from "../../utils/accountUtils";

/* ─── SVG Icons ─── */

const EnvelopeIcon = () => (
  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" className="size-6 mr-3" height="1em" width="1em">
    <path d="M1.5 8.67v8.58a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V8.67l-8.928 5.493a3 3 0 0 1-3.144 0L1.5 8.67Z" />
    <path d="M22.5 6.908V6.75a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3v.158l9.714 5.978a1.5 1.5 0 0 0 1.572 0L22.5 6.908Z" />
  </svg>
);

const EnvelopeIconSmall = () => (
  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" className="size-5 mr-3" height="1em" width="1em">
    <path d="M1.5 8.67v8.58a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V8.67l-8.928 5.493a3 3 0 0 1-3.144 0L1.5 8.67Z" />
    <path d="M22.5 6.908V6.75a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3v.158l9.714 5.978a1.5 1.5 0 0 0 1.572 0L22.5 6.908Z" />
  </svg>
);

const RefreshIcon = () => (
  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" className="size-5 mr-3" height="1em" width="1em">
    <path fill="none" strokeLinecap="round" strokeMiterlimit="10" strokeWidth="32" d="m400 148-21.12-24.57A191.43 191.43 0 0 0 240 64C134 64 48 150 48 256s86 192 192 192a192.09 192.09 0 0 0 181.07-128" />
    <path d="M464 97.42V208a16 16 0 0 1-16 16H337.42c-14.26 0-21.4-17.23-11.32-27.31L436.69 86.1C446.77 76 464 83.16 464 97.42z" />
  </svg>
);

const LinkIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-5 mr-3">
    <path d="M8.51194 3.00541C9.18829 2.54594 10.0435 2.53694 10.6788 2.95419C10.8231 3.04893 10.9771 3.1993 11.389 3.61119C11.8009 4.02307 11.9513 4.17714 12.046 4.32141C12.4633 4.95675 12.4543 5.81192 11.9948 6.48827C11.8899 6.64264 11.7276 6.80811 11.3006 7.23511L10.6819 7.85383C10.4867 8.04909 10.4867 8.36567 10.6819 8.56093C10.8772 8.7562 11.1938 8.7562 11.389 8.56093L12.0077 7.94221L12.0507 7.89929C12.4203 7.52976 12.6568 7.2933 12.822 7.0502C13.4972 6.05623 13.5321 4.76252 12.8819 3.77248C12.7233 3.53102 12.4922 3.30001 12.1408 2.94871L12.0961 2.90408L12.0515 2.85942C11.7002 2.508 11.4692 2.27689 11.2277 2.11832C10.2377 1.46813 8.94398 1.50299 7.95001 2.17822C7.70691 2.34336 7.47044 2.57991 7.1009 2.94955L7.058 2.99247L6.43928 3.61119C6.24401 3.80645 6.24401 4.12303 6.43928 4.31829C6.63454 4.51355 6.95112 4.51355 7.14638 4.31829L7.7651 3.69957C8.1921 3.27257 8.35757 3.11027 8.51194 3.00541ZM4.31796 7.14672C4.51322 6.95146 4.51322 6.63487 4.31796 6.43961C4.12269 6.24435 3.80611 6.24435 3.61085 6.43961L2.99213 7.05833L2.94922 7.10124C2.57957 7.47077 2.34303 7.70724 2.17788 7.95035C1.50265 8.94432 1.4678 10.238 2.11799 11.2281C2.27656 11.4695 2.50766 11.7005 2.8591 12.0518L2.90374 12.0965L2.94837 12.1411C3.29967 12.4925 3.53068 12.7237 3.77214 12.8822C4.76219 13.5324 6.05589 13.4976 7.04986 12.8223C7.29296 12.6572 7.52943 12.4206 7.89896 12.051L7.94188 12.0081L8.5606 11.3894C8.75586 11.1941 8.75586 10.8775 8.5606 10.6823C8.36533 10.487 8.04875 10.487 7.85349 10.6823L7.23477 11.301C6.80777 11.728 6.6423 11.8903 6.48794 11.9951C5.81158 12.4546 4.95642 12.4636 4.32107 12.0464C4.17681 11.9516 4.02274 11.8012 3.61085 11.3894C3.19896 10.9775 3.0486 10.8234 2.95385 10.6791C2.53661 10.0438 2.54561 9.18863 3.00507 8.51227C3.10993 8.35791 3.27224 8.19244 3.69924 7.76544L4.31796 7.14672ZM9.62172 6.08558C9.81698 5.89032 9.81698 5.57373 9.62172 5.37847C9.42646 5.18321 9.10988 5.18321 8.91461 5.37847L5.37908 8.91401C5.18382 9.10927 5.18382 9.42585 5.37908 9.62111C5.57434 9.81637 5.89092 9.81637 6.08619 9.62111L9.62172 6.08558Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
  </svg>
);

const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-5 mr-3">
    <path d="M5.5 1C5.22386 1 5 1.22386 5 1.5C5 1.77614 5.22386 2 5.5 2H9.5C9.77614 2 10 1.77614 10 1.5C10 1.22386 9.77614 1 9.5 1H5.5ZM3 3.5C3 3.22386 3.22386 3 3.5 3H5H10H11.5C11.7761 3 12 3.22386 12 3.5C12 3.77614 11.7761 4 11.5 4H11V12C11 12.5523 10.5523 13 10 13H5C4.44772 13 4 12.5523 4 12V4L3.5 4C3.22386 4 3 3.77614 3 3.5ZM5 4H10V12H5V4Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
  </svg>
);

const AnalyticsIcon = () => (
  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 512 512" className="size-5 mr-3" height="1em" width="1em">
    <path d="M456 128a40 40 0 0 0-37.23 54.6l-84.17 84.17a39.86 39.86 0 0 0-29.2 0l-60.17-60.17a40 40 0 1 0-74.46 0L70.6 306.77a40 40 0 1 0 22.63 22.63L193.4 229.23a39.86 39.86 0 0 0 29.2 0l60.17 60.17a40 40 0 1 0 74.46 0l84.17-84.17A40 40 0 1 0 456 128z" />
  </svg>
);

const ChevronRight = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 1024 1024" className="size-4">
    <path fill="currentColor" d="M338.752 104.704a64 64 0 0 0 0 90.496l316.8 316.8l-316.8 316.8a64 64 0 0 0 90.496 90.496l362.048-362.048a64 64 0 0 0 0-90.496L429.248 104.704a64 64 0 0 0-90.496 0" />
  </svg>
);

const CloseXIcon = () => (
  <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" className="h-4 w-4" height="1em" width="1em">
    <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
  </svg>
);

/* ─── Toggle switch matching the reference ─── */
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{
        backgroundColor: checked ? "hsl(255, 42%, 50%)" : "hsl(233, 6%, 20%)",
      }}
    >
      <span
        className="pointer-events-none relative block h-5 w-5 rounded-full shadow-lg ring-0 transition-transform"
        style={{
          backgroundColor: checked ? "hsl(249, 100%, 95%)" : "#fff",
          transform: checked ? "translateX(20px)" : "translateX(0px)",
        }}
      >
        {!checked && (
          <svg stroke="currentColor" fill="currentColor" strokeWidth="3" viewBox="0 0 384 512" className="w-2.5 h-2.5 absolute inset-0 m-auto" style={{ color: "hsl(233, 6%, 20%)" }} height="1em" width="1em">
            <path d="M376.6 84.5c11.3-13.6 9.5-33.8-4.1-45.1s-33.8-9.5-45.1 4.1L192 206 56.6 43.5C45.3 29.9 25.1 28.1 11.5 39.4S-3.9 70.9 7.4 84.5L150.3 256 7.4 427.5c-11.3 13.6-9.5 33.8 4.1 45.1s33.8 9.5 45.1-4.1L192 306 327.4 468.5c11.3 13.6 31.5 15.4 45.1 4.1s15.4-31.5 4.1-45.1L233.7 256 376.6 84.5z" />
          </svg>
        )}
        {checked && (
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="w-4 h-4 absolute inset-0 m-auto" style={{ color: "hsl(255, 42%, 50%)" }}>
            <path d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
          </svg>
        )}
      </span>
    </button>
  );
}

/* ─── Reusable row for link items ─── */
function LinkRow({ icon, label, href, onClick }: { icon: React.ReactNode; label: string; href?: string; onClick?: () => void }) {
  const Tag = href ? "a" : "button";
  const isExternalHref = !!href && /^(https?:)?\/\//.test(href);
  const extraProps = href
    ? isExternalHref
      ? { href, target: "_blank" as const, rel: "noreferrer" }
      : { href }
    : { onClick };

  return (
    <Tag
      {...(extraProps as any)}
      className="cursor-pointer rounded-lg text-sm font-medium ring-offset-background focus-visible:outline-hidden min-h-[52px] w-full flex flex-row items-center justify-between py-3 px-4 transition-colors hover:bg-[hsl(240,6%,15%)] active:bg-[hsl(240,6%,20%)]"
      style={{ color: "hsl(240, 6%, 85%)" }}
    >
      <div className="flex flex-row items-center">
        {icon}
        {label}
      </div>
      <ChevronRight />
    </Tag>
  );
}

/* ═══════════════════════════════════════════
   More Modal
   ═══════════════════════════════════════════ */

interface MoreModalProps {
  open: boolean;
  onClose: () => void;
}

export function MoreModal({ open, onClose }: MoreModalProps) {
  const [autoMatch, setAutoMatch] = useState(true);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />

      {/* Dialog */}
      <div
        className="fixed left-1/2 sm:top-1/2 max-sm:bottom-0 z-50 w-full -translate-x-1/2 gap-4 p-6 duration-200 sm:max-w-lg sm:-translate-y-1/2 sm:rounded-xl md:w-full select-text max-sm:max-h-[85dvh] max-sm:overflow-y-auto md:min-w-[320px] md:h-[450px] flex flex-col max-md:px-3.5 overflow-y-auto max-sm:pb-16"
        style={{
          fontFamily: "'DM Sans', sans-serif",
          backgroundColor: "hsl(240, 7%, 8%)",
          boxShadow: "4px 4px 0px 0px rgba(255, 255, 255, 0.15)",
          pointerEvents: "auto",
          scrollbarWidth: "thin",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden cursor-pointer"
          style={{ color: "hsl(240, 6%, 85%)" }}
        >
          <CloseXIcon />
          <span className="sr-only">Close</span>
        </button>

        {/* Title */}
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h2 className="text-lg font-semibold leading-none tracking-tight text-white">
            More
          </h2>
        </div>

        {/* Account section */}
        <div className="flex flex-col space-y-1">
          <span className="font-semibold text-white">Account</span>

          {/* Email button (disabled) */}
          <button
            disabled
            className="cursor-not-allowed select-none text-sm font-medium disabled:opacity-50 h-10 rounded-2xl flex flex-row items-center justify-start py-6 px-4 my-1.5"
            style={{
              backgroundColor: "hsl(258, 5%, 16%)",
              color: "hsl(244, 10%, 75%)",
            }}
          >
            <EnvelopeIcon />
            <div className="flex flex-col items-start">
              <span className="text-xs" style={{ color: "hsl(240, 6%, 85%)" }}>Email</span>
              <span className="text-sm" style={{ color: "hsl(0, 0%, 50%)" }}>md.wasif.faisal@g.bracu.ac.bd</span>
            </div>
          </button>
        </div>

        {/* Auto match after skip */}
        <div
          className="flex flex-row items-center justify-between text-sm px-4"
          style={{ color: "hsl(240, 6%, 85%)" }}
        >
          <div className="flex flex-row items-center">
            <RefreshIcon />
            Auto match after skip
          </div>
          <ToggleSwitch checked={autoMatch} onChange={setAutoMatch} />
        </div>

        {/* Separator */}
        <div className="shrink-0 h-px w-full my-1" style={{ backgroundColor: "hsl(255, 5%, 20%)" }} />

        {/* Link rows */}
        <LinkRow
          icon={<EnvelopeIconSmall />}
          label="Contact Us"
          href="mailto:video@chitchat.gg"
        />
        <LinkRow
          icon={<LinkIcon />}
          label="Terms of Service"
          href="/terms"
        />
        <LinkRow
          icon={<LinkIcon />}
          label="Privacy Policy"
          href="/privacy"
        />
        <LinkRow
          icon={<LinkIcon />}
          label="Community Guidelines"
          href="/guidelines"
        />
        <LinkRow
          icon={<TrashIcon />}
          label="Delete Account"
          onClick={async () => {
            if (confirm("Are you sure you want to delete your account? This will reset your profile and history.")) {
              await deepCleanAccountData();
            }
          }}
        />
        <LinkRow
          icon={<AnalyticsIcon />}
          label="Turn off Product Analytics"
        />
      </div>
    </div>
  );
}
