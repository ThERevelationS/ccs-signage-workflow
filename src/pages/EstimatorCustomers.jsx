import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Users, Search, Phone, Mail, RefreshCw } from "lucide-react";
import { backfillCustomersFromWorkOrders, loadAllCustomers } from "@/components/estimator/customerSync";
import { replaceCustomerFieldsIfUnchanged } from "@/components/estimator/customerPersistence";

const FILTERS = [
  { key: "", label: "All" },
  { key: "active", label: "Active" },
  { key: "prospect", label: "Prospects" },
  { key: "inactive", label: "Inactive" },
];

export default function EstimatorCustomers() {
  const location = useLocation();
  const status = new URLSearchParams(location.search).get("status") || "";
  const [customers, setCustomers] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [savingTierId, setSavingTierId] = useState(null);
  const [me, setMe] = useState(null);
  const [syncingWorkflowCustomers, setSyncingWorkflowCustomers] = useState(false);
  const workflowSyncRef = useRef(false);
  const pricingTierSaveRef = useRef(false);

  useEffect(() => {
    const load = async () => {
      const [res, tierRows, user] = await Promise.all([
        loadAllCustomers(),
        base44.entities.MarkupTier.list("sort_order").catch(() => []),
        base44.auth.me().catch(() => null),
      ]);
      setCustomers(res || []);
      setTiers(tierRows || []);
      setMe(user);
      setLoading(false);
    };
    load();
  }, []);

  const syncWorkflowCustomers = async () => {
    if (me?.role !== "admin" || workflowSyncRef.current) return;
    if (!window.confirm("Create shared Customer records for workflow/Sales Pipeline client names that do not already have an exact Customer or legacy-name match? Existing Customer records will not be merged or overwritten.")) return;
    workflowSyncRef.current = true;
    setSyncingWorkflowCustomers(true);
    try {
      const current = await loadAllCustomers();
      const merged = await backfillCustomersFromWorkOrders(current || []);
      const createdCount = Math.max(0, merged.length - (current || []).length);
      setCustomers(
        [...merged].sort((a, b) => String(a.company_name || "").localeCompare(String(b.company_name || "")))
      );
      window.alert(createdCount ? `${createdCount} workflow customer${createdCount === 1 ? "" : "s"} added.` : "No missing workflow customers were found.");
    } catch (error) {
      window.alert(error?.message || "Workflow customers could not be synchronized.");
    } finally {
      workflowSyncRef.current = false;
      setSyncingWorkflowCustomers(false);
    }
  };

  const updatePricingTier = async (customerId, tierNumber) => {
    if (pricingTierSaveRef.current) return;
    const nextTier = Number(tierNumber) || 1;
    const loadedCustomer = customers.find((customer) => customer.id === customerId) || null;
    if (!loadedCustomer) {
      window.alert("This Customer is no longer in the loaded list. Reload before changing its pricing tier.");
      return;
    }

    pricingTierSaveRef.current = true;
    setSavingTierId(customerId);
    try {
      const saved = await replaceCustomerFieldsIfUnchanged({
        entity: base44.entities.Customer,
        customerId,
        expectedFields: { pricing_tier: loadedCustomer.pricing_tier },
        nextFields: { pricing_tier: nextTier },
        label: "Customer pricing tier",
      });
      setCustomers((rows) => rows.map((customer) => customer.id === customerId ? saved : customer));
    } catch (error) {
      const refreshed = await base44.entities.Customer.get(customerId).catch(() => null);
      if (refreshed) {
        setCustomers((rows) => rows.map((customer) => customer.id === customerId ? refreshed : customer));
      }
      window.alert(error?.message || "Customer pricing tier could not be saved.");
    } finally {
      pricingTierSaveRef.current = false;
      setSavingTierId(null);
    }
  };

  const term = search.trim().toLowerCase();
  const rows = customers
    .filter((c) => (status ? (c.customer_status || "prospect") === status : true))
    .filter((c) =>
      term
        ? [c.company_name, c.contact_first_name, c.contact_last_name, c.contact_email]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(term))
        : true
    );

  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-3">
        <div className="bg-white px-4 py-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-red-500" />
          <h1 className="text-xs font-bold tracking-wide text-gray-600">CUSTOMERS</h1>
          <span className="ml-auto text-xs text-gray-400">{customers.length} total</span>
          {me?.role === "admin" && (
            <button
              type="button"
              onClick={syncWorkflowCustomers}
              disabled={syncingWorkflowCustomers}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              title="Explicitly add workflow/Sales Pipeline client names that do not already have a shared Customer record"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingWorkflowCustomers ? "animate-spin" : ""}`} />
              {syncingWorkflowCustomers ? "Syncing…" : "Sync Workflow Customers"}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key || "all"}
              to={f.key ? `/EstimatorCustomers?status=${f.key}` : "/EstimatorCustomers"}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                status === f.key
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-white/70 text-gray-600 border-gray-200 hover:border-red-300"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers"
            className="pl-9 bg-white border-none h-11"
          />
        </div>

        <div className="bg-white">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">Loading customers…</div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">No customers found.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {rows.map((c) => (
                <div key={c.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-800 truncate">{c.company_name}</div>
                    <div className="text-xs text-gray-500 truncate flex items-center gap-3">
                      <span>
                        {[c.contact_first_name, c.contact_last_name].filter(Boolean).join(" ") || "—"}
                      </span>
                      {c.contact_email && (
                        <span className="hidden sm:flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {c.contact_email}
                        </span>
                      )}
                      {c.company_phone && (
                        <span className="hidden sm:flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {c.company_phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <label className="flex-shrink-0 text-[10px] font-semibold text-gray-400">
                    PRICING TIER
                    <select
                      value={String(Number(c.pricing_tier) || 1)}
                      disabled={savingTierId === c.id || tiers.length === 0}
                      onChange={(event) => updatePricingTier(c.id, event.target.value)}
                      className="mt-0.5 block h-8 min-w-[240px] max-w-[320px] rounded border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-700 disabled:bg-gray-100"
                    >
                      {tiers.map((tier) => (
                        <option key={tier.id} value={String(tier.tier_number)}>
                          Tier {tier.tier_number} — {tier.tier_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="text-xs font-medium text-gray-500 capitalize flex-shrink-0">
                    {c.customer_status || "prospect"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}