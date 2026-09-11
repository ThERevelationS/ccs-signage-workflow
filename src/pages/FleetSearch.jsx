import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import {
  CalendarClock,
  ClipboardList,
  Droplets,
  Loader2,
  Package,
  Search,
  ShoppingCart,
  Truck,
  X,
} from "lucide-react";

const GROUPS = [
  { key: "equipment", label: "Equipment", icon: Truck },
  { key: "work_orders", label: "Work Orders", icon: ClipboardList },
  { key: "maintenance", label: "Maintenance", icon: CalendarClock },
  { key: "parts", label: "Parts", icon: Package },
  { key: "fluids", label: "Fluids", icon: Droplets },
  { key: "requests", label: "Requests", icon: ShoppingCart },
];

function resultUrl(result) {
  if (result.kind === "equipment") return `${createPageUrl("FleetEquipmentDetail")}?id=${encodeURIComponent(result.id)}`;
  if (result.kind === "work_order") return `${createPageUrl("FleetWorkOrders")}?status=all&workOrder=${encodeURIComponent(result.id)}${result.equipment_id ? `&equipment=${encodeURIComponent(result.equipment_id)}` : ""}`;
  if (result.kind === "maintenance") return result.equipment_id
    ? `${createPageUrl("FleetMaintenance")}?equipment=${encodeURIComponent(result.equipment_id)}&tab=schedule`
    : `${createPageUrl("FleetMaintenance")}?view=all_schedules`;
  if (result.kind === "part") return `${createPageUrl("FleetParts")}?search=${encodeURIComponent(result.title || "")}`;
  if (result.kind === "fluid") return `${createPageUrl("FleetFluids")}?search=${encodeURIComponent(result.title || "")}`;
  if (result.kind === "request") return `${createPageUrl("FleetRequests")}?status=all&search=${encodeURIComponent(result.title || "")}`;
  return createPageUrl("FleetOverview");
}

export default function FleetSearch() {
  const initialQuery = useMemo(() => new URLSearchParams(window.location.search).get("q") || "", []);
  const [query, setQuery] = useState(initialQuery);
  const [groups, setGroups] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const trimmed = query.trim();
    const url = new URL(window.location.href);
    if (trimmed) url.searchParams.set("q", trimmed); else url.searchParams.delete("q");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);

    const sequence = ++requestSequence.current;
    if (trimmed.length < 2) {
      setGroups({});
      setTotal(0);
      setLoading(false);
      setError("");
      return undefined;
    }

    setLoading(true);
    setError("");
    const timer = window.setTimeout(async () => {
      try {
        const response = await base44.functions.invoke("fleetSearch", { query: trimmed });
        if (sequence !== requestSequence.current) return;
        if (response?.data?.error) throw new Error(response.data.error);
        setGroups(response?.data?.groups || {});
        setTotal(Number(response?.data?.total || 0));
      } catch (searchError) {
        if (sequence !== requestSequence.current) return;
        setGroups({});
        setTotal(0);
        setError(searchError?.message || "Fleet search failed.");
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    }, 275);
    return () => window.clearTimeout(timer);
  }, [query]);

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length >= 2;

  return <div className="min-h-full bg-gray-50 dark:bg-slate-950">
    <FleetModuleNav />
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Search CCS Fleet</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Search equipment, VINs, plates, Fleet work orders, maintenance schedules, parts, fluids, and requests without loading the complete Fleet database into your browser.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search Fleet — VIN, plate, WO number, maintenance, part, fluid, request..."
          className="w-full rounded-xl border border-gray-300 bg-white py-3.5 pl-12 pr-12 text-base shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-950"
          aria-label="Search CCS Fleet"
        />
        {query && <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-100" aria-label="Clear Fleet search"><X className="w-4 h-4" /></button>}
      </div>

      {!hasQuery && <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <div className="font-semibold text-gray-900 dark:text-slate-100">Type at least 2 characters.</div>
        <p className="mt-1">Examples: a truck number, VIN fragment, license plate, <span className="font-mono">WO-2026</span>, “oil change,” a part number, fluid brand, or requested item.</p>
        <p className="mt-3 text-xs text-gray-400">Tip: from any CCS Fleet page, press <span className="font-semibold">Ctrl+K</span> (or <span className="font-semibold">⌘K</span> on Mac) to open Fleet Search.</p>
      </div>}

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      {hasQuery && <div className="flex items-center justify-between gap-3 text-sm text-gray-500 dark:text-slate-400">
        <span>{loading ? "Searching Fleet…" : `${total} result${total === 1 ? "" : "s"} for “${trimmedQuery}”`}</span>
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      </div>}

      {hasQuery && !loading && !error && total === 0 && <div className="rounded-xl border border-gray-200 bg-white py-12 px-5 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900"><Search className="w-8 h-8 mx-auto text-gray-300" /><div className="mt-3 font-semibold text-gray-800 dark:text-slate-200">No Fleet results found</div><p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Try a VIN fragment, plate, work-order number, asset name, maintenance title, part number, fluid name, or request item.</p></div>}

      <div className="space-y-5">
        {GROUPS.map(group => {
          const rows = Array.isArray(groups[group.key]) ? groups[group.key] : [];
          if (!rows.length) return null;
          const Icon = group.icon;
          return <section key={group.key} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 dark:border-slate-800"><h2 className="font-semibold text-gray-900 dark:text-slate-100 inline-flex items-center gap-2"><Icon className="w-4 h-4 text-indigo-500" />{group.label}</h2><span className="text-xs text-gray-400">{rows.length} shown</span></div>
            <div className="divide-y divide-gray-100 dark:divide-slate-800">{rows.map(result => <Link key={`${result.kind}-${result.id}`} to={resultUrl(result)} className="block px-4 py-3.5 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none dark:hover:bg-slate-800/50 dark:focus:bg-slate-800/50"><div className="flex items-start gap-3"><div className="mt-0.5 w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 dark:bg-indigo-950/40"><Icon className="w-4 h-4 text-indigo-600 dark:text-indigo-300" /></div><div className="min-w-0 flex-1"><div className="font-medium text-gray-900 dark:text-slate-100 break-words">{result.title}</div>{result.subtitle && <div className="text-sm text-gray-500 dark:text-slate-400 mt-0.5 break-words">{result.subtitle}</div>}{result.meta && <div className="text-xs text-gray-400 mt-1 break-words capitalize">{result.meta}</div>}</div></div></Link>)}</div>
          </section>;
        })}
      </div>
    </div>
  </div>;
}
