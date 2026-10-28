import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ChevronDown, Columns } from "lucide-react";
import { hexToRgbTuple } from "@/components/layout/navPreferences";

const MENU_WIDTH = 200;

// Dropdown pill for the horizontal bar. The menu is portaled to <body> and
// positioned fixed, so it floats above the page instead of being clipped by
// the navigation container.
export default function NavFlyoutMenu({
  label,
  icon: Icon,
  accent,
  items,
  compactView = false,
  activePath,
  isInSplitUrl,
  onNavigate,
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8));
    setPos({ top: rect.bottom + 6, left });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (triggerRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const hasActive = items.some((item) => item.url === activePath);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`ccs-glass-nav-item flex flex-shrink-0 items-center whitespace-nowrap border ${
          compactView ? "gap-1 rounded-lg px-1 py-0.5" : "gap-1.5 rounded-lg px-2 py-1.5"
        }`}
        style={{ "--glass-accent-rgb": hexToRgbTuple(accent) }}
      >
        <Icon
          className={`${compactView ? "h-3 w-3" : "h-3.5 w-3.5"} flex-shrink-0`}
          style={{ color: accent, filter: hasActive ? `drop-shadow(0 0 6px ${accent})` : undefined }}
        />
        <span className={`${compactView ? "text-[10px]" : "text-xs"} font-medium text-slate-100 ${hasActive ? "font-bold text-white" : ""}`}>
          {label}
        </span>
        <ChevronDown
          className={`h-3 w-3 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          style={{ color: hasActive ? "#6B46C1" : "#9CA3AF" }}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="ccs-glass-panel fixed z-[80] rounded-xl p-1 text-slate-100 shadow-2xl"
            style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
          >
            {items.map((item) => {
              const ItemIcon = item.icon;
              const isActive = activePath === item.url;
              const isInSplit = isInSplitUrl(item);
              return (
                <Link
                  key={item.title}
                  to={item.url}
                  role="menuitem"
                  onClick={(event) => {
                    onNavigate(event, item);
                    setOpen(false);
                  }}
                  className={`ccs-glass-nav-item flex items-center gap-2 rounded-lg px-3 py-2 ${isActive ? "font-bold" : ""}`}
                  style={{ "--glass-accent-rgb": hexToRgbTuple(item.accent) }}
                  title="Ctrl+Click to open in split view"
                >
                  <ItemIcon
                    className="h-4 w-4 flex-shrink-0"
                    style={{ color: item.accent, filter: isActive ? `drop-shadow(0 0 6px ${item.accent})` : undefined }}
                  />
                  <span className={`text-sm font-medium text-slate-100 ${isActive ? "font-bold text-white" : ""}`}>
                    {item.title}
                  </span>
                  {isInSplit && <Columns className="h-3 w-3 text-purple-500" />}
                </Link>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}