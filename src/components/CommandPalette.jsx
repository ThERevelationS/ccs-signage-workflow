import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { getSessionToken } from "@/components/auth/EmailGate";
import { pagesConfig } from "@/pages.config";
import { Calculator, FileDiff, FileText, GitBranch, KanbanSquare, Loader2, Package, Receipt, Search, ShoppingCart, Users } from "lucide-react";

const RECORD_GROUPS = [
  ["customers", "Customers", Users, (r) => `${r.contact_name || "—"} · ${(r.customer_status || "").replace(/_/g, " ")}`, (r) => `/EstimatorCustomers?customer=${r.id}`],
  ["opportunities", "Opportunities", GitBranch, (r) => `${r.customer_display_name || "—"} · ${(r.stage || "").replace(/_/g, " ")}`, (r) => `/Opportunities?open=${r.id}`],
  ["work_orders", "Work Orders", KanbanSquare, (r) => `${r.client_name || "—"} · ${(r.current_stage || "").replace(/_/g, " ")}`, (r) => `/MainWorkflow?wo=${r.id}`],
  ["orders", "Orders", ShoppingCart, (r) => `${r.customer_name || "—"} · ${(r.status || "").replace(/_/g, " ")}${r.vendor ? ` · ${r.vendor}` : ""}`, (r) => `/OrderForm?order=${r.id}`],
  ["estimates", "Estimates", Calculator, (r) => `${r.client_name || "—"} · ${r.estimate_number || r.status || "—"}`, (r) => `/EstimateDetail?id=${r.id}`],
  ["invoices", "Invoices", Receipt, (r) => `${r.customer_display_name || "—"} · ${r.status || "—"}`, (r) => `/Invoices?invoice=${r.id}`],
  ["purchase_orders", "Purchase Orders", Package, (r) => `${r.vendor_name || "—"} · ${r.status || "—"}`, (r) => `/PurchaseOrders?po=${r.id}`],
  ["change_orders", "Change Orders", FileDiff, (r) => `${r.title || r.customer_display_name || "—"} · ${r.status || "—"}`, (r) => `/ChangeOrders?co=${r.id}`],
];

const PAGE_LABEL_OVERRIDES = {
  Home: "Home", MainWorkflow: "Main Workflow", Opportunities: "Sales Opportunities",
  EstimatorCustomers: "Customers", Invoices: "Invoices", PurchaseOrders: "Purchase Orders",
  ChangeOrders: "Change Orders", JobCosting: "Job Costing", Inventory: "Inventory",
  ReportingDashboard: "Reports", Estimating: "Estimating", SIPs: "SIPs Board",
  Permitting: "Permitting", TimeClock: "Time Clock", AdminSettings: "Admin Settings",
  NewAllInOneEstimate: "New All-in-One Estimate", Estimator: "Estimator", EstimateDetail: "Estimate Detail",
  QuickPrice: "Quick Price", SalesHome: "Sales Home", EstimatorQueues: "Estimator Queues",
  EstimatorProducts: "Products", EstimatorParts: "Parts", MasterInventory: "Master Inventory",
  QuoteSettings: "Quote Settings", WorkOrderTraveler: "WO Traveler", ProductionSchedule: "Production Schedule",
  VinylEstimator: "Vinyl Estimator", ChannelLetterEstimator: "Channel Letter Estimator",
  CNCEstimator: "CNC Estimator", LaserEstimator: "Laser Estimator", MetalEstimator: "Metal Estimator",
  PaintingEstimator: "Painting Estimator", FoundationEstimator: "Foundation Estimator",
  FleetOverview: "Fleet Overview", FleetWorkOrders: "Fleet Work Orders", FleetEquipment: "Fleet Equipment",
  FleetMaintenance: "Fleet Maintenance", FleetParts: "Fleet Parts", FleetFuel: "Fleet Fuel",
};

