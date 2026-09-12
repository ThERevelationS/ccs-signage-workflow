import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { CalendarClock, ClipboardList, Plus, Search, ShoppingCart, Truck, X } from "lucide-react";

const actions = [
  { label: "New work order", page: "FleetWorkOrders", query: "new=1", icon: ClipboardList },
  { label: "Maintenance", page: "FleetMaintenance", icon: CalendarClock },
  { label: "Request part / fluid", page: "FleetRequests", query: "new=1", icon: ShoppingCart },
  { label: "Equipment", page: "FleetEquipment", icon: Truck },
  { label: "Fleet search", page: "FleetSearch", icon: Search },
];

export default function FleetQuickActions() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = event => {
      if (event.key === "Escape") setOpen(false);
      if (event.type === "pointerdown" && panelRef.current && !panelRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [open]);

  return <div ref={panelRef} className="fixed right-4 bottom-4 sm:right-6 sm:bottom-6 z-40">
    {open && <div className="absolute right-0 bottom-16 w-[min(300px,calc(100vw-32px))] rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl dark:border-slate-700 dark:bg-slate-900" role="menu" aria-label="Fleet quick actions">
      <div className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-400">Quick actions</div>
      {actions.map(action => {
        const Icon = action.icon;
        const href = `${createPageUrl(action.page)}${action.query ? `?${action.query}` : ""}`;
        return <Link key={action.label} to={href} onClick={() => setOpen(false)} role="menuitem" className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-200 dark:hover:bg-slate-800">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300"><Icon className="h-4 w-4" /></span>
          {action.label}
        </Link>;
      })}
    </div>}
    <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label={open ? "Close Fleet quick actions" : "Open Fleet quick actions"} className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xl transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950">
      {open ? <X className="h-5 w-5" /> : <Plus className="h-6 w-6" />}
    </button>
  </div>;
}
