import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import {
  LayoutDashboard,
  Navigation,
  Truck,
  CalendarClock,
  ClipboardList,
  Package,
  Droplets,
  ShoppingCart,
  Settings,
} from "lucide-react";

const items = [
  { title: "Overview", page: "FleetOverview", icon: LayoutDashboard },
  { title: "Tracking", page: "FleetTracking", icon: Navigation },
  { title: "Equipment", page: "FleetEquipment", icon: Truck },
  { title: "Maintenance", page: "FleetMaintenance", icon: CalendarClock },
  { title: "Work Orders", page: "FleetWorkOrders", icon: ClipboardList },
  { title: "Parts", page: "FleetParts", icon: Package },
  { title: "Fluids", page: "FleetFluids", icon: Droplets },
  { title: "Requests", page: "FleetRequests", icon: ShoppingCart },
  { title: "Fleet Settings", page: "FleetSettings", icon: Settings, adminOnly: true },
];

export default function FleetModuleNav() {
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;
    base44.auth.me().then((user) => {
      if (mounted) setIsAdmin(user?.role === "admin");
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  return (
    <div className="border-b border-gray-200 bg-white/95 dark:bg-slate-900/95 dark:border-slate-700 backdrop-blur sticky top-0 z-30">
      <div className="px-3 sm:px-5 py-2 flex items-center gap-2 overflow-x-auto">
        <div className="font-bold text-gray-900 dark:text-slate-100 pr-2 whitespace-nowrap">CCS Fleet</div>
        {items.filter(item => !item.adminOnly || isAdmin).map((item) => {
          const url = createPageUrl(item.page);
          const active = location.pathname === url;
          const Icon = item.icon;
          return (
            <Link
              key={item.page}
              to={url}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap border transition-colors ${
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
    </div>
  );
}
