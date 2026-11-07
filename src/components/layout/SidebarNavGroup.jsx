import { Link } from "react-router-dom";
import { ChevronDown, Columns } from "lucide-react";
import { hexToRgbTuple } from "@/components/layout/navPreferences";
import { navButtonStyle } from "@/components/layout/navCustomization";

// Collapsible sidebar section backed by a user folder. The group header is a
// Draggable row inside page-nav-side (drop-combine onto it adds a page to the
// folder); items render with the folder's styling and support the right-click
// edit menu. Within-sidebar folder drags are intentionally done from the top
// bar — nested droppables aren't supported by the dnd library.
export default function SidebarNavGroup({
  label,
  items,
  collapsed,
  onToggle,
  compactView = false,
  activePath,
  isInSplitUrl,
  onNavigate,
  accent = "#8B5CF6",
  stylePreset = "glass",
  onContextMenuGroup,
  onContextMenuItem,
}) {
  const hasActive = items.some((item) => item.url === activePath);
  const Chevron = ChevronDown;
  const look = navButtonStyle(stylePreset, accent);

  return (
    <div className={`${compactView ? "mt-1 pt-1" : "mt-2 pt-2"} border-t border-gray-200/50 dark:border-white/10`}>
      <button
        type="button"
        onClick={onToggle}
        onContextMenu={(event) => {
          if (!onContextMenuGroup) return;
          event.preventDefault();
          event.stopPropagation();
          onContextMenuGroup({ x: event.clientX, y: event.clientY });
        }}
        aria-expanded={!collapsed}
        className={`flex w-full items-center gap-1 rounded-lg ${compactView ? "px-1.5 py-0.5 text-[10px]" : "px-3 py-1 text-xs"} font-medium`}
        style={{ color: look.textColor || undefined }}
        title="Right-click to edit folder · Drag a page onto me to add it"
      >
        <span className={`uppercase tracking-[0.1em] ${hasActive ? "text-violet-200" : "text-slate-300"}`} style={{ color: look.textColor || undefined }}>
          {label}
        </span>
        <Chevron className={`ml-auto h-3 w-3 transition-transform ${collapsed ? "" : "rotate-180"}`} style={{ color: look.textColor || "#94a3b8" }} />
      </button>

      {!collapsed && (
        <div className={compactView ? "mt-0.5 space-y-0.5" : "mt-1 space-y-1"}>
          {items.map((item) => {
            const ItemIcon = item.icon;
            const isActive = activePath === item.url;
            const isInSplit = isInSplitUrl(item);
            const itemLook = navButtonStyle(item.stylePreset || "glass", item.accent);
            const itemText = itemLook.textColor || (isActive ? "#fff" : "#f1f5f9");
            return (
              <Link
                key={item.title}
                to={item.url}
                onClick={(event) => onNavigate(event, item)}
                onContextMenu={(event) => {
                  if (!onContextMenuItem) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onContextMenuItem(item, { x: event.clientX, y: event.clientY });
                }}
                className={`${itemLook.glass ? "ccs-glass-nav-item" : "ccs-nav-styled"} flex w-full items-center border ${
                  compactView ? "gap-1.5 rounded-lg px-1.5 py-1" : "gap-2 rounded-xl px-3 py-2"
                } ${isActive ? "font-bold" : isInSplit ? "ring-1 ring-violet-300/50" : ""}`}
                style={{ "--glass-accent-rgb": hexToRgbTuple(item.accent), ...itemLook.style }}
                title="Right-click to edit · Ctrl+Click for split view"
              >
                <ItemIcon
                  className={`${compactView ? "h-3 w-3" : "h-4 w-4"} flex-shrink-0`}
                  style={{ color: itemLook.textColor || item.accent, filter: isActive ? `drop-shadow(0 0 6px ${item.accent})` : undefined }}
                />
                <span
                  className={`${compactView ? "text-[11px]" : "text-sm"} min-w-0 truncate font-medium ${isActive ? "font-bold" : ""}`}
                  style={{ color: itemText, textShadow: itemLook.style?.textShadow }}
                >
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
