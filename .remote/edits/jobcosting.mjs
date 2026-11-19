// Edits for src/pages/JobCosting.jsx — UI-kit adoption.
export default [
  // 1. Kit import; drop Link (all deep-links -> RecordLink) and Search
  //    (FilterSearchInput carries its own icon).
  {
    old: `import { useAuth } from "@/components/auth/EmailGate";
import { Link } from "react-router-dom";
import SavedViews from "@/components/workflow/SavedViews";`,
    new: `import { useAuth } from "@/components/auth/EmailGate";
import SavedViews from "@/components/workflow/SavedViews";`,
  },
  {
    old: `import {
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
} from "lucide-react";`,
    new: `import {
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
} from "lucide-react";`,
  },
  // 2. inputCls was only used by the filter-row search input (now
  //    FilterSearchInput) — the const is dead, drop it.
  {
    old: `const inputCls = "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

const invokeAction`,
    new: `const invokeAction`,
  },
  // 3. Detail modal title + customer -> RecordLink.
  {
    old: `                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  <Link className="hover:underline" to={\`/JobWorkspace?wo=\${workOrderId}\`}>{j.title || "Work order"}</Link>
                </h2>
                <div className="mt-0.5 text-sm text-slate-500">
                  {clean(detail?.work_order?.customer_id) ? (
                    <Link className="text-sky-600 hover:underline dark:text-sky-400" to={\`/Customer360?id=\${detail.work_order.customer_id}\`}>{j.client_name}</Link>
                  ) : j.client_name} · {j.current_stage || j.sales_status || "—"}
                </div>`,
    new: `                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  <RecordLink kind="workorder" id={workOrderId} className="text-slate-900 hover:underline dark:text-slate-100">{j.title || "Work order"}</RecordLink>
                </h2>
                <div className="mt-0.5 text-sm text-slate-500">
                  {clean(detail?.work_order?.customer_id) ? (
                    <RecordLink kind="customer" id={detail.work_order.customer_id}>{j.client_name}</RecordLink>
                  ) : j.client_name} · {j.current_stage || j.sales_status || "—"}
                </div>`,
  },
  // 4. Detail modal rollup grids -> KpiStrip.
  {
    old: `            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
              {[
                ["Contract", usd(j.contract_value), j.co_delta ? \`incl. \${usd(j.co_delta)} CO\` : ""],
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
            </div>`,
    new: `            <KpiStrip
              className="mt-4"
              tiles={[
                { label: "Contract", value: usd(j.contract_value), hint: j.co_delta ? \`incl. \${usd(j.co_delta)} CO\` : "" },
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
            />`,
  },
  // 5. Detail modal invoice/PO/CO rows -> RecordLink + StatusChip.
  {
    old: `                {(detail.invoices || []).map((i) => (
                  <div key={i.id} className="mt-1 flex justify-between text-sm">
                    <span>{i.invoice_number} <span className="text-xs text-slate-400">({i.status})</span></span>
                    <span>{usd(i.balance_due)} due</span>
                  </div>
                ))}`,
    new: `                {(detail.invoices || []).map((i) => (
                  <div key={i.id} className="mt-1 flex justify-between text-sm">
                    <span><RecordLink kind="invoice" id={i.id}>{i.invoice_number}</RecordLink> <StatusChip status={i.status} size="sm" /></span>
                    <span>{usd(i.balance_due)} due</span>
                  </div>
                ))}`,
  },
  {
    old: `                {(detail.purchase_orders || []).map((p) => (
                  <div key={p.id} className="mt-1 flex justify-between text-sm">
                    <span>{p.po_number} · {p.vendor_name} <span className="text-xs text-slate-400">({p.status})</span></span>
                    <span>{usd(p.total)}</span>
                  </div>
                ))}`,
    new: `                {(detail.purchase_orders || []).map((p) => (
                  <div key={p.id} className="mt-1 flex justify-between text-sm">
                    <span><RecordLink kind="po" id={p.id}>{p.po_number}</RecordLink> · {p.vendor_name} <StatusChip status={p.status} size="sm" /></span>
                    <span>{usd(p.total)}</span>
                  </div>
                ))}`,
  },
  {
    old: `                {(detail.change_orders || []).map((c) => (
                  <div key={c.id} className="mt-1 flex justify-between text-sm">
                    <span>{c.change_order_number} · {c.title} <span className="text-xs text-slate-400">({c.status})</span></span>
                    <MarginCell value={c.amount_delta} />
                  </div>
                ))}`,
    new: `                {(detail.change_orders || []).map((c) => (
                  <div key={c.id} className="mt-1 flex justify-between text-sm">
                    <span>{c.change_order_number} · {c.title} <StatusChip status={c.status} size="sm" /></span>
                    <MarginCell value={c.amount_delta} />
                  </div>
                ))}`,
  },
  // 6. Page header -> PageHeader (Export CSV joins Refresh in actions).
  {
    old: `      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-violet-600" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Job Costing</h1>
            <button type="button" onClick={exportCsv} disabled={sorted.length === 0} className="h-7 px-2.5 rounded border border-slate-300 bg-white text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">Export CSV</button>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Estimate vs actual: contract, POs, labor, invoicing per job. Click a row to expand.</p>
        </div>
        <button type="button" onClick={load} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
          <RefreshCw className={\`h-4 w-4 \${loading ? "animate-spin" : ""}\`} />Refresh
        </button>
      </div>`,
    new: `      <PageHeader
        breadcrumbs={[{ label: "Financials", to: "/Financials" }, { label: "Job Costing" }]}
        icon={BarChart3}
        title="Job Costing"
        subtitle="Estimate vs actual: contract, POs, labor, invoicing per job. Click a row to expand."
        actions={(
          <>
            <button type="button" onClick={exportCsv} disabled={sorted.length === 0} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Export CSV</button>
            <button type="button" onClick={load} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
              <RefreshCw className={\`h-4 w-4 \${loading ? "animate-spin" : ""}\`} />Refresh
            </button>
          </>
        )}
      />`,
  },
  // 7. Totals strip -> KpiStrip.
  {
    old: `      {totals && (
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
      )}`,
    new: `      {totals && (
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
      )}`,
  },
  // 8. Filter row -> FilterBar (checkbox = children, SavedViews = views).
  {
    old: `      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className={\`\${inputCls} pl-9\`} value={query} onChange={(e) => { setViewName(""); setQuery(e.target.value); }} placeholder="Search job or client…" />
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
      </div>`,
    new: `      <FilterBar
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
      </FilterBar>`,
  },
  // 9. List table -> DataTableShell (Fragment rows preserved, sort header Th).
  {
    old: `      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
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
            <tbody>`,
    new: `      {loading && jobs.length === 0 ? (
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
        >`,
  },
  // 10. Main row -> Tr/Td (expansion row keeps its own markup inside the
  //     Fragment — the shell's tbody styles it consistently).
  {
    old: `                    <tr
                      id={\`job-\${j.work_order_id}\`}
                      onClick={() => setExpandedId(expanded ? "" : j.work_order_id)}
                      className={\`cursor-pointer border-t border-slate-100 hover:bg-violet-50/50 dark:border-slate-800 dark:hover:bg-slate-800/50 \${highlightId === j.work_order_id ? "bg-violet-100/70 dark:bg-violet-900/30" : expanded ? "bg-violet-50/70 dark:bg-slate-800/70" : ""}\`}
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
                      <td className="px-2 py-2.5 text-slate-400"><ChevronRight className={\`h-4 w-4 transition-transform \${expanded ? "rotate-90" : ""}\`} /></td>
                    </tr>`,
    new: `                    <Tr
                      id={\`job-\${j.work_order_id}\`}
                      onClick={() => setExpandedId(expanded ? "" : j.work_order_id)}
                      className={\`cursor-pointer \${highlightId === j.work_order_id ? "bg-violet-100/70 dark:bg-violet-900/30" : expanded ? "bg-violet-50/70 dark:bg-slate-800/70" : ""}\`}
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
                      <Td className="px-2 text-slate-400"><ChevronRight className={\`h-4 w-4 transition-transform \${expanded ? "rotate-90" : ""}\`} /></Td>
                    </Tr>`,
  },
  // 11. Close out the tbody/table/wrapper -> DataTableShell close tag.
  {
    old: `            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-400">`,
    new: `        </DataTableShell>
      )}
      <p className="mt-2 text-xs text-slate-400">`,
  },
  // 12. Workspace deep-link -> RecordLink (keeps its bordered-chip look).
  {
    old: `                              <Link
                                to={\`/JobWorkspace?wo=\${j.work_order_id}\`}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-400"
                              >
                                Workspace
                              </Link>`,
    new: `                              <RecordLink
                                kind="workorder"
                                id={j.work_order_id}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-400"
                              >
                                Workspace
                              </RecordLink>`,
  },
];
