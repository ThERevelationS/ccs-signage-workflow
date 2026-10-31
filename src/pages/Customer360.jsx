import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import {
  AllInOneEstimate,
  Customer,
  CustomerLocation,
  OpportunityActivity,
  WorkOrder,
} from "@/api/gatedEntities";
import KpiStrip from "@/components/customer360/KpiStrip";
import {
  ActivityTab,
  ContactsTab,
  EstimatesTab,
  FinancialsTab,
  JobsTab,
  OverviewTab,
} from "@/components/customer360/Sections";
import {
  clean,
  computeTotals,
  customerName,
  num,
  normalizeWorkspace,
  primaryContactName,
  readCustomerIdParam,
  statusTone,
  truncatedListNames,
  usd,
} from "@/components/customer360/customer360Model";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CloudOff,
  FilePlus2,
  RefreshCw,
  ScrollText,
} from "lucide-react";

// The Customer 360 hub is served by the customer_workspace action on the
// shared opportunity workspace function. Invoice/Payment/PurchaseOrder/
// ChangeOrder/Opportunity/CustomerContact are backend-only entities that the
// staff read gateway cannot serve — when the action is missing (older deploy)
// the page degrades to the Customer record plus the staff-readable lists
// (estimates, work orders, locations, CRM activity).
const invokeWorkspace = async (sessionToken, body) => {
  const r = await base44.functions.invoke("opportunityWorkspaceAction", {
    session_token: sessionToken,
    ...body,
  });
  const data = r?.data || r;
  if (!data?.success) throw new Error(data?.error || "Request failed.");
  return data;
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "estimates", label: "Estimates" },
  { key: "jobs", label: "Jobs" },
  { key: "financials", label: "Financials" },
  { key: "activity", label: "CRM / Activity" },
  { key: "contacts", label: "Contacts & Locations" },
];

