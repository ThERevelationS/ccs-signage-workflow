import React, { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Wrench, ArrowRight } from "lucide-react";
import { ESTIMATOR_MODULES } from "@/components/estimator/moduleRegistry";

const LINKS = [
  { label: "Quick Price", desc: "Price one module fast", to: "/QuickPrice" },
  { label: "New Estimate", desc: "Start a full all-in-one estimate", to: "/NewAllInOneEstimate" },
  { label: "Estimate Queues", desc: "Work through estimates by status", to: "/EstimatorQueues" },
  { label: "Customers", desc: "Customer records, statements and portal links", to: "/EstimatorCustomers" },
  { label: "Products", desc: "Quick-product catalog and pricing", to: "/EstimatorProducts" },
  { label: "Parts", desc: "Part catalog used by the module estimators", to: "/EstimatorParts" },
  { label: "Master Inventory", desc: "Stocked materials across modules", to: "/MasterInventory" },
  { label: "Quote Settings", desc: "Customer quote branding, terms and defaults", to: "/QuoteSettings" },
  { label: "Estimator Settings", desc: "Estimator module defaults, pricing admin, audit log and display preferences", to: "/EstimatorSettings" },
  { label: "Pricing Admin", desc: "Markup tiers, tier matrices, labor levels, machine rates and quote simulator", to: "/PricingAdmin" },
  { label: "Export all estimates", desc: "Admin JSON backup of estimates, customers, inventory and audit data — the Backup (JSON) button on Estimate Queues", to: "/EstimatorQueues" },
  { label: "Audit Log", desc: "Admin-only who-changed-what timeline on Estimator Settings", to: "/EstimatorSettings?tab=audit_log" },
  { label: "Main Workflow", desc: "Jump to the shop workflow board", to: "/MainWorkflow" },
  { label: "Sales Pipeline", desc: "Leads, quotes and follow-ups", to: "/SalesPipeline" },
  { label: "Reports & Requests", desc: "Submit a bug or feature request", to: "/FeatureReports" },
];

export default function EstimatorTools() {
  const navigate = useNavigate();
  const location = useLocation();
  const moduleJumpRef = useRef("");
  // #315 — this page is a link hub (no module chooser), so ?module=<key>
  // pre-selects by forwarding to that module's estimator page.
  useEffect(() => {
    const key = new URLSearchParams(location.search).get("module") || "";
    if (!key || moduleJumpRef.current === key) return;
    const mod = ESTIMATOR_MODULES.find((m) => m.key === key);
    if (!mod) return;
    moduleJumpRef.current = key;
    navigate(`/${mod.page}?module=${encodeURIComponent(key)}`, { replace: true });
  }, [location.search, navigate]);
  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-3">
        <div className="bg-white px-4 py-3 flex items-center gap-2">
          <Wrench className="w-4 h-4 text-red-500" />
          <h1 className="text-xs font-bold tracking-wide text-gray-600">TOOLS</h1>
        </div>

        <div className="bg-white divide-y divide-gray-100">
          {LINKS.map((l) => (
            <Link key={l.label} to={l.to} className="flex items-center justify-between px-4 py-3 hover:bg-red-50/50">
              <div>
                <div className="text-sm font-semibold text-gray-800">{l.label}</div>
                <div className="text-xs text-gray-500">{l.desc}</div>
              </div>
              <ArrowRight className="w-4 h-4 text-red-400" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}