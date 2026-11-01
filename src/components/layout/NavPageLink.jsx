import { Link } from "react-router-dom";
import { Columns } from "lucide-react";
import { hexToRgbTuple } from "@/components/layout/navPreferences";
import { useWorkspacePreferences } from "@/components/layout/WorkspacePreferencesProvider";

const abbreviate = (title) => (title.length > 12 ? `${title.slice(0, 11)}…` : title);

// One draggable page button, used by both the top bar and the vertical sidebar.
// Personal-workspace prefs (labels/tooltips/size/density) are render modifiers
// only — the drag contract (draggableId, refs, props) is untouched.
export default function NavPageLink({
  item,
  variant = "top",
  compactView = false,
  isActive = false,
  isInSplit = false,
  onNavigate,
  dragRef,
  dragProps,
  dragHandleProps,
}) {
  const { prefs } = useWorkspacePreferences();
  const navPrefs = prefs.navigation || {};
  const labelMode = navPrefs.labels || "full";
  const tooltips = navPrefs.tooltips !== false;
  const sizeMode = navPrefs.size || "auto";

  const Icon = item.icon;
  const isTop = variant === "top";
  // Icon-only applies to the horizontal taskbar; the sidebar always keeps labels.
  const iconOnly = isTop && labelMode === "icons";
  const displayTitle = labelMode === "abbreviated" ? abbreviate(item.title) : item.title;

  // Drop the library's role="button" override so these stay real links.
  const { role: _dragRole, ...handleProps } = dragHandleProps || {};

  const sizing = isTop
    ? sizeMode === "compact"
      ? "gap-1 rounded-lg px-1 py-0.5"
      : sizeMode === "roomy"
        ? "gap-2 rounded-lg px-2.5 py-2"
        : compactView
          ? "gap-1 rounded-lg px-1 py-0.5"
          : "gap-1.5 rounded-lg px-2 py-1.5"
    : compactView
      ? "gap-1.5 rounded-lg px-1.5 py-1"
      : "gap-2 rounded-xl px-3 py-2";

  const tooltip = tooltips || iconOnly
    ? `${iconOnly ? `${item.title} · ` : ""}Drag to reorder · Ctrl+Click to open in split view`
    : undefined;

  return (
    <Link
      ref={dragRef}
      {...dragProps}
      {...handleProps}
      to={item.url}
      onClick={onNavigate}
      className={`ccs-glass-nav-item flex items-center border ${
        isTop
          ? `flex-shrink-0 whitespace-nowrap ${sizing}`
          : `w-full ${sizing}`
      } ${isActive ? "font-bold" : isInSplit ? "ring-1 ring-violet-300/50" : ""}`}
      style={{ ...(dragProps?.style || {}), "--glass-accent-rgb": hexToRgbTuple(item.accent) }}
      title={tooltip}
    >
      <Icon
        className={`${isTop ? (compactView || sizeMode === "compact" ? "h-3 w-3" : "h-3.5 w-3.5") : (compactView ? "h-3 w-3" : "h-4 w-4")} flex-shrink-0`}
        style={{ color: item.accent, filter: isActive ? `drop-shadow(0 0 6px ${item.accent})` : undefined }}
      />
      {!iconOnly && (
        <span
          className={`${
            isTop
              ? `${compactView ? "text-[10px]" : "text-xs"} whitespace-nowrap`
              : `${compactView ? "text-[11px]" : "text-sm"} min-w-0 truncate`
          } font-medium text-slate-100 ${isActive ? "font-bold text-white" : ""}`}
        >
          {displayTitle}
        </span>
      )}
      {isInSplit && <Columns className={`${isTop ? "h-3 w-3" : "h-3 w-3"} flex-shrink-0 text-purple-500`} />}
    </Link>
  );
}
