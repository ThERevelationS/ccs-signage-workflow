import { Link } from "react-router-dom";
import { ChevronDown, Columns } from "lucide-react";
import { hexToRgbTuple } from "@/components/layout/navPreferences";

// Collapsible sidebar section (Meetings, Reports). Items inside are not part of
// the drag-and-drop page ordering.
export default function SidebarNavGroup({
  label,
  items,
  collapsed,
  onToggle,
  compactView = false,
  activePath,
  isInSplitUrl,
  onNavigate,
}) {
  const hasActive = items.some((item) => item.url === activePath);
  const Chevron = ChevronDown;

  return (
    <div className={`${compactView ? "mt-1 pt-1" : "mt-2 pt-2"} border-t border-gray-200/50 dark:border-white/10`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className={`flex w-full items-center gap-1 rounded-lg text-slate-300 ${compactView ? "px-1.5 py-0.5 text-[10px]" : "px-3 py-1 text-xs"} font-medium`}
      >
        <span className={`uppercase tracking-[0.1em] ${hasActive ? "text-violet-200" : ""}`}>{label}</span>
        <Chevron className={`ml-auto h-3 w-3 transition-transform ${collapsed ? "" : "rotate-180"}`} />
      </button>

      {!collapsed && (
        <div className={compactView ? "mt-0.5 space-y-0.5" : "mt-1 space-y-1"}>
          {items.map((item) => {
            const ItemIcon = item.icon;
            const isActive = activePath === item.url;
            const isInSplit = isInSplitUrl(item);
            return (
              <Link
                key={item.title}
                to={item.url}
                onClick={(event) => onNavigate(event, item)}
                className={`ccs-glass-nav-item flex w-full items-center border ${
                  compactView ? "gap-1.5 rounded-lg px-1.5 py-1" : "gap-2 rounded-xl px-3 py-2"
                } ${isActive ? "font-bold" : isInSplit ? "ring-1 ring-violet-300/50" : ""}`}
                style={{ "--glass-accent-rgb": hexToRgbTuple(item.accent) }}
                title="Ctrl+Click to open in split view"
              >
                <ItemIcon
                  className={`${compactView ? "h-3 w-3" : "h-4 w-4"} flex-shrink-0`}
                  style={{ color: item.accent, filter: isActive ? `drop-shadow(0 0 6px ${item.accent})` : undefined }}
                />
                <span className={`${compactView ? "text-[11px]" : "text-sm"} min-w-0 truncate font-medium text-slate-100 ${isActive ? "font-bold text-white" : ""}`}>
                  {item.title}
                </span>
                {isInSplit && <Columns className="h-3 w-3 flex-shrink-0 text-purple-500" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}