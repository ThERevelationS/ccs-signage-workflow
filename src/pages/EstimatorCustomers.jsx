import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Input } from "@/components/ui/input";
import { Users, Search, Phone, Mail, RefreshCw, X, MapPin, FileText, Briefcase, Loader2 } from "lucide-react";
import { backfillCustomersFromWorkOrders, loadAllCustomers } from "@/components/estimator/customerSync";
import { replaceCustomerFieldsIfUnchanged } from "@/components/estimator/customerPersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const FILTERS = [
  { key: "", label: "All" },
  { key: "active", label: "Active" },
  { key: "prospect", label: "Prospects" },
  { key: "inactive", label: "Inactive" },
];

const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function CustomerDetail({ sessionToken, customerId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    base44.functions.invoke("opportunityWorkspaceAction", {
      session_token: sessionToken, action: "get_customer_360", customer_id: customerId,
    }).then((r) => {
      const d = r?.data || r;
      if (!live) return;
      if (d?.success) setData(d); else setError(d?.error || "Load failed.");
    }).catch((e) => { if (live) setError(e?.response?.data?.error || e?.message || "Load failed."); });
    return () => { live = false; };
  }, [sessionToken, customerId]);

  const c = data?.customer;
  const s = data?.summary;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {!data ? (
          error ? <div className="py-8 text-center text-sm text-red-600">{error}</div>
            : <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{c?.company_name || "Customer"}</h2>
                <div className="text-xs text-gray-500 capitalize">{c?.customer_status || "prospect"}</div>
              </div>
              <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {[
                ["Open opps", s?.open_opportunities],
                ["Pipeline", usd(s?.open_pipeline_value)],
                ["Invoiced", usd(s?.invoiced_total)],
                ["Collected", usd(s?.collected_total)],
                ["Open AR", usd(s?.open_ar)],
                ["Jobs", s?.jobs_count],
              ].map(([label, val]) => (
                <div key={label} className="rounded-lg border border-gray-200 p-2 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
                  <div className="mt-0.5 text-sm font-bold text-gray-800">{val ?? 0}</div>
                </div>
              ))}
            </div>

            {data.ar_aging && Number(s?.open_ar) > 0 && (
              <div className="mt-3 rounded-lg border border-gray-200 p-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">AR aging · as of {data.ar_aging.as_of}</h3>
                <div className="mt-2 grid grid-cols-5 gap-2 text-center">
                  {[
                    ["Current", data.ar_aging.current, "text-gray-800"],
                    ["1–30", data.ar_aging.d1_30, "text-amber-700"],
                    ["31–60", data.ar_aging.d31_60, "text-orange-700"],
                    ["61–90", data.ar_aging.d61_90, "text-red-600"],
                    ["90+", data.ar_aging.d90_plus, "text-red-800"],
                  ].map(([label, val, cls]) => (
                    <div key={label}>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
                      <div className={`text-sm font-bold ${cls}`}>{usd(val)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-200 p-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Contacts</h3>
                {(data.contacts || []).length === 0 && <div className="mt-1 text-xs text-gray-400">None recorded</div>}
                {(data.contacts || []).map((p) => (
                  <div key={p.id} className="mt-1.5 text-sm">
                    <span className="font-medium text-gray-800">{p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ")}</span>
                    <span className="text-xs text-gray-400"> {p.position || p.authority_role || ""}</span>
                    {(p.email || p.phone) && <div className="text-xs text-gray-500">{[p.email, p.phone].filter(Boolean).join(" · ")}</div>}
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Locations</h3>
                {(data.locations || []).length === 0 && <div className="mt-1 text-xs text-gray-400">None recorded</div>}
                {(data.locations || []).map((l) => (
                  <div key={l.id} className="mt-1.5 flex items-start gap-1.5 text-sm">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <div>
                      <span className="font-medium text-gray-800">{l.label || "Site"}</span>
                      <div className="text-xs text-gray-500">{[l.address_line_1, l.city, l.state].filter(Boolean).join(", ")}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Opportunities</h3>
                {(data.opportunities || []).length === 0 && <div className="mt-1 text-xs text-gray-400">None</div>}
                {(data.opportunities || []).map((o) => (
                  <div key={o.id} className="mt-1.5 flex items-center justify-between text-sm">
                    <span className="min-w-0 truncate text-gray-800"><Briefcase className="mr-1 inline h-3.5 w-3.5 text-gray-400" />{o.title || "Opportunity"} <span className="text-xs text-gray-400">({o.stage})</span></span>
                    <span className="shrink-0 text-xs font-medium text-gray-600">{o.budget_amount ? usd(o.budget_amount) : ""}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Invoices</h3>
                {(data.invoices || []).length === 0 && <div className="mt-1 text-xs text-gray-400">None</div>}
                {(data.invoices || []).map((i) => (
                  <div key={i.id} className="mt-1.5 flex items-center justify-between text-sm">
                    <span className="min-w-0 truncate text-gray-800"><FileText className="mr-1 inline h-3.5 w-3.5 text-gray-400" />{i.invoice_number || "Invoice"} <span className="text-xs text-gray-400">({i.status})</span></span>
                    <span className="shrink-0 text-xs font-medium text-gray-600">
                      {usd(i.balance_due)} due
                      {i.days_overdue > 0 && Number(i.balance_due) > 0 && (
                        <span className="ml-1 font-semibold text-red-600">{i.days_overdue}d overdue</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-gray-200 p-3 sm:col-span-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Jobs / Work orders</h3>
                {(data.jobs || []).length === 0 && <div className="mt-1 text-xs text-gray-400">None</div>}
                {(data.jobs || []).map((w) => (
                  <div key={w.id} className="mt-1.5 flex items-center justify-between text-sm">
                    <span className="min-w-0 truncate text-gray-800">{w.title || "Work order"} <span className="text-xs text-gray-400">({w.current_stage || w.sales_status || "—"})</span></span>
                    <span className="shrink-0 text-xs font-medium text-gray-600">{w.estimate_amount ? usd(w.estimate_amount) : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function EstimatorCustomers() {
  const location = useLocation();
  const { sessionToken } = useAuth();
  const searchParams = new URLSearchParams(location.search);
  const status = searchParams.get("status") || "";
  const linkedCustomerId = searchParams.get("customer") || "";
  const [customers, setCustomers] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [savingTierId, setSavingTierId] = useState(null);
  const [detailId, setDetailId] = useState("");
  const [me, setMe] = useState(null);
  const [syncingWorkflowCustomers, setSyncingWorkflowCustomers] = useState(false);
  const workflowSyncRef = useRef(false);
  const pricingTierSaveRef = useRef(false);

  useEffect(() => {
    const load = async () => {
      const [res, tierRows, user] = await Promise.all([
        loadAllCustomers(),
        loadAllEntityRows({ entity: base44.entities.MarkupTier, sort: "sort_order", label: "Customer markup tiers" }).catch(() => []),
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
      const merged = await backfillCustomersFromWorkOrders(current || [], { sessionToken });
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
  const linkedCustomer = linkedCustomerId ? customers.find((customer) => customer.id === linkedCustomerId) || null : null;
  const rows = customers
    .filter((c) => (linkedCustomerId ? c.id === linkedCustomerId : status ? (c.customer_status || "prospect") === status : true))
    .filter((c) =>
      linkedCustomerId
        ? true
        : term
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

        {linkedCustomerId && (
          <div className="flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-xs text-blue-900">
              <span className="font-semibold">Linked customer:</span>{" "}
              {loading ? "Loading…" : linkedCustomer?.company_name || "Customer record not found"}
            </div>
            <Link to="/EstimatorCustomers" className="inline-flex h-11 shrink-0 items-center justify-center rounded-md border border-blue-200 bg-white px-3 text-xs font-semibold text-blue-800 hover:bg-blue-100 sm:h-8">
              Show all customers
            </Link>
          </div>
        )}

        {!linkedCustomerId && (
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
        )}

        {!linkedCustomerId && (
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers"
              className="pl-9 bg-white border-none h-11"
            />
          </div>
        )}

        <div className="bg-white">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">Loading customers…</div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">{linkedCustomerId ? "The linked Customer record is not available." : "No customers found."}</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {rows.map((c) => (
                <div key={c.id} onClick={() => setDetailId(c.id)}
                  className={linkedCustomerId === c.id ? "flex cursor-pointer items-center gap-3 border-l-4 border-blue-500 bg-blue-50/60 px-4 py-3" : "flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-gray-50"}>
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
                  <label className="flex-shrink-0 text-[10px] font-semibold text-gray-400" onClick={(e) => e.stopPropagation()}>
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
        {detailId && (
          <CustomerDetail sessionToken={sessionToken} customerId={detailId} onClose={() => setDetailId("")} />
        )}
      </div>
    </div>
  );
}