// Pages routed in App.jsx outside pagesConfig (estimator + fleet surfaces).
const EXTRA_PAGE_NAMES = [
  "NewAllInOneEstimate", "Estimator", "EstimateDetail", "FoundationEstimator", "FoundationCatalog",
  "VinylEstimator", "MaintenanceEstimator", "ChannelLetterEstimator", "CNCEstimator", "LaserEstimator",
  "MetalEstimator", "BrickStoneEstimator", "PaintingEstimator", "FoundationSettings", "PaintingSettings",
  "CNCSettings", "LaserSettings", "MetalSettings", "MaintenanceSettings", "InstallationSettings",
  "VinylSettings", "VinylInventory", "SalesHome", "EstimatorQueues", "EstimatorCustomers", "QuickPrice",
  "EstimatorProducts", "EstimatorParts", "EstimatorSettings", "EstimatorTools", "MasterInventory", "QuoteSettings",
  "FleetOverview", "FleetSearch", "FleetNotifications", "FleetTracking", "FleetEquipment",
  "FleetEquipmentDetail", "FleetMaintenance", "FleetInspections", "FleetWorkOrders", "FleetParts",
  "FleetFluids", "FleetFuel", "FleetWarranties", "FleetReservations",
  "WorkOrderTraveler", "ProductionSchedule",
];

const pageLabel = (name) =>
  PAGE_LABEL_OVERRIDES[name] || String(name).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");

export default function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState(null);
  const [searching, setSearching] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const pages = useMemo(() => {
    const names = new Set([...Object.keys(pagesConfig?.Pages || {}), ...EXTRA_PAGE_NAMES]);
    names.delete("Home");
    return [...names].map((n) => ({ name: n, label: pageLabel(n), path: `/${n}` }));
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setRecords(null);
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced record search.
  useEffect(() => {
    const sessionToken = getSessionToken();
    if (!open || !sessionToken || query.trim().length < 2) { setRecords(null); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await base44.functions.invoke("opportunityWorkspaceAction", {
          session_token: sessionToken, action: "global_search", query: query.trim(),
        });
        const data = r?.data || r;
        setRecords(data?.results || {});
      } catch { setRecords({}); }
      finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [open, query]);

  // Flatten selectable items: matching pages first, then record hits.
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = [];
    const matchedPages = q
      ? pages.filter((p) => p.label.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, 6)
      : pages.slice(0, 8);
    for (const p of matchedPages) out.push({ kind: "page", label: p.label, sub: "Go to page", path: p.path, icon: FileText });
    if (q.length >= 2 && records) {
      for (const [key, group, Icon, sub, href] of RECORD_GROUPS) {
        for (const r of (records[key] || []).slice(0, 4)) {
          const title = r.title || r.company_name || r.project_name || r.invoice_number || r.po_number || r.change_order_number || r.estimate_number || r.description || "Record";
          out.push({ kind: "record", label: title, sub: `${group} · ${sub(r)}`, path: href(r), icon: Icon });
        }
      }
    }
    return out;
  }, [query, pages, records]);

  useEffect(() => { setCursor(0); }, [items.length]);

  const choose = useCallback((item) => {
    if (!item) return;
    setOpen(false);
    navigate(item.path);
  }, [navigate]);

  const onKeyDown = (e) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, items.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); choose(items[cursor]); }
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/40 px-4 pt-[12vh] backdrop-blur-[2px]" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 dark:border-slate-800">
          {searching ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : <Search className="h-4 w-4 text-slate-400" />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page, quote, invoice, PO, change order, opportunity…"
            className="h-12 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
          <kbd className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 dark:border-slate-700 sm:block">ESC</kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
          {items.length === 0 && !searching && (
            <p className="py-8 text-center text-sm text-slate-400">{query ? "No matches." : "Type to search pages and records."}</p>
          )}
          {items.map((item, i) => (
            <button type="button"
              key={`${item.path}-${i}`}
              data-idx={i}
              onMouseEnter={() => setCursor(i)}
              onClick={() => choose(item)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === cursor ? "bg-violet-50 dark:bg-slate-800" : ""}`}
            >
              <item.icon className={`h-4 w-4 shrink-0 ${i === cursor ? "text-violet-600 dark:text-violet-400" : "text-slate-400"}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{item.label}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.sub}</p>
              </div>
              {item.kind === "record" && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">record</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400 dark:border-slate-800">
          <span><kbd className="rounded border border-slate-200 px-1 dark:border-slate-700">↑↓</kbd> navigate</span>
          <span><kbd className="rounded border border-slate-200 px-1 dark:border-slate-700">↵</kbd> open</span>
          <span className="ml-auto">Ctrl+K to toggle</span>
        </div>
      </div>
    </div>
  );
}