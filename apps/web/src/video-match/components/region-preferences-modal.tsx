import { useState } from "react";

function CoinIcon() {
  return (
    <svg
      stroke="currentColor"
      fill="currentColor"
      strokeWidth="0"
      viewBox="0 0 512 512"
      className="size-3"
      height="1em"
      width="1em"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M0 405.3V448c0 35.3 86 64 192 64s192-28.7 192-64v-42.7C342.7 434.4 267.2 448 192 448S41.3 434.4 0 405.3zM320 128c106 0 192-28.7 192-64S426 0 320 0 128 28.7 128 64s86 64 192 64zM0 300.4V352c0 35.3 86 64 192 64s192-28.7 192-64v-51.6c-41.3 34-116.9 51.6-192 51.6S41.3 334.4 0 300.4zm416 11c57.3-11.1 96-31.7 96-55.4v-42.7c-23.2 16.4-57.3 27.6-96 34.5v63.6zM192 160C86 160 0 195.8 0 240s86 80 192 80 192-35.8 192-80-86-80-192-80zm219.3 56.3c60-10.8 100.7-32 100.7-56.3v-42.7c-35.5 25.1-96.5 38.6-160.7 41.8 29.5 14.3 51.2 33.5 60 57.2z" />
    </svg>
  );
}

interface Institution {
  id: string;
  emoji: string;
  name: string;
  subtitle?: string;
  locked?: boolean;
}

const INSTITUTIONS: Institution[] = [
  { id: "all", emoji: "\uD83C\uDF10", name: "Anonymous", subtitle: "Default matching with anyone", locked: false },
  { id: "bracu", emoji: "\uD83C\uDF93", name: "Bracu University", subtitle: "Only match with BRACU (G-Suite users)", locked: true },
  { id: "non_bracu", emoji: "\uD83C\uDFDB\uFE0F", name: "Non-Bracu", subtitle: "Match with other Universities", locked: false },
];

interface RegionPreferencesModalProps {
  open: boolean;
  onClose: () => void;
  isBracuUser: boolean;
  selected: string;
  onSelect: (id: string) => void;
}

export function RegionPreferencesModal({ open, onClose, isBracuUser, selected, onSelect }: RegionPreferencesModalProps) {


  if (!open) return null;

  const handleSave = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 grid w-full max-w-[425px] gap-4 border-none bg-[hsl(var(--cc-card))] px-6 py-4 rounded-xl select-text max-sm:bottom-0 max-sm:top-auto max-sm:translate-y-0 max-sm:rounded-b-none max-sm:max-h-[85dvh] max-sm:overflow-y-auto"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        {/* Header */}
        <div className="flex flex-col space-y-1.5 text-left">
          <h2 className="text-lg font-semibold leading-none tracking-tight text-[hsl(var(--cc-foreground))]">
            Matching Preferences
          </h2>
          <p className="text-xs text-[hsl(var(--cc-muted-foreground))]">
            Choose your university or stay anonymous. Bracu University matching requires G-Suite login.
          </p>
        </div>

        {/* Institution list */}
        <div
          className="max-h-[40vh] overflow-y-auto pr-2"
          style={{ scrollbarWidth: "thin" }}
        >
          <div role="radiogroup" className="grid gap-2">
            {INSTITUTIONS.map((inst) => {
              const isSelected = selected === inst.id;
              const isBracuLocked = inst.id === "bracu" && !isBracuUser;

              return (
                <div key={inst.id}>
                  <label
                    htmlFor={inst.id}
                    className={`flex items-center relative cursor-pointer rounded-lg border-2 p-3 transition-all duration-200 ease-in-out ${isBracuLocked ? "opacity-60 grayscale cursor-not-allowed border-[hsl(var(--cc-muted))]" :
                        isSelected
                          ? "border-[hsl(var(--cc-primary))] bg-[hsl(var(--cc-popover))]"
                          : "border-[hsl(var(--cc-muted))] bg-[hsl(var(--cc-popover))] hover:bg-[hsl(var(--cc-accent))]/50"
                      }`}
                    onClick={() => {
                      if (!isBracuLocked) onSelect(inst.id);
                    }}
                  >
                    <input
                      type="radio"
                      name="institution"
                      id={inst.id}
                      value={inst.id}
                      checked={isSelected}
                      disabled={isBracuLocked}
                      onChange={() => {
                        if (!isBracuLocked) onSelect(inst.id);
                      }}
                      className="sr-only"
                    />
                    <div className="flex flex-col">
                      <div className="font-medium text-sm text-[hsl(var(--cc-foreground))]">
                        <span className="mr-2">{inst.emoji}</span>
                        {inst.name}
                      </div>
                      <div className="text-xs text-[hsl(var(--cc-muted-foreground))]">
                        {inst.subtitle}
                      </div>
                    </div>

                    {/* Lock/Status badge */}
                    <div className="absolute right-3 flex items-center justify-center">
                      {isBracuLocked ? (
                        <div className="text-[10px] font-bold px-2 py-0.5 rounded-3xl bg-red-500/20 text-red-400 border border-red-500/30">
                          G-SUITE REQUIRED
                        </div>
                      ) : (
                        isSelected && (
                          <div className="size-2 rounded-full bg-[hsl(var(--cc-primary))] shadow-[0_0_8px_hsl(var(--cc-primary))]" />
                        )
                      )}
                    </div>
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end flex-col gap-2 mt-2">
          <button
            onClick={handleSave}
            className="inline-flex cursor-pointer items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-[hsl(var(--cc-primary))] text-[hsl(var(--cc-primary-foreground))] hover:bg-[hsl(var(--cc-primary))]/90 h-10 px-4 py-2 w-full rounded-xl"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="inline-flex cursor-pointer items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-[hsl(var(--cc-accent))] text-[hsl(var(--cc-foreground))] h-10 px-4 py-2 w-full rounded-xl"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
