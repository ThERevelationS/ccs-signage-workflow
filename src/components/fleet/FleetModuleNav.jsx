import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import FleetQuickActions from "@/components/fleet/FleetQuickActions";
import {
  LayoutDashboard,
  Search,
  Bell,
  Navigation,
  Truck,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Package,
  Droplets,
  Fuel,
  ShieldCheck,
  CalendarDays,
  ShoppingCart,
  History,
  BarChart3,
  Grid3X3,
  X,
} from "lucide-react";
import { getSessionUser } from "@/components/auth/EmailGate";

const MOBILE_PRIMARY_PAGES = ["FleetOverview", "FleetTracking", "FleetEquipment", "FleetMaintenance", "FleetWorkOrders"];
const MOBILE_LABELS = { FleetOverview: "Home", FleetTracking: "Track", FleetEquipment: "Assets", FleetMaintenance: "Service", FleetWorkOrders: "Work" };

const items = [
  { title: "Overview", page: "FleetOverview", icon: LayoutDashboard },
  { title: "Search", page: "FleetSearch", icon: Search },
  { title: "Notifications", page: "FleetNotifications", icon: Bell },
  { title: "Tracking", page: "FleetTracking", icon: Navigation },
  { title: "Equipment", page: "FleetEquipment", icon: Truck, activePages: ["FleetEquipment", "FleetEquipmentDetail"] },
  { title: "Maintenance", page: "FleetMaintenance", icon: CalendarClock },
  { title: "Inspections", page: "FleetInspections", icon: ClipboardCheck },
  { title: "Work Orders", page: "FleetWorkOrders", icon: ClipboardList },
  { title: "Parts", page: "FleetParts", icon: Package },
  { title: "Fluids", page: "FleetFluids", icon: Droplets },
  { title: "Fuel & Costs", page: "FleetFuel", icon: Fuel },
  { title: "Warranties", page: "FleetWarranties", icon: ShieldCheck },
  { title: "Assignments", page: "FleetReservations", icon: CalendarDays },
  { title: "Requests", page: "FleetRequests", icon: ShoppingCart },
  { title: "History", page: "FleetHistory", icon: History, adminOnly: true },
  { title: "Analytics", page: "FleetAnalytics", icon: BarChart3, adminOnly: true },
];

export default function FleetModuleNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.resolve(getSessionUser()).then((user) => {
      if (mounted) setIsAdmin(user?.role === "admin");
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const close = (event) => { if (event.key === "Escape") setMobileOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [mobileOpen]);

  useEffect(() => {
    const openFleetSearch = (event) => {
      if (!(event.ctrlKey || event.metaKey) || String(event.key || "").toLowerCase() !== "k") return;
      event.preventDefault();
      navigate(createPageUrl("FleetSearch"));
    };
    window.addEventListener("keydown", openFleetSearch);
    return () => window.removeEventListener("keydown", openFleetSearch);
  }, [navigate]);

  const visibleItems = items.filter(item => !item.adminOnly || isAdmin);
  const mobilePrimary = MOBILE_PRIMARY_PAGES.map(page => visibleItems.find(item => item.page === page)).filter(Boolean);
  const currentIsSecondary = !mobilePrimary.some(item => (item.activePages || [item.page]).some(page => location.pathname === createPageUrl(page)));

  const navLinkClass = active => `inline-flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${active ? "bg-indigo-50 border-indigo-200 text-indigo-800 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-200" : "border-transparent text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"}`;

  return (
    <>
      <nav aria-label="CCS Fleet navigation" className="border-b border-gray-200 bg-white/95 dark:bg-slate-900/95 dark:border-slate-700 backdrop-blur sticky top-0 z-30">
        <div className="hidden lg:flex px-5 py-2 items-center gap-2 overflow-x-auto overscroll-x-contain">
          <div className="font-bold text-gray-900 dark:text-slate-100 pr-2 whitespace-nowrap">CCS Fleet</div>
          {visibleItems.map((item) => {
            const url = createPageUrl(item.page);
            const active = (item.activePages || [item.page]).some(page => location.pathname === createPageUrl(page));
            const Icon = item.icon;
            return <Link key={item.page} to={url} aria-current={active ? "page" : undefined} className={navLinkClass(active)}><Icon className="w-4 h-4" />{item.title}</Link>;
          })}
        </div>

        <div className="lg:hidden px-2 py-1.5">
          <div className="grid grid-cols-6 gap-1">
            {mobilePrimary.map(item => {
              const active = (item.activePages || [item.page]).some(page => location.pathname === createPageUrl(page));
              const Icon = item.icon;
              return <Link key={item.page} to={createPageUrl(item.page)} aria-current={active ? "page" : undefined} className={`min-h-14 rounded-xl flex flex-col items-center justify-center gap-1 text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${active ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200" : "text-gray-600 dark:text-slate-300"}`}><Icon className="w-4 h-4" /><span>{MOBILE_LABELS[item.page] || item.title}</span></Link>;
            })}
            <button type="button" onClick={() => setMobileOpen(true)} aria-haspopup="dialog" aria-expanded={mobileOpen} className={`min-h-14 rounded-xl flex flex-col items-center justify-center gap-1 text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${currentIsSecondary || mobileOpen ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200" : "text-gray-600 dark:text-slate-300"}`}><Grid3X3 className="w-4 h-4" /><span>More</span></button>
          </div>
        </div>
      </nav>

      {mobileOpen && <div className="lg:hidden fixed inset-0 z-[120] bg-black/55 flex items-end" role="presentation" onMouseDown={event => event.target === event.currentTarget && setMobileOpen(false)}>
        <div role="dialog" aria-modal="true" aria-label="All CCS Fleet modules" className="w-full max-h-[78dvh] overflow-y-auto rounded-t-3xl border-t border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900 shadow-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-gray-100 dark:border-slate-800 px-4 py-3 flex items-center justify-between gap-3">
            <div><div className="font-bold text-gray-900 dark:text-slate-100">All Fleet Modules</div><div className="text-xs text-gray-500 dark:text-slate-400">Jump anywhere without horizontal scrolling.</div></div>
            <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close Fleet module menu" className="min-h-11 min-w-11 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800"><X className="w-5 h-5 mx-auto" /></button>
          </div>
          <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {visibleItems.map(item => {
              const active = (item.activePages || [item.page]).some(page => location.pathname === createPageUrl(page));
              const Icon = item.icon;
              return <Link key={item.page} to={createPageUrl(item.page)} onClick={() => setMobileOpen(false)} className={`min-h-16 rounded-xl border p-3 flex items-center gap-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${active ? "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200" : "border-gray-200 bg-white text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}><span className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-slate-800 flex items-center justify-center shrink-0"><Icon className="w-4 h-4" /></span><span>{item.title}</span></Link>;
            })}
          </div>
        </div>
      </div>}
      <FleetQuickActions />
    </>
  );
}
