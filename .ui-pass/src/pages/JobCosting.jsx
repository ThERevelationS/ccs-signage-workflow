import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import SavedViews from "@/components/workflow/SavedViews";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { downloadCsv } from "@/components/shared/exportCsv";
import ProgressBillingPanel from "@/components/jobcosting/ProgressBillingPanel";
import {
  DataTableShell,
  FilterBar,
  FilterSearchInput,
  KpiStrip,
  PageHeader,
  RecordLink,
  StatusChip,
  Td,
  Th,
  Tr,
} from "@/components/kit";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";

const clean = (v) => String(v ?? "").trim();
const usd = (n) => {
  const v = Number(n || 0);
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const hrs = (n) => `${Number(n || 0).toFixed(1)}h`;

const invokeAction = async (sessionToken, body) => {
  const r = await base44.functions.invoke("jobCostingAction", { session_token: sessionToken, ...body });
  const data = r?.data || r;
  if (!data?.success) throw new Error(data?.error || "Request failed.");
  return data;
};

function MarginCell({ value }) {
  const v = Number(value) || 0;
  return <span className={`font-semibold ${v < 0 ? "text-red-600" : "text-emerald-600"}`}>{usd(v)}</span>;
}

function MarginPct({ job }) {
  const contract = Number(job?.contract_value) || 0;
  if (!contract) return null;
  const pct = ((Number(job?.margin_vs_materials) || 0) / contract) * 100;
  return (
    <span className={`text-[10px] font-semibold ${pct < 0 ? "text-red-500" : "text-emerald-600"}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

function JobDetail({ sessionToken, workOrderId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await invokeAction(sessionToken, { action: "get_job_cost", work_order_id: workOrderId }));
      setError("");
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, workOrderId]);

  useEffect(() => { load(); }, [load]);

  const j = detail?.job;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        {loading && !detail ? (
          <TableSkeleton columns={6} rows={8} />
        ) : !j ? (
          <div className="py-8 text-center text-sm text-red-600">{error || "Job not found."}</div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  <RecordLink kind="workorder" id={workOrderId} className="text-slate-900 hover:underline dark:text-slate-100">{j.title || "Work order"}</RecordLink>
                </h2>
                <div className="mt-0.5 text-sm text-slate-500">
                  {clean(detail?.work_order?.customer_id) ? (
                    <RecordLink kind="customer" id={detail.work_order.customer_id}>{j.client_name}</RecordLink>
                  ) : j.client_name} · {j.current_stage || j.sales_status || "—"}
                </div>
              </div>
              <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
            </div>

            <KpiStrip
              className="mt-4"
              tiles={[
                { label: "Contract", value: usd(j.contract_value), hint: j.co_delta ? `incl. ${usd(j.co_delta)} CO` : "" },
                { label: "PO committed", value: usd(j.po_committed), hint: "materials + services" },
                { label: "Stock issued", value: usd(j.stock_issued), hint: "from inventory" },
                { label: "Labor", value: hrs(j.labor_hours), hint: "tracked segments" },
                { label: "Margin vs materials", value: <MarginCell value={j.margin_vs_materials} /> },
              ]}
            />
            <KpiStrip
              className="mt-2 lg:grid-cols-3"
              tiles={[
                { label: "Invoiced", value: usd(j.invoiced) },
                { label: "Collected", value: usd(j.collected) },
                { label: "Open AR", value: usd(j.open_ar) },
              ]}
            />

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Invoices</h3>
                {(detail.invoices || []).length === 0 && <div className="mt-1 text-xs text-slate-400">None</div>}
                {(detail.invoices || []).map((i) => (
                  <div key={i.id} className="mt-1 flex justify-between text-sm">
                    <span><RecordLink kind="invoice" id={i.id}>{i.invoice_number}</RecordLink> <StatusChip status={i.status} size="sm" /></span>
                    <span>{usd(i.balance_due)} due</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Purchase Orders</h3>
                {(detail.purchase_orders || []).length === 0 && <div className="mt-1 text-xs text-slate-400">None</div>}
                {(detail.purchase_orders || []).map((p) => (
                  <div key={p.id} className="mt-1 flex justify-between text-sm">
                    <span><RecordLink kind="po" id={p.id}>{p.po_number}</RecordLink> · {p.vendor_name} <StatusChip status={p.status} size="sm" /></span>
                    <span>{usd(p.total)}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Change Orders</h3>
                {(detail.change_orders || []).length === 0 && <div className="mt-1 text-xs text-slate-400">None</div>}
                {(detail.change_orders || []).map((c) => (
                  <div key={c.id} className="mt-1 flex justify-between text-sm">
                    <span>{c.change_order_number} · {c.title} <StatusChip status={c.status} size="sm" /></span>
                    <MarginCell value={c.amount_delta} />
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Stock issued / returned</h3>
                {(detail.stock_movements || []).length === 0 && <div className="mt-1 text-xs text-slate-400">None</div>}
                {(detail.stock_movements || []).map((m) => (
                  <div key={m.id} className="mt-1 flex justify-between text-sm">
                    <span>{m.item_label} <span className="text-xs text-slate-400">({m.reason} {Math.abs(m.delta)})</span></span>
                    <span>{usd(m.issued_cost)}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Labor by person</h3>
                {(detail.labor_by_user || []).length === 0 && <div className="mt-1 text-xs text-slate-400">No tracked time</div>}
                {(detail.labor_by_user || []).map((l) => (
                  <div key={l.user} className="mt-1 flex justify-between text-sm">
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-slate-400" />{l.user}</span>
                    <span>{hrs(l.hours)}</span>
                  </div>
                ))}
              </div>
              <ProgressBillingPanel sessionToken={sessionToken} job={j} workOrder={detail.work_order} onChanged={load} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function JobCosting() {
  const { sessionToken, isRegistered } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [totals, setTotals] = useState(null);
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [viewName, setViewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [highlightId, setHighlightId] = useState("");
  const [marginSort, setMarginSort] = useState(null);
  const [deepLinked, setDeepLinked] = useState(false);

  const jobParam = useMemo(() => new URLSearchParams(window.location.search).get("job") || "", []);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    setError("");
    try {
      const data = await invokeAction(sessionToken, { action: "list_job_costs", query });
      setJobs(data.jobs || []);
      setTotals(data.totals || null);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, query]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!jobParam || deepLinked || jobs.length === 0) return;
    setDeepLinked(true);
    const hit = jobs.find((j) => j.work_order_id === jobParam);
    if (!hit) return;
    if (hit.current_stage === "completed" || hit.sales_status === "lost") setActiveOnly(false);
    setExpandedId(hit.work_order_id);
    setHighlightId(hit.work_order_id);
    window.setTimeout(() => {
      document.getElementById(`job-${hit.work_order_id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 150);
  }, [jobParam, deepLinked, jobs]);

  if (!isRegistered) return null;

  const visible = activeOnly ? jobs.filter((j) => j.current_stage !== "completed" && j.sales_status !== "lost") : jobs;
  const sorted = marginSort
    ? [...visible].sort((a, b) => {
        const d = (Number(a.margin_vs_materials) || 0) - (Number(b.margin_vs_materials) || 0);
        return marginSort === "asc" ? d : -d;
      })
    : visible;

  const exportCsv = () => {
    downloadCsv("job-costing.csv",
      ["Job", "Customer", "Stage", "Estimated", "Change Orders", "Contract Value", "PO Committed", "Stock Issued", "Labor Hours", "Invoiced", "Collected", "Margin"],
      sorted.map((j) => [
        j.title || "", j.client_name || "", j.current_stage || j.sales_status || "",
        j.estimated_amount ?? "", j.co_delta ?? "", j.contract_value ?? "", j.po_committed ?? "",
        j.stock_issued ?? "", j.labor_hours ?? "", j.invoiced ?? "", j.collected ?? "", j.margin_vs_materials ?? "",
      ]));
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <PageHeader
        breadcrumbs={[{ label: "Financials", to: "/Financials" }, { label: "Job Costing" }]}
        icon={BarChart3}
        title="Job Costing"
        subtitle="Estimate vs actual: contract, POs, labor, invoicing per job. Click a row to expand."
        actions={(
          <>
            <button type="button" onClick={exportCsv} disabled={sorted.length === 0} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Export CSV</button>
            <button type="button" onClick={load} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
            </button>
          </>
        )}
      />

      {totals && (
        <KpiStrip
          tiles={[
            { label: "Contract value", value: usd(totals.contract_value) },
            { label: "PO committed", value: usd(totals.po_committed) },
            { label: "Stock issued", value: usd(totals.stock_issued) },
            { label: "Labor", value: hrs(totals.labor_hours) },
            { label: "Invoiced", value: usd(totals.invoiced) },
            { label: "Collected", value: usd(totals.collected) },
            { label: "Open AR", value: usd(totals.open_ar) },
          ]}
        />
      )}

      <FilterBar
        search={(
          <FilterSearchInput value={query} onChange={(e) => { setViewName(""); setQuery(e.target.value); }} placeholder="Search job or client…" />
        )}
        views={(
          <SavedViews
            storageKey="views.job_costing"
            getState={() => ({ query, activeOnly })}
            activeName={viewName}
            onApply={(s, name) => { setQuery(s.query || ""); setActiveOnly(s.activeOnly !== false); setViewName(name || ""); }}
          />
        )}
      >
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <input type="checkbox" className="h-4 w-4 accent-violet-600" checked={activeOnly} onChange={(e) => { setViewName(""); setActiveOnly(e.target.checked); }} />
          Active jobs only
        </label>
      </FilterBar>

      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

      {loading && jobs.length === 0 ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-slate-500 dark:border-slate-700 dark:bg-slate-900"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading job costs…</div>
      ) : (
        <DataTableShell
          tableClassName="min-w-[960px]"
          head={[
            "Job", "Client", "Stage",
            { label: "Contract", className: "text-right" }, { label: "PO", className: "text-right" },
            { label: "Stock", className: "text-right" }, { label: "Labor", className: "text-right" }, { label: "CO Δ", className: "text-right" },
            { label: "Invoiced", className: "text-right" }, { label: "Collected", className: "text-right" },
            <Th key="margin" className="text-right" aria-sort={marginSort === "asc" ? "ascending" : marginSort === "desc" ? "descending" : "none"}>
              <button
                type="button"
                onClick={() => setMarginSort((s) => (s === "desc" ? "asc" : "desc"))}
                className="inline-flex items-center gap-1 font-semibold uppercase text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                title="Sort by margin"
              >
                Margin
                {marginSort === "asc" ? <ArrowUp className="h-3 w-3" /> : marginSort === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
              </button>
            </Th>,
            { label: "", className: "px-2" },
          ]}
          isEmpty={sorted.length === 0}
          emptyState={activeOnly && jobs.length > 0
            ? { icon: BarChart3, title: "No active jobs to show.", message: "Only active jobs are shown — uncheck the filter to include completed or lost jobs.", actionLabel: "Show all jobs", onAction: () => setActiveOnly(false) }
            : { icon: BarChart3, title: "No jobs to show.", message: "Jobs appear once work orders carry estimates and committed costs." }}
        >
              {sorted.map((j) => {
                const expanded = expandedId === j.work_order_id;
                return (
                  <Fragment key={j.work_order_id}>
                    <Tr
                      id={`job-${j.work_order_id}`}
                      onClick={() => setExpandedId(expanded ? "" : j.work_order_id)}
                      className={`cursor-pointer ${highlightId === j.work_order_id ? "bg-violet-100/70 dark:bg-violet-900/30" : expanded ? "bg-violet-50/70 dark:bg-slate-800/70" : ""}`}
                    >
                      <Td className="max-w-56 truncate font-semibold text-slate-900 dark:text-slate-100">{j.title || "—"}</Td>
                      <Td className="max-w-48 truncate text-slate-600 dark:text-slate-300">{j.client_name || "—"}</Td>
                      <Td className="text-xs text-slate-500">{j.current_stage || j.sales_status || "—"}</Td>
                      <Td className="text-right font-medium">{usd(j.contract_value)}</Td>
                      <Td className="text-right">{usd(j.po_committed)}</Td>
                      <Td className="text-right">{usd(j.stock_issued)}</Td>
                      <Td className="text-right">{hrs(j.labor_hours)}</Td>
                      <Td className="text-right"><MarginCell value={j.co_delta} /></Td>
                      <Td className="text-right">{usd(j.invoiced)}</Td>
                      <Td className="text-right">{usd(j.collected)}</Td>
                      <Td className="text-right">
                        <MarginCell value={j.margin_vs_materials} /> <MarginPct job={j} />
                      </Td>
                      <Td className="px-2 text-slate-400"><ChevronRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} /></Td>
                    </Tr>
                    {expanded && (
                      <tr className="border-t border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/40">
                        <td colSpan={12} className="px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs sm:grid-cols-3">
                              {[
                                ["Estimate", usd(j.estimated_amount)],
                                ["Change orders", usd(j.co_delta)],
                                ["Contract value", usd(j.contract_value)],
                                ["PO committed", usd(j.po_committed)],
                                ["Stock issued", usd(j.stock_issued)],
                                ["Labor", hrs(j.labor_hours)],
                                ["Invoiced", usd(j.invoiced)],
                                ["Collected", usd(j.collected)],
                                ["Open AR", usd(j.open_ar)],
                              ].map(([label, val]) => (
                                <div key={label} className="flex items-baseline justify-between gap-3">
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
                                  <span className="font-medium text-slate-800 dark:text-slate-200">{val}</span>
                                </div>
                              ))}
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Margin vs materials</div>
                                <div><MarginCell value={j.margin_vs_materials} /> <MarginPct job={j} /></div>
                              </div>
                              <RecordLink
                                kind="workorder"
                                id={j.work_order_id}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-400"
                              >
                                Workspace
                              </RecordLink>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setOpenId(j.work_order_id); }}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                Full detail
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
        </DataTableShell>
      )}
      <p className="mt-2 text-xs text-slate-400">
        Margin = contract value (estimate + approved/applied change orders) minus committed purchase orders. Labor shows tracked hours; labor cost rates are not yet applied.
      </p>

      {openId && <JobDetail sessionToken={sessionToken} workOrderId={openId} onClose={() => setOpenId("")} />}
    </div>
  );
}