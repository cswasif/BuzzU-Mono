import { useState, useMemo } from "react";
import reportFrameImg from "figma:asset/444af2ff5d8f19a20c983ad24e5b4f60fba1588b.png";

interface ReportReason {
  id: string;
  emoji: string;
  label: string;
}

export const REPORT_REASONS: ReportReason[] = [
  { id: "1", emoji: "\uD83D\uDD1E", label: "Nudity" },
  { id: "4", emoji: "\uD83E\uDD2C", label: "Inappropriate Language" },
  { id: "3", emoji: "\uD83E\uDDD2", label: "Underage" },
  { id: "7", emoji: "\uD83C\uDFAD", label: "Fake Stream" },
  { id: "2", emoji: "\u26A0\uFE0F", label: "Violence" },
  { id: "10", emoji: "\uD83D\uDEAB", label: "Scam" },
  { id: "8", emoji: "\uD83D\uDE20", label: "Harassment" },
  { id: "0", emoji: "\u2753", label: "Other" },
];

interface ReportUserModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit?: (reasonId: string) => void;
}

function generateId() {
  const chars = "0123456789abcdef";
  const seg = (len: number) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * 16)]).join("");
  return `${seg(8)}-${seg(4)}-${seg(4)}-${seg(4)}-${seg(12)}`;
}

export function ReportUserModal({ open, onClose, onSubmit }: ReportUserModalProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [blurImage, setBlurImage] = useState(true);
  const reportId = useMemo(() => generateId(), [open]);

  if (!open) return null;

  const handleSubmit = () => {
    if (selected && onSubmit) {
      onSubmit(selected);
    }
    setSelected(null);
    onClose();
  };

  const handleCancel = () => {
    setSelected(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60" onClick={handleCancel} />

      {/* Dialog */}
      <div
        className="fixed left-1/2 sm:top-1/2 max-sm:bottom-0 z-50 grid w-full -translate-x-1/2 gap-4 border-2 border-white p-6 duration-200 sm:max-w-lg sm:-translate-y-1/2 sm:rounded-xl md:w-full select-text max-sm:max-h-[85dvh] max-sm:overflow-y-auto"
        style={{
          fontFamily: "'DM Sans', sans-serif",
          backgroundColor: "hsl(240 7% 8%)",
          boxShadow: "4px 4px 0px 0px rgba(255, 255, 255, 0.15)",
          pointerEvents: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h2 className="text-lg font-semibold leading-none tracking-tight text-white">
            <span className="font-bold">🚨 REPORT USER</span>
          </h2>
          <p
            className="text-sm"
            style={{ color: "hsl(240 5% 65%)" }}
          >
            Select the option that best describes your report
          </p>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {/* Radio group chips */}
          <div role="radiogroup" className="flex flex-wrap gap-1.5 w-full" style={{ outline: "none" }}>
            {REPORT_REASONS.map((reason) => {
              const isSelected = selected === reason.id;
              return (
                <div
                  key={reason.id}
                  onClick={() => setSelected(reason.id)}
                  className="relative flex items-center px-2.5 py-1.5 rounded-md cursor-pointer border transition-colors text-sm"
                  style={{
                    backgroundColor: isSelected
                      ? "hsla(255, 42%, 50%, 0.2)"
                      : "hsla(244, 10%, 20%, 0.5)",
                    borderColor: isSelected
                      ? "hsl(255, 42%, 50%)"
                      : "hsla(244, 10%, 20%, 0.1)",
                    color: isSelected ? "#fff" : "rgba(255,255,255,0.8)",
                  }}
                >
                  <label className="text-sm font-medium leading-none flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                    <span className="text-base">{reason.emoji}</span>
                    <span className="font-medium">{reason.label}</span>
                  </label>
                </div>
              );
            })}
          </div>

          {/* Image preview with blur toggle */}
          <div
            className="w-full max-w-full p-2.5 rounded-xl text-sm"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
          >
            {/* Frame image */}
            <div className="relative aspect-video w-full max-w-[300px] mx-auto">
              <img
                alt="frame"
                className="absolute inset-0 w-full h-full object-contain"
                src={reportFrameImg}
                style={{ filter: blurImage ? "blur(12px)" : "none" }}
              />
            </div>

            {/* Blur Image toggle row */}
            <div className="flex items-center justify-between mt-3 px-2">
              <span className="font-medium text-white">Blur Image</span>
              <button
                type="button"
                role="switch"
                aria-checked={blurImage}
                onClick={() => setBlurImage(!blurImage)}
                className="peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{
                  backgroundColor: blurImage
                    ? "hsl(255, 42%, 50%)"
                    : "hsl(233, 6%, 20%)",
                }}
              >
                <span
                  className="pointer-events-none block h-5 w-5 rounded-full shadow-lg ring-0 transition-transform"
                  style={{
                    backgroundColor: blurImage ? "hsl(249, 100%, 95%)" : "#fff",
                    transform: blurImage ? "translateX(20px)" : "translateX(0px)",
                  }}
                >
                  {/* X icon when unchecked */}
                  {!blurImage && (
                    <svg
                      stroke="currentColor"
                      fill="currentColor"
                      strokeWidth="3"
                      viewBox="0 0 384 512"
                      className="w-2.5 h-2.5 absolute inset-0 m-auto"
                      style={{ color: "hsl(233, 6%, 20%)" }}
                      height="1em"
                      width="1em"
                    >
                      <path d="M376.6 84.5c11.3-13.6 9.5-33.8-4.1-45.1s-33.8-9.5-45.1 4.1L192 206 56.6 43.5C45.3 29.9 25.1 28.1 11.5 39.4S-3.9 70.9 7.4 84.5L150.3 256 7.4 427.5c-11.3 13.6-9.5 33.8 4.1 45.1s33.8 9.5 45.1-4.1L192 306 327.4 468.5c11.3 13.6 31.5 15.4 45.1 4.1s15.4-31.5 4.1-45.1L233.7 256 376.6 84.5z" />
                    </svg>
                  )}
                  {/* Checkmark icon when checked */}
                  {blurImage && (
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 15 15"
                      fill="none"
                      className="w-4 h-4 absolute inset-0 m-auto"
                      style={{ color: "hsl(255, 42%, 50%)" }}
                    >
                      <path
                        d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z"
                        fill="currentColor"
                        fillRule="evenodd"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Report ID */}
        <span
          className="text-xs"
          style={{ color: "hsla(240, 5%, 65%, 0.5)" }}
        >
          ID: {reportId}
        </span>

        {/* Action button row */}
        <div className="max-md:gap-3 sm:flex-row sm:justify-end sm:space-x-2 flex flex-row w-full justify-between">
          <button
            onClick={handleSubmit}
            disabled={!selected}
            className="inline-flex cursor-pointer disabled:cursor-not-allowed disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 text-white transition-colors"
            style={{
              backgroundColor: "hsl(0, 62.8%, 50%)",
            }}
          >
            {selected ? "Submit Report" : "Please Select a Reason"}
          </button>
        </div>
      </div>
    </div>
  );
}
