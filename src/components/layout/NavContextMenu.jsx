import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MENU_WIDTH = 208;

// Right-click menu for nav surfaces (bar empty space, folders, page buttons).
// Portaled to <body> so it floats above the shell.
export default function NavContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: y, left: x });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
      left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="ccs-glass-panel fixed z-[90] rounded-xl p-1 text-slate-100 shadow-2xl"
      style={{ top: pos.top, left: pos.left, minWidth: MENU_WIDTH }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <button
            key={index}
            type="button"
            role="menuitem"
            onClick={() => { onClose(); item.onClick?.(); }}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
              item.danger ? "text-rose-300 hover:bg-rose-500/15" : "text-slate-100 hover:bg-white/10"
            }`}
          >
            {Icon && <Icon className={`h-4 w-4 flex-shrink-0 ${item.danger ? "text-rose-400" : "text-slate-400"}`} />}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body
  );
}
