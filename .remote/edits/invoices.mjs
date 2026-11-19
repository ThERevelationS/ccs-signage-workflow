// Edits for src/pages/Invoices.jsx — UI-kit adoption.
export default [
  // 1. Kit import after SavedViews import.
  {
    old: `import SavedViews from "@/components/workflow/SavedViews";
import {
  AlertCircle,`,
    new: `import SavedViews from "@/components/workflow/SavedViews";
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
  filterInputCls,
} from "@/components/kit";
import {
  AlertCircle,`,
  },
  // 2. Drop local STATUS_STYLES; alias inputCls to the kit vocabulary.
  {
    old: `const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300",
  partially_paid: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
  void: "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300",
};
const METHOD_LABELS`,
    new: `const METHOD_LABELS`,
  },
  {
    old: `const inputCls = "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const labelCls`,
    new: `// Shared kit input vocabulary (adds placeholder styling over the old copy).
const inputCls = filterInputCls;
const labelCls`,
  },
  // 3. StatusBadge renders through kit StatusChip (STATUS_LABELS retained for
  //    the filter pills below; label prop preserves exact wording).
  {
    old: `function StatusBadge({ status }) {
  const s = clean(status) || "draft";
  return (
    <span className={\`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold \${STATUS_STYLES[s] || STATUS_STYLES.draft}\`}>
      {STATUS_LABELS[s] || s}
    </span>
  );
}`,
    new: `function StatusBadge({ status }) {
  const s = clean(status) || "draft";
  return <StatusChip status={s} label={STATUS_LABELS[s] || s} />;
}`,
  },
  // 4. Credit/refund amount chips in the detail header.
  {
    old: `                  {credits > 0 && (
                    <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">
                      Credit {usdSigned(-credits)}
                    </span>
                  )}
                  {refunds > 0 && (
                    <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-900/60 dark:text-rose-300">
                      Refunded {usdSigned(-refunds)}
                    </span>
                  )}`,
    new: `                  {credits > 0 && <StatusChip tone="violet" label={\`Credit \${usdSigned(-credits)}\`} />}
                  {refunds > 0 && <StatusChip tone="red" label={\`Refunded \${usdSigned(-refunds)}\`} />}`,
  },
  // 5. Customer deep-link in the detail header -> RecordLink.
  {
    old: `                  {clean(inv.customer_id) ? (
                    <Link className="text-sky-600 hover:underline dark:text-sky-400" to={\`/Customer360?id=\${inv.customer_id}\`}>{inv.customer_display_name || inv.customer_name || inv.customer_id}</Link>
                  ) : (inv.customer_display_name || inv.customer_name || "Unknown customer")}`,
    new: `                  {clean(inv.customer_id) ? (
                    <RecordLink kind="customer" id={inv.customer_id}>{inv.customer_display_name || inv.customer_name || inv.customer_id}</RecordLink>
                  ) : (inv.customer_display_name || inv.customer_name || "Unknown customer")}`,
  },
  // 6. Linked estimate/WO/opportunity rows -> RecordLink.
  {
    old: `                    {inv.estimate_id && <div>Estimate: <Link className="text-violet-600 hover:underline dark:text-violet-300" to={\`/EstimateDetail?id=\${inv.estimate_id}\`}>{inv.estimate_id}</Link></div>}
                    {inv.work_order_id && <div>WorkOrder: <Link className="text-violet-600 hover:underline dark:text-violet-300" to={\`/JobWorkspace?wo=\${inv.work_order_id}\`}>{inv.work_order_id}</Link></div>}
                    {inv.opportunity_id && <div>Opportunity: <Link className="text-violet-600 hover:underline dark:text-violet-300" to={\`/Opportunities?open=\${inv.opportunity_id}\`}>{inv.opportunity_id}</Link></div>}`,
    new: `                    {inv.estimate_id && <div>Estimate: <RecordLink kind="estimate" id={inv.estimate_id} /></div>}
                    {inv.work_order_id && <div>WorkOrder: <RecordLink kind="workorder" id={inv.work_order_id} /></div>}
                    {inv.opportunity_id && <div>Opportunity: <RecordLink kind="opportunity" id={inv.opportunity_id} /></div>}`,
  },
  // 7. CREDIT/REFUND/REFUNDED ledger tags -> StatusChip.
  {
    old: `                      {isCreditMemoRow(p) && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">CREDIT</span>}
                      {isRefundRow(p) && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-900/60 dark:text-rose-300">REFUND</span>}
                      {p.status === "refunded" && !clean(p.refund_of_payment_id) && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-900/60 dark:text-rose-300">REFUNDED</span>}`,
    new: `                      {isCreditMemoRow(p) && <StatusChip size="sm" tone="violet" label="CREDIT" />}
                      {isRefundRow(p) && <StatusChip size="sm" tone="red" label="REFUND" />}
                      {p.status === "refunded" && !clean(p.refund_of_payment_id) && <StatusChip size="sm" tone="red" label="REFUNDED" />}`,
  },
  // 8. Page header -> PageHeader (same four buttons move into actions).
  {
    old: `      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Invoices</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Accounts receivable — invoices, payments, aging.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
            <RefreshCw className={\`h-4 w-4 \${loading ? "animate-spin" : ""}\`} />Refresh
          </button>
          <button type="button" onClick={exportCsv} disabled={exporting} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Export CSV
          </button>
          <button type="button" onClick={() => setShowFromEstimate(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-violet-500 px-3 text-sm font-semibold text-violet-700 dark:text-violet-300">
            <Receipt className="h-4 w-4" />From Estimate
          </button>
          <button type="button" onClick={() => setShowCreate(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700">
            <Plus className="h-4 w-4" />New Invoice
          </button>
        </div>
      </div>`,
    new: `      <PageHeader
        breadcrumbs={[{ label: "Financials", to: "/Financials" }, { label: "Invoices" }]}
        icon={Receipt}
        title="Invoices"
        subtitle="Accounts receivable — invoices, payments, aging."
        actions={(
          <>
            <button type="button" onClick={load} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
              <RefreshCw className={\`h-4 w-4 \${loading ? "animate-spin" : ""}\`} />Refresh
            </button>
            <button type="button" onClick={exportCsv} disabled={exporting} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Export CSV
            </button>
            <button type="button" onClick={() => setShowFromEstimate(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-violet-500 px-3 text-sm font-semibold text-violet-700 dark:text-violet-300">
              <Receipt className="h-4 w-4" />From Estimate
            </button>
            <button type="button" onClick={() => setShowCreate(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700">
              <Plus className="h-4 w-4" />New Invoice
            </button>
          </>
        )}
      />`,
  },
  // 9. Aging strip -> KpiStrip (orange 31-60 step kept via a tinted value node).
  {
    old: `      {aging && (
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
          {[
            ["Open", aging.open_balance, \`\${aging.open_invoices} invoice\${aging.open_invoices === 1 ? "" : "s"}\`, "text-slate-900 dark:text-slate-100"],
            ["Current", aging.buckets?.current, "", "text-emerald-600"],
            ["1–30 days", aging.buckets?.days_1_30, "", "text-amber-600"],
            ["31–60 days", aging.buckets?.days_31_60, "", "text-orange-600"],
            ["60+ days", (aging.buckets?.days_61_90 || 0) + (aging.buckets?.days_90_plus || 0), "", "text-red-600"],
          ].map(([label, val, sub, cls]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
              <div className={\`text-lg font-bold \${cls}\`}>{usd(val)}</div>
              {sub && <div className="text-xs text-slate-500">{sub}</div>}
            </div>
          ))}
        </div>
      )}`,
    new: `      {aging && (
        <KpiStrip
          tiles={[
            { label: "Open", value: usd(aging.open_balance), hint: \`\${aging.open_invoices} invoice\${aging.open_invoices === 1 ? "" : "s"}\` },
            { label: "Current", value: usd(aging.buckets?.current), tone: "emerald" },
            { label: "1–30 days", value: usd(aging.buckets?.days_1_30), tone: "amber" },
            { label: "31–60 days", value: <span className="text-orange-600 dark:text-orange-400">{usd(aging.buckets?.days_31_60)}</span> },
            { label: "60+ days", value: usd((aging.buckets?.days_61_90 || 0) + (aging.buckets?.days_90_plus || 0)), tone: "red" },
          ]}
        />
      )}`,
  },
  // 10. Filter row -> FilterBar slots (pills = presets, SavedViews = views,
  //     conditional bulk buttons = actions).
  {
    old: `      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className={\`\${inputCls} pl-9\`} value={query} onChange={(e) => { setViewName(""); setQuery(e.target.value); }} placeholder="Search invoice # or customer…" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["", "draft", "sent", "partially_paid", "paid", "void"].map((s) => (
            <button type="button" key={s || "all"} onClick={() => { setViewName(""); setStatus(s); }}
              className={\`min-h-9 rounded-full px-3 text-xs font-semibold \${status === s ? "bg-violet-600 text-white" : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"}\`}>
              {s ? STATUS_LABELS[s] : "All"}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => { setViewName(""); setOverdueOnly((v) => !v); }}
          className={\`min-h-9 rounded-full px-3 text-xs font-semibold \${overdueOnly ? "bg-red-600 text-white" : "border border-red-300 text-red-600 dark:border-red-800 dark:text-red-400"}\`}>
          Overdue
        </button>
        {overdueCount > 0 && (
          <button type="button" onClick={remindAllOverdue} disabled={Boolean(busy)}
            title={\`Email a past-due reminder for all \${overdueCount} overdue invoice\${overdueCount === 1 ? "" : "s"}\`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-amber-300 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60 dark:border-amber-800 dark:text-amber-400">
            {busy === "remindAll" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            Remind all ({overdueCount})
          </button>
        )}
        {selected.size > 0 && (
          <button type="button" onClick={bulkIssue} disabled={Boolean(busy)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-blue-300 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60 dark:border-blue-800 dark:text-blue-400">
            {busy === "issueAll" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Issue selected ({selected.size})
          </button>
        )}
        <SavedViews
          storageKey="views.invoices"
          getState={() => ({ status, query, overdueOnly })}
          activeName={viewName}
          onApply={(s, name) => { setStatus(s.status || ""); setQuery(s.query || ""); setOverdueOnly(s.overdueOnly === true); setViewName(name || ""); }}
        />
      </div>`,
    new: `      <FilterBar
        search={(
          <FilterSearchInput value={query} onChange={(e) => { setViewName(""); setQuery(e.target.value); }} placeholder="Search invoice # or customer…" />
        )}
        presets={(
          <>
            <div className="flex flex-wrap gap-1.5">
              {["", "draft", "sent", "partially_paid", "paid", "void"].map((s) => (
                <button type="button" key={s || "all"} onClick={() => { setViewName(""); setStatus(s); }}
                  className={\`min-h-9 rounded-full px-3 text-xs font-semibold \${status === s ? "bg-violet-600 text-white" : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"}\`}>
                  {s ? STATUS_LABELS[s] : "All"}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { setViewName(""); setOverdueOnly((v) => !v); }}
              className={\`min-h-9 rounded-full px-3 text-xs font-semibold \${overdueOnly ? "bg-red-600 text-white" : "border border-red-300 text-red-600 dark:border-red-800 dark:text-red-400"}\`}>
              Overdue
            </button>
          </>
        )}
        views={(
          <SavedViews
            storageKey="views.invoices"
            getState={() => ({ status, query, overdueOnly })}
            activeName={viewName}
            onApply={(s, name) => { setStatus(s.status || ""); setQuery(s.query || ""); setOverdueOnly(s.overdueOnly === true); setViewName(name || ""); }}
          />
        )}
        actions={(
          <>
            {overdueCount > 0 && (
              <button type="button" onClick={remindAllOverdue} disabled={Boolean(busy)}
                title={\`Email a past-due reminder for all \${overdueCount} overdue invoice\${overdueCount === 1 ? "" : "s"}\`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-amber-300 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60 dark:border-amber-800 dark:text-amber-400">
                {busy === "remindAll" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                Remind all ({overdueCount})
              </button>
            )}
            {selected.size > 0 && (
              <button type="button" onClick={bulkIssue} disabled={Boolean(busy)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-blue-300 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60 dark:border-blue-800 dark:text-blue-400">
                {busy === "issueAll" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Issue selected ({selected.size})
              </button>
            )}
          </>
        )}
      />`,
  },
  // 11. List table -> DataTableShell (empty state gains a next-step CTA).
  {
    old: `      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {loading && invoices.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading invoices…</div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <FileText className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
            No invoices yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="w-8 px-2 py-2.5">
                  <input type="checkbox" title="Select all drafts" className="h-4 w-4 align-middle accent-blue-600"
                    checked={draftIds.length > 0 && draftIds.every((id) => selected.has(id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(draftIds) : new Set())} />
                </th>
                <th className="px-4 py-2.5">Invoice</th><th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Due</th><th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-right">Balance</th><th className="px-4 py-2.5">Status</th><th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {(overdueOnly ? invoices.filter((i) => Number(i.balance_due) > 0 && ["sent", "partially_paid"].includes(i.status) && i.due_date && i.due_date < today()) : invoices).map((inv) => {
                const overdue = Number(inv.balance_due) > 0 && ["sent", "partially_paid"].includes(inv.status) && inv.due_date && inv.due_date < today();
                return (
                <tr key={inv.id} onClick={() => setOpenId(inv.id)} className={\`cursor-pointer border-t border-slate-100 hover:bg-violet-50/50 dark:border-slate-800 dark:hover:bg-slate-800/50 \${overdue ? "bg-red-50/60 dark:bg-red-950/20" : ""}\`}>
                  <td className="w-8 px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {clean(inv.status) === "draft" ? (
                      <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={selected.has(inv.id)}
                        onChange={(e) => setSelected((s) => { const n = new Set(s); e.target.checked ? n.add(inv.id) : n.delete(inv.id); return n; })} />
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-100">{inv.invoice_number}</td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                    {clean(inv.customer_id) ? (
                      <Link className="text-sky-600 hover:underline dark:text-sky-400" to={\`/Customer360?id=\${inv.customer_id}\`} onClick={(e) => e.stopPropagation()}>
                        {inv.customer_display_name || inv.customer_name || inv.customer_id}
                      </Link>
                    ) : (inv.customer_display_name || inv.customer_name || "Unknown customer")}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {inv.due_date || "—"}
                    {overdue && <span className="ml-1.5 inline-flex rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-950/60 dark:text-red-300">Overdue</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">{usd(inv.total)}</td>
                  <td className={\`px-4 py-2.5 text-right font-medium \${overdue ? "text-red-700 dark:text-red-300" : ""}\`}>{usd(inv.balance_due)}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={inv.status} /></td>
                  <td className="px-2 py-2.5 text-slate-400"><ChevronRight className="h-4 w-4" /></td>
                </tr>
              );})}
            </tbody>
          </table>
        )}
      </div>`,
    new: `      {loading && invoices.length === 0 ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-slate-500 dark:border-slate-700 dark:bg-slate-900"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading invoices…</div>
      ) : (
        <DataTableShell
          head={[
            <Th key="sel" className="w-8 px-2">
              <input type="checkbox" title="Select all drafts" className="h-4 w-4 align-middle accent-blue-600"
                checked={draftIds.length > 0 && draftIds.every((id) => selected.has(id))}
                onChange={(e) => setSelected(e.target.checked ? new Set(draftIds) : new Set())} />
            </Th>,
            "Invoice", "Customer", "Due",
            { label: "Total", className: "text-right" },
            { label: "Balance", className: "text-right" },
            "Status",
            { label: "", className: "px-2" },
          ]}
          isEmpty={(overdueOnly ? overdueRows : invoices).length === 0}
          emptyState={overdueOnly && invoices.length > 0
            ? { icon: FileText, title: "No overdue invoices.", message: "Nothing past due right now — clear the Overdue filter to see all invoices." }
            : { icon: FileText, title: "No invoices yet.", message: "Create one directly or start from an approved estimate.", actionLabel: "New invoice", onAction: () => setShowCreate(true) }}
        >
          {(overdueOnly ? overdueRows : invoices).map((inv) => {
            const overdue = Number(inv.balance_due) > 0 && ["sent", "partially_paid"].includes(inv.status) && inv.due_date && inv.due_date < today();
            return (
            <Tr key={inv.id} onClick={() => setOpenId(inv.id)} className={\`cursor-pointer \${overdue ? "bg-red-50/60 dark:bg-red-950/20" : ""}\`}>
              <Td className="w-8 px-2" onClick={(e) => e.stopPropagation()}>
                {clean(inv.status) === "draft" ? (
                  <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={selected.has(inv.id)}
                    onChange={(e) => setSelected((s) => { const n = new Set(s); e.target.checked ? n.add(inv.id) : n.delete(inv.id); return n; })} />
                ) : null}
              </Td>
              <Td className="font-semibold text-slate-900 dark:text-slate-100">{inv.invoice_number}</Td>
              <Td className="text-slate-700 dark:text-slate-300">
                {clean(inv.customer_id) ? (
                  <RecordLink kind="customer" id={inv.customer_id} onClick={(e) => e.stopPropagation()}>
                    {inv.customer_display_name || inv.customer_name || inv.customer_id}
                  </RecordLink>
                ) : (inv.customer_display_name || inv.customer_name || "Unknown customer")}
              </Td>
              <Td className="text-slate-500">
                {inv.due_date || "—"}
                {overdue && <StatusChip status="overdue" size="sm" className="ml-1.5" />}
              </Td>
              <Td className="text-right font-medium">{usd(inv.total)}</Td>
              <Td className={\`text-right font-medium \${overdue ? "text-red-700 dark:text-red-300" : ""}\`}>{usd(inv.balance_due)}</Td>
              <Td><StatusBadge status={inv.status} /></Td>
              <Td className="px-2 text-slate-400"><ChevronRight className="h-4 w-4" /></Td>
            </Tr>
          );})}
        </DataTableShell>
      )}`,
  },
];
