import { useState, useRef, useEffect } from "react";
import buzzuLogo from "figma:asset/buzzu.svg";



function MaleIcon() {
  return (
    <svg
      stroke="currentColor"
      fill="currentColor"
      strokeWidth="0"
      viewBox="0 0 192 512"
      className="w-5 h-5 text-sky-300"
      height="1em"
      width="1em"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M96 0c35.346 0 64 28.654 64 64s-28.654 64-64 64-64-28.654-64-64S60.654 0 96 0m48 144h-11.36c-22.711 10.443-49.59 10.894-73.28 0H48c-26.51 0-48 21.49-48 48v136c0 13.255 10.745 24 24 24h16v136c0 13.255 10.745 24 24 24h64c13.255 0 24-10.745 24-24V352h16c13.255 0 24-10.745 24-24V192c0-26.51-21.49-48-48-48z" />
    </svg>
  );
}

function FemaleIcon() {
  return (
    <svg
      stroke="currentColor"
      fill="currentColor"
      strokeWidth="0"
      viewBox="0 0 256 512"
      className="w-5 h-5 text-rose-300"
      height="1em"
      width="1em"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M128 0c35.346 0 64 28.654 64 64s-28.654 64-64 64c-35.346 0-64-28.654-64-64S92.654 0 128 0m119.283 354.179l-48-192A24 24 0 0 0 176 144h-11.36c-22.711 10.443-49.59 10.894-73.28 0H80a24 24 0 0 0-23.283 18.179l-48 192C4.935 369.305 16.383 384 32 384h56v104c0 13.255 10.745 24 24 24h32c13.255 0 24-10.745 24-24V384h56c15.591 0 27.071-14.671 23.283-29.821z" />
    </svg>
  );
}

interface EditProfileModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  isBracuUser: boolean;
  onToggleBracu: (val: boolean) => void;
}

export function EditProfileModal({ open, onClose, onComplete, isBracuUser, onToggleBracu }: EditProfileModalProps) {
  const [gender, setGender] = useState<"m" | "f" | null>(null);

  if (!open) return null;



  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        role="dialog"
        className="fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border-none bg-[hsl(var(--cc-card))] p-6 shadow-2xl rounded-xl outline-hidden select-text max-sm:max-h-[85dvh] max-sm:overflow-y-auto"
        style={{ pointerEvents: "auto" }}
      >
        {/* Visually hidden header */}
        <span className="sr-only">
          <h2>Edit profile</h2>
          <p>Edit your profile to continue</p>
        </span>

        <div className="flex flex-col gap-4 items-center justify-center">
          {/* Logo */}
          <img
            loading="lazy"
            className="h-10 md:h-12 w-auto"
            alt="BuzzU Logo"
            aria-label="BuzzU Logo"
            src={buzzuLogo}
          />

          <p className="text-center text-base text-[hsl(var(--cc-foreground))]">
            One last step to get started...
          </p>

          <form className="flex flex-col gap-5 w-full mt-2" onSubmit={handleSubmit}>

            {/* Gender */}
            <label className="flex flex-col gap-1 mt-3 w-full">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xl font-semibold text-[hsl(var(--cc-foreground))]">
                  I am:
                </span>

                {/* G-Suite Verification Simulation */}
                <button
                  type="button"
                  onClick={() => onToggleBracu(!isBracuUser)}
                  className={`text-[10px] uppercase tracking-tighter font-bold px-2 py-1 rounded border transition-colors ${isBracuUser
                    ? "bg-green-500/20 text-green-400 border-green-500/30"
                    : "bg-[hsl(var(--cc-muted))]/30 text-[hsl(var(--cc-muted-foreground))] border-[hsl(var(--cc-muted))]/50 hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/30"
                    }`}
                >
                  {isBracuUser ? "✓ G-Suite Verified" : "Verify G-Suite"}
                </button>
              </div>
              <div className="gap-3 flex-row flex justify-start w-full">
                {/* Male */}
                <div className="flex-1 flex items-center">
                  <div
                    className={`w-full px-4 sm:px-6 py-3.5 bg-[hsl(var(--cc-panel))] space-x-2 rounded-lg inline-flex items-center justify-center cursor-pointer border ${gender === "m"
                      ? "border-[hsl(var(--cc-primary,255_42%_50%))]"
                      : "border-transparent"
                      }`}
                    onClick={() => setGender("m")}
                  >
                    <div
                      className={`aspect-square h-4 w-4 rounded-full border border-[hsl(var(--cc-primary,255_42%_50%))] flex items-center justify-center`}
                    >
                      {gender === "m" && (
                        <div className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--cc-primary,255_42%_50%))]" />
                      )}
                    </div>
                    <span className="text-sm font-semibold flex items-center gap-1">
                      <MaleIcon />
                      Male
                    </span>
                  </div>
                </div>

                {/* Female */}
                <div className="flex-1 flex items-center">
                  <div
                    className={`w-full px-4 sm:px-6 py-3.5 bg-[hsl(var(--cc-panel))] space-x-2 rounded-lg inline-flex items-center justify-center cursor-pointer border ${gender === "f"
                      ? "border-[hsl(var(--cc-primary,255_42%_50%))]"
                      : "border-transparent"
                      }`}
                    onClick={() => setGender("f")}
                  >
                    <div
                      className={`aspect-square h-4 w-4 rounded-full border border-[hsl(var(--cc-primary,255_42%_50%))] flex items-center justify-center`}
                    >
                      {gender === "f" && (
                        <div className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--cc-primary,255_42%_50%))]" />
                      )}
                    </div>
                    <span className="text-sm font-semibold flex items-center gap-1">
                      <FemaleIcon />
                      Female
                    </span>
                  </div>
                </div>
              </div>
            </label>
            <div className="flex flex-col items-center justify-center gap-2 mt-4 px-2">
              <p className="text-xs text-[hsl(var(--cc-muted-foreground,240_5%_65%))] text-center max-w-sm">
                This information helps us balance matching.{" "}
                <span className="font-bold">It cannot be changed later!</span>
              </p>

              <button
                type="submit"
                disabled={!gender}
                className="w-full h-12 mt-2 bg-[hsl(var(--cc-primary,255_42%_50%))] text-white rounded-lg font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Complete
              </button>
            </div>
          </form>
        </div>
      </div >
    </>
  );
}