const badge = (label, tone) => (
  <span
    key={label}
    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${tone}`}
  >
    {label}
  </span>
);

function HeaderBadge({ value }) {
  const s = clean(value);
  return s ? badge(s.replace(/_/g, " "), statusTone(s)) : null;
}

export default function Customer360() {
  const { sessionToken, isRegistered } = useAuth();
  // `?id=` is canonical; `?customer=` is the alias sibling pages already use.
  const customerId = useMemo(() => readCustomerIdParam(window.location.search), []);

  const [customer, setCustomer] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [backendReady, setBackendReady] = useState(false);
  const [backendMissing, setBackendMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");

  const load = useCallback(async () => {
    if (!sessionToken || !customerId) return;
    setError("");
    setBackendMissing(false);

    // 1) The Customer record itself always loads through the staff read
    //    gateway — it drives the header even when the workspace action is not
    //    deployed yet.
    const customerPromise = Customer.get(customerId).catch((err) => {
      throw new Error(err?.response?.data?.error || err?.message || "Customer could not be loaded.");
    });

    // 2) The aggregated workspace payload. A missing/!success response flips
    //    the page into degraded mode rather than erroring out the header.
    const workspacePromise = invokeWorkspace(sessionToken, {
      action: "customer_workspace",
      customer_id: customerId,
    });

    // 3) Staff-readable fallback lists, fetched up-front so degraded mode and
    //    the client-side totals fallback never need a second round trip. Each
    //    entity fails soft — a denied read just contributes an empty list.
    const fallbackPromise = Promise.all([
      AllInOneEstimate.filter({ customer_id: customerId }, "-created_date", 250).catch(() => []),
      WorkOrder.filter({ customer_id: customerId }, "-created_date", 250).catch(() => []),
      CustomerLocation.filter({ customer_id: customerId }, "label", 100).catch(() => []),
      OpportunityActivity.filter({ customer_id: customerId }, "-created_date", 250).catch(() => []),
    ]).then(([estimates, work_orders, locations, activities]) => ({
      estimates,
      work_orders,
      locations,
      activities,
    }));

    const [customerResult, workspaceResult, fallback] = await Promise.all([
      customerPromise,
      workspacePromise.then((d) => ({ ok: true, data: d })).catch((err) => ({ ok: false, err })),
      fallbackPromise,
    ]);

    setCustomer(customerResult);

    // Neither path produced a customer row — surface a not-found error rather
    // than rendering an empty "Unnamed customer" shell.
    if (!customerResult?.id && !(workspaceResult.ok && workspaceResult.data?.customer?.id)) {
      setError("Customer not found — check the link, or pick the account from the Customers list.");
      return;
    }

    if (workspaceResult.ok) {
      setWorkspace(normalizeWorkspace(workspaceResult.data));
      setBackendReady(true);
    } else {
      // Degraded path: "Customer 360 backend not deployed yet" — still render
      // the record plus whatever the staff gateway could read.
      setBackendReady(false);
      setBackendMissing(true);
      const lists = {
        contacts: [],
        locations: fallback.locations,
        opportunities: [],
        estimates: fallback.estimates,
        work_orders: fallback.work_orders,
        invoices: [],
        payments: [],
        purchase_orders: [],
        change_orders: [],
        activities: fallback.activities,
      };
      setWorkspace({ customer: customerResult, ...lists, totals: computeTotals(lists), truncated: null });
    }
  }, [sessionToken, customerId]);

  useEffect(() => {
    let live = true;
    if (!sessionToken || !customerId) {
      setLoading(false);
      return () => { live = false; };
    }
    setLoading(true);
    load()
      .catch((err) => {
        if (live) setError(err?.message || "Customer could not be loaded.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => { live = false; };
  }, [sessionToken, customerId, load]);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      setError(err?.message || "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }, [load, refreshing]);

  const data = workspace;
  const resolvedCustomer = data?.customer || customer;
  const totals = data?.totals || null;
  const truncatedNames = useMemo(() => truncatedListNames(data?.truncated), [data]);
  const truncatedNotice = truncatedNames.length
    ? `Showing the most recent records — ${truncatedNames.join(", ")} hit the server list cap.`
    : "";

  useEffect(() => {
    document.title = resolvedCustomer
      ? `Customer 360 — ${customerName(resolvedCustomer)}`
      : "Customer 360";
  }, [resolvedCustomer]);

  const kpiItems = useMemo(() => {
    const t = totals || {};
    const dash = backendReady ? undefined : "—";
    return [
      {
        label: "Estimates",
        value: `${num(t.estimate_count)} · ${usd(t.estimate_value)}`,
        hint: "count · total value",
      },
      { label: "Open estimate value", value: usd(t.open_estimate_value) },
      { label: "Jobs", value: String(num(t.work_order_count)) },
      {
        label: "Invoiced",
        value: backendReady ? usd(t.invoiced) : dash,
        hint: backendReady ? undefined : "needs backend",
      },
      {
        label: "Paid",
        value: backendReady ? usd(t.paid) : dash,
        hint: backendReady ? undefined : "needs backend",
      },
      {
        label: "Balance",
        value: backendReady ? usd(t.balance) : dash,
        tone: backendReady && num(t.balance) > 0 ? "warn" : undefined,
        hint: backendReady ? "open AR" : "needs backend",
      },
    ];
  }, [totals, backendReady]);

  if (!isRegistered) return null;

  // --- no customer id ---------------------------------------------------------
  if (!customerId) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900">
          <Building2 className="h-9 w-9 text-slate-300 dark:text-slate-600" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Customer 360</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Open this page with a customer id — <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">/Customer360?id=&lt;customerId&gt;</code> (or <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">?customer=</code>).
          </p>
          <Link to="/EstimatorCustomers" className="mt-1 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700">
            <ArrowLeft className="h-4 w-4" /> Go to Customers
          </Link>
        </div>
      </div>
    );
  }

  // --- loading skeleton --------------------------------------------------------
  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-7 w-24 rounded-full bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
          <div className="h-72 rounded-2xl bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  // --- hard error (customer unreadable / not found) -----------------------------
  if (error && !resolvedCustomer) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-6 py-14 text-center dark:border-red-900/60 dark:bg-red-950/30">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <h1 className="text-lg font-bold text-red-800 dark:text-red-200">Customer 360 unavailable</h1>
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={refresh}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-red-300 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Retry
            </button>
            <Link to="/EstimatorCustomers" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
              <ArrowLeft className="h-4 w-4" /> Customers
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const c = resolvedCustomer || {};
  const contact = primaryContactName(c);
  const balanceChip = backendReady && num(totals?.balance) > 0
    ? badge(`Balance ${usd(totals.balance)}`, "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300")
    : null;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      {/* header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-bold text-slate-900 dark:text-slate-100">
              {customerName(c)}
            </h1>
            <HeaderBadge value={c.customer_status} />
            {num(c.pricing_tier) > 0 &&
              badge(`Tier ${num(c.pricing_tier)}`, "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300")}
            {c.tax_exempt &&
              badge("Tax exempt", "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300")}
            {c.credit_hold &&
              badge("Credit hold", "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300")}
            {clean(c.master_account) &&
              badge("Master account", "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200")}
            {num(c.in_store_credit) > 0 &&
              badge(`Store credit ${usd(c.in_store_credit)}`, "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300")}
            {c.require_purchase_order &&
              badge("PO required", "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")}
            {c.is_active === false &&
              badge("Archived", "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300")}
            {balanceChip}
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {[contact && `Contact: ${contact}`, clean(c.contact_email), clean(c.company_phone), clean(c.salesperson) && `Rep: ${clean(c.salesperson)}`]
              .filter(Boolean)
              .join(" · ") || "Customer 360 hub — estimates, jobs, financials and CRM in one place."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            title="Reload the customer and every list"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
          <Link
            to={`/CustomerStatements?customer=${customerId}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ScrollText className="h-4 w-4" /> Statement
          </Link>
          <Link
            to={`/NewAllInOneEstimate?customer=${customerId}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700"
          >
            <FilePlus2 className="h-4 w-4" /> New estimate
          </Link>
        </div>
      </div>

      {/* degraded / error notices */}
      {backendMissing && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Customer 360 backend not deployed yet — showing the customer record plus the
            staff-readable lists (estimates, jobs, locations, activity). Invoices, payments,
            purchase orders, change orders, opportunities and contacts appear once the
            workspace action is live.
          </span>
        </div>
      )}
      {error && resolvedCustomer && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {data?.customer?.merged_into_customer_id && (
        <div className="mb-3 rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          This record was merged into another customer — showing it for audit only.
        </div>
      )}

      {/* KPI strip */}
      <KpiStrip items={kpiItems} />

      {/* tabs */}
      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              tab === t.key
                ? "border-violet-600 text-violet-700 dark:text-violet-300"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "overview" && (
          <OverviewTab data={data || {}} customer={c} backendReady={backendReady} truncatedNotice={truncatedNotice} />
        )}
        {tab === "estimates" && <EstimatesTab data={data || {}} truncatedNotice={truncatedNotice} />}
        {tab === "jobs" && <JobsTab data={data || {}} truncatedNotice={truncatedNotice} />}
        {tab === "financials" && (
          <FinancialsTab data={data || {}} backendReady={backendReady} truncatedNotice={truncatedNotice} />
        )}
        {tab === "activity" && (
          <ActivityTab data={data || {}} backendReady={backendReady} truncatedNotice={truncatedNotice} />
        )}
        {tab === "contacts" && (
          <ContactsTab data={data || {}} customer={c} backendReady={backendReady} truncatedNotice={truncatedNotice} />
        )}
      </div>
    </div>
  );
}
