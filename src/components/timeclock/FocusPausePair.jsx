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
      className={`ccs-glass-control ccs-focus-pause-glass focus-pause-pair group relative grid items-stretch overflow-hidden ${compact ? "rounded-xl" : "rounded-2xl"} ${fullWidth ? "w-full" : "min-w-[176px]"} ${compact ? "focus-pause-pair--compact" : ""} ${className}`}
    >
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
