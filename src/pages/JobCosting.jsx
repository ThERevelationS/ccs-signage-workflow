import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import SavedViews from "@/components/workflow/SavedViews";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { downloadCsv } from "@/components/shared/exportCsv";
import ProgressBillingPanel from "@/components/jobcosting/ProgressBillingPanel";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

const clean = (v) => String(v ?? "").trim();
const usd = (n) => {
  const v = Number(n || 0);
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const hrs = (n) => `${Number(n || 0).toFixed(1)}h`;

const inputCls = "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

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
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{j.title || "Work order"}</h2>
                <div className="mt-0.5 text-sm text-slate-500">{j.client_name} · {j.current_stage || j.sales_status || "—"}</div>
              </div>
              <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
              {[
                ["Contract", usd(j.contract_value), j.co_delta ? `incl. ${usd(j.co_delta)} CO` : ""],
                ["PO committed", usd(j.po_committed), "materials + services"],
                ["Stock issued", usd(j.stock_issued), "from inventory"],
                ["Labor", hrs(j.labor_hours), "tracked segments"],
                ["Margin vs materials", "", ""],
              ].map(([label, val, sub], i) => (
                <div key={label} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</div>
                  <div className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100">
                    {i === 4 ? <MarginCell value={j.margin_vs_materials} /> : val}
                  </div>
                  {sub && <div className="text-xs text-slate-400">{sub}</div>}
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[["Invoiced", j.invoiced], ["Collected", j.collected], ["Open AR", j.open_ar]].map(([label, val]) => (
                <div key={label} className="rounded-xl border border-slate-200 p-3 text-center dark:border-slate-700">
                  <div className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</div>
                  <div className="text-base font-bold text-slate-900 dark:text-slate-100">{usd(val)}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Invoices</h3>
                {(detail.invoices || []).length === 0 && <div className="mt-1 text-xs text-slate-400">None</div>}
                {(detail.invoices || []).map((i) => (
                  <div key={i.id} className="mt-1 flex justify-between text-sm">
                    <span>{i.invoice_number} <span className="text-xs text-slate-400">({i.status})</span></span>
                    <span>{usd(i.balance_due)} due</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Purchase Orders</h3>
                {(detail.purchase_orders || []).length === 0 && <div className="mt-1 text-xs text-slate-400">None</div>}
                {(detail.purchase_orders || []).map((p) => (
                  <div key={p.id} className="mt-1 flex justify-between text-sm">
                    <span>{p.po_number} · {p.vendor_name} <span className="text-xs text-slate-400">({p.status})</span></span>
                    <span>{usd(p.total)}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Change Orders</h3>
                {(detail.change_orders || []).length === 0 && <div className="mt-1 text-xs text-slate-400">None</div>}
                {(detail.change_orders || []).map((c) => (
                  <div key={c.id} className="mt-1 flex justify-between text-sm">
                    <span>{c.change_order_number} · {c.title} <span className="text-xs text-slate-400">({c.status})</span></span>
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-violet-600" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Job Costing</h1>
            <button type="button" onClick={exportCsv} disabled={sorted.length === 0} className="h-7 px-2.5 rounded border border-slate-300 bg-white text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">Export CSV</button>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Estimate vs actual: contract, POs, labor, invoicing per job. Click a row to expand.</p>
        </div>
        <button type="button" onClick={load} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
        </button>
      </div>

      {totals && (
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-6">
          {[
            ["Contract value", usd(totals.contract_value)],
            ["PO committed", usd(totals.po_committed)],
            ["Stock issued", usd(totals.stock_issued)],
            ["Labor", hrs(totals.labor_hours)],
            ["Invoiced", usd(totals.invoiced)],
            ["Collected", usd(totals.collected)],
            ["Open AR", usd(totals.open_ar)],
          ].map(([label, val]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
              <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{val}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className={`${inputCls} pl-9`} value={query} onChange={(e) => { setViewName(""); setQuery(e.target.value); }} placeholder="Search job or client…" />
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <input type="checkbox" className="h-4 w-4 accent-violet-600" checked={activeOnly} onChange={(e) => { setViewName(""); setActiveOnly(e.target.checked); }} />
          Active jobs only
        </label>
        <SavedViews
          storageKey="views.job_costing"
          getState={() => ({ query, activeOnly })}
          activeName={viewName}
          onApply={(s, name) => { setQuery(s.query || ""); setActiveOnly(s.activeOnly !== false); setViewName(name || ""); }}
        />
      </div>

      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {loading && jobs.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading job costs…</div>
        ) : sorted.length === 0 ? (
          <div className="py-16 text-center text-slate-500">No jobs to show.</div>
        ) : (
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Job</th><th className="px-4 py-2.5">Client</th><th className="px-4 py-2.5">Stage</th>
                <th className="px-4 py-2.5 text-right">Contract</th><th className="px-4 py-2.5 text-right">PO</th>
                <th className="px-4 py-2.5 text-right">Stock</th><th className="px-4 py-2.5 text-right">Labor</th><th className="px-4 py-2.5 text-right">CO Δ</th>
                <th className="px-4 py-2.5 text-right">Invoiced</th><th className="px-4 py-2.5 text-right">Collected</th>
                <th className="px-4 py-2.5 text-right" aria-sort={marginSort === "asc" ? "ascending" : marginSort === "desc" ? "descending" : "none"}>
                  <button
                    type="button"
                    onClick={() => setMarginSort((s) => (s === "desc" ? "asc" : "desc"))}
                    className="inline-flex items-center gap-1 font-semibold uppercase text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    title="Sort by margin"
                  >
                    Margin
                    {marginSort === "asc" ? <ArrowUp className="h-3 w-3" /> : marginSort === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                  </button>
                </th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((j) => {
                const expanded = expandedId === j.work_order_id;
                return (
                  <Fragment key={j.work_order_id}>
                    <tr
                      id={`job-${j.work_order_id}`}
                      onClick={() => setExpandedId(expanded ? "" : j.work_order_id)}
                      className={`cursor-pointer border-t border-slate-100 hover:bg-violet-50/50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${highlightId === j.work_order_id ? "bg-violet-100/70 dark:bg-violet-900/30" : expanded ? "bg-violet-50/70 dark:bg-slate-800/70" : ""}`}
                    >
                      <td className="max-w-56 truncate px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-100">{j.title || "—"}</td>
                      <td className="max-w-48 truncate px-4 py-2.5 text-slate-600 dark:text-slate-300">{j.client_name || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{j.current_stage || j.sales_status || "—"}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{usd(j.contract_value)}</td>
                      <td className="px-4 py-2.5 text-right">{usd(j.po_committed)}</td>
                      <td className="px-4 py-2.5 text-right">{usd(j.stock_issued)}</td>
                      <td className="px-4 py-2.5 text-right">{hrs(j.labor_hours)}</td>
                      <td className="px-4 py-2.5 text-right"><MarginCell value={j.co_delta} /></td>
                      <td className="px-4 py-2.5 text-right">{usd(j.invoiced)}</td>
                      <td className="px-4 py-2.5 text-right">{usd(j.collected)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <MarginCell value={j.margin_vs_materials} /> <MarginPct job={j} />
                      </td>
                      <td className="px-2 py-2.5 text-slate-400"><ChevronRight className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} /></td>
                    </tr>
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
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Margin = contract value (estimate + approved/applied change orders) minus committed purchase orders. Labor shows tracked hours; labor cost rates are not yet applied.
      </p>

      {openId && <JobDetail sessionToken={sessionToken} workOrderId={openId} onClose={() => setOpenId("")} />}
    </div>
  );
}