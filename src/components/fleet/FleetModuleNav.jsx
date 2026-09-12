import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import FleetQuickActions from "@/components/fleet/FleetQuickActions";
import {
  LayoutDashboard,
  Search,
  Bell,
  Navigation,
  Truck,
  CalendarClock,
  ClipboardList,
  Package,
  Droplets,
  ShoppingCart,
  History,
  BarChart3,
  Settings,
} from "lucide-react";

const items = [
  { title: "Overview", page: "FleetOverview", icon: LayoutDashboard },
  { title: "Search", page: "FleetSearch", icon: Search },
  { title: "Notifications", page: "FleetNotifications", icon: Bell },
  { title: "Tracking", page: "FleetTracking", icon: Navigation },
  { title: "Equipment", page: "FleetEquipment", icon: Truck, activePages: ["FleetEquipment", "FleetEquipmentDetail"] },
  { title: "Maintenance", page: "FleetMaintenance", icon: CalendarClock },
  { title: "Work Orders", page: "FleetWorkOrders", icon: ClipboardList },
  { title: "Parts", page: "FleetParts", icon: Package },
  { title: "Fluids", page: "FleetFluids", icon: Droplets },
  { title: "Requests", page: "FleetRequests", icon: ShoppingCart },
  { title: "History", page: "FleetHistory", icon: History, adminOnly: true },
  { title: "Analytics", page: "FleetAnalytics", icon: BarChart3, adminOnly: true },
  { title: "Fleet Settings", page: "FleetSettings", icon: Settings, adminOnly: true },
];

export default function FleetModuleNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;
    base44.auth.me().then((user) => {
      if (mounted) setIsAdmin(user?.role === "admin");
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const openFleetSearch = (event) => {
      if (!(event.ctrlKey || event.metaKey) || String(event.key || "").toLowerCase() !== "k") return;
      event.preventDefault();
      navigate(createPageUrl("FleetSearch"));
    };
    window.addEventListener("keydown", openFleetSearch);
    return () => window.removeEventListener("keydown", openFleetSearch);
  }, [navigate]);

  return (
    <>
    <nav aria-label="CCS Fleet navigation" className="border-b border-gray-200 bg-white/95 dark:bg-slate-900/95 dark:border-slate-700 backdrop-blur sticky top-0 z-30">
      <div className="px-3 sm:px-5 py-2 flex items-center gap-2 overflow-x-auto overscroll-x-contain">
        <div className="font-bold text-gray-900 dark:text-slate-100 pr-2 whitespace-nowrap">CCS Fleet</div>
        {items.filter(item => !item.adminOnly || isAdmin).map((item) => {
          const url = createPageUrl(item.page);
          const activePages = item.activePages || [item.page];
          const active = activePages.some(page => location.pathname === createPageUrl(page));
          const Icon = item.icon;
          return (
            <Link
              key={item.page}
              to={url}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                active
                  ? "bg-indigo-50 border-indigo-200 text-indigo-800 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-200"
                  : "border-transparent text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.title}
            </Link>
          );
        })}
      </div>
    </nav>
    <FleetQuickActions />
    </>
  );
}
