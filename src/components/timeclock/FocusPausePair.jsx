import GlobalFocusTimer from "@/components/timeclock/GlobalFocusTimer";
import GlobalWorkPauseControl from "@/components/timeclock/GlobalWorkPauseControl";

export default function FocusPausePair({
  currentUser,
  fullWidth = false,
  compact = false,
  className = "",
} = {}) {
  if (!currentUser) return null;

  return (
    <div
      data-focus-pause-pair
      className={`ccs-glass-control ccs-focus-pause-glass focus-pause-pair group relative flex items-stretch overflow-hidden ${compact ? "rounded-xl" : "rounded-2xl"} ${fullWidth ? "w-full" : ""} ${compact ? "focus-pause-pair--compact" : ""} ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "linear-gradient(112deg, rgba(255,255,255,0.14), transparent 28%, transparent 70%, rgba(255,255,255,0.05))",
        }}
      />
      <GlobalFocusTimer
        key={currentUser?.id || currentUser?.email || "signed-out"}
        currentUser={currentUser}
        paired
        compact={compact}
        fullWidth={fullWidth}
      />
      <GlobalWorkPauseControl paired compact={compact} fullWidth={fullWidth} />
    </div>
  );
}
