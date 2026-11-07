import { Link } from "react-router-dom";
import { ChevronDown, Columns } from "lucide-react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { hexToRgbTuple } from "@/components/layout/navPreferences";
import { navButtonStyle } from "@/components/layout/navCustomization";

// Collapsible sidebar section. Groups are user-editable folders: the header is
// a drop target for pages and the items are Draggables so pages can move
// between folders and back onto the bar.
export default function SidebarNavGroup({
  label,
  items,
  collapsed,
  onToggle,
  compactView = false,
  activePath,
  isInSplitUrl,
  onNavigate,
  folderId = null,
  accent = "#8B5CF6",
  stylePreset = "glass",
  onContextMenuGroup,
  onContextMenuItem,
}) {
  const hasActive = items.some((item) => item.url === activePath);
  const Chevron = ChevronDown;
  const look = navButtonStyle(stylePreset, accent);

  const header = (
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
      title="Right-click to edit folder · Drop pages here"
    >
      <span className={`uppercase tracking-[0.1em] ${hasActive ? "text-violet-200" : "text-slate-300"}`} style={{ color: look.textColor || undefined }}>
        {label}
      </span>
      <Chevron className={`ml-auto h-3 w-3 transition-transform ${collapsed ? "" : "rotate-180"}`} style={{ color: look.textColor || "#94a3b8" }} />
    </button>
  );

  const renderItem = (item, dragProvided) => {
    const ItemIcon = item.icon;
    const isActive = activePath === item.url;
    const isInSplit = isInSplitUrl(item);
    const itemLook = navButtonStyle(item.stylePreset || "glass", item.accent);
    return (
      <Link
        key={item.title}
        ref={dragProvided?.innerRef}
        {...(dragProvided?.draggableProps || {})}
        {...(dragProvided?.dragHandleProps || {})}
        to={item.url}
        onClick={(event) => onNavigate(event, item)}
        onContextMenu={(event) => {
          if (!onContextMenuItem) return;
          event.preventDefault();
          event.stopPropagation();
          onContextMenuItem(item, { x: event.clientX, y: event.clientY });
        }}
        className={`ccs-glass-nav-item flex w-full items-center border ${
          compactView ? "gap-1.5 rounded-lg px-1.5 py-1" : "gap-2 rounded-xl px-3 py-2"
        } ${isActive ? "font-bold" : isInSplit ? "ring-1 ring-violet-300/50" : ""}`}
        style={{
          ...(dragProvided?.draggableProps?.style || {}),
          "--glass-accent-rgb": hexToRgbTuple(item.accent),
          ...itemLook.style,
        }}
        title="Drag to move · Right-click to edit · Ctrl+Click for split view"
      >
        <ItemIcon
          className={`${compactView ? "h-3 w-3" : "h-4 w-4"} flex-shrink-0`}
          style={{ color: itemLook.textColor || item.accent, filter: isActive ? `drop-shadow(0 0 6px ${item.accent})` : undefined }}
        />
        <span
          className={`${compactView ? "text-[11px]" : "text-sm"} min-w-0 truncate font-medium ${isActive ? "font-bold" : ""}`}
          style={{ color: itemLook.textColor || (isActive ? "#fff" : "#f1f5f9") }}
        >
          {item.title}
        </span>
        {isInSplit && <Columns className="h-3 w-3 flex-shrink-0 text-purple-500" />}
      </Link>
    );
  };

  return (
    <div className={`${compactView ? "mt-1 pt-1" : "mt-2 pt-2"} border-t border-gray-200/50 dark:border-white/10`}>
      {folderId ? (
        <Droppable droppableId={`side-folder:${folderId}`} isCombineEnabled={false}>
          {(dropProvided, dropSnapshot) => (
            <div
              ref={dropProvided.innerRef}
              {...dropProvided.droppableProps}
              className={`rounded-lg ${dropSnapshot.isDraggingOver ? "ring-2 ring-violet-400 bg-violet-500/10" : ""}`}
            >
              {header}
              {dropProvided.placeholder}
            </div>
          )}
        </Droppable>
      ) : header}

      {!collapsed && (
        folderId ? (
          <Droppable droppableId={`side-folder-list:${folderId}`} direction="vertical">
            {(listProvided, listSnapshot) => (
              <div
                ref={listProvided.innerRef}
                {...listProvided.droppableProps}
                className={`${compactView ? "mt-0.5 space-y-0.5" : "mt-1 space-y-1"} rounded-lg ${listSnapshot.isDraggingOver ? "ring-1 ring-violet-400/60" : ""}`}
              >
                {items.map((item, index) => (
                  <Draggable key={item.url} draggableId={`sfli-${folderId}-${item.url}`} index={index}>
                    {(dragProvided) => renderItem(item, dragProvided)}
                  </Draggable>
                ))}
                {listProvided.placeholder}
                {!items.length && <div className="px-3 py-1 text-[10px] text-slate-500">Empty — drag pages here</div>}
              </div>
            )}
          </Droppable>
        ) : (
          <div className={compactView ? "mt-0.5 space-y-0.5" : "mt-1 space-y-1"}>
            {items.map((item) => renderItem(item))}
          </div>
        )
      )}
    </div>
  );
}
