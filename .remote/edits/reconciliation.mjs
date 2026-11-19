// Edits for src/pages/Reconciliation.jsx — UI-kit adoption.
export default [
  // 1. Kit import.
  {
    old: `import { loadGlLookup } from "@/components/shared/loadGlLookup";`,
    new: `import { loadGlLookup } from "@/components/shared/loadGlLookup";
import {
  DataTableShell,
  KpiStrip,
  PageHeader,
  StatusChip,
  Td,
  Tr,
} from "@/components/kit";`,
  },
  // 2. VarianceBadge -> kit StatusChip tones (Balanced=emerald, Over=sky,
  //    Short=red), preserving the amount-bearing labels.
  {
    old: `const VarianceBadge = ({ value }) => {
  const v = Number(value) || 0;
  if (Math.abs(v) < 0.005) return <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">Balanced</span>;
  return (
    <span className={\`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold \${v > 0 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300" : "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300"}\`}>
      {v > 0 ? "Over" : "Short"} {usd(Math.abs(v))}
    </span>
  );
};`,
    new: `const VarianceBadge = ({ value }) => {
  const v = Number(value) || 0;
  if (Math.abs(v) < 0.005) return <StatusChip tone="emerald" label="Balanced" />;
  return <StatusChip tone={v > 0 ? "sky" : "red"} label={\`\${v > 0 ? "Over" : "Short"} \${usd(Math.abs(v))}\`} />;
};`,
  },
  // 3. Page header -> PageHeader (Scale icon already imported for batch rows).
  {
    old: `      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Reconciliation</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Batched cash close — group payments, count tenders, track variance.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
            <RefreshCw className={\`h-4 w-4 \${loading ? "animate-spin" : ""}\`} />Refresh
          </button>
          <button onClick={() => setShowWizard(true)} disabled={unreconciled.length === 0}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
            <Plus className="h-4 w-4" />New Reconciliation
          </button>
        </div>
      </div>`,
    new: `      <PageHeader
        breadcrumbs={[{ label: "Financials", to: "/Financials" }, { label: "Reconciliation" }]}
        icon={Scale}
        title="Reconciliation"
        subtitle="Batched cash close — group payments, count tenders, track variance."
        actions={(
          <>
            <button onClick={load} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
              <RefreshCw className={\`h-4 w-4 \${loading ? "animate-spin" : ""}\`} />Refresh
            </button>
            <button onClick={() => setShowWizard(true)} disabled={unreconciled.length === 0}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
              <Plus className="h-4 w-4" />New Reconciliation
            </button>
          </>
        )}
      />`,
  },
  // 4. Rollup tiles -> KpiStrip.
  {
    old: `      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Unreconciled</div>
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{unreconciled.length} payment{unreconciled.length === 1 ? "" : "s"}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Waiting to close</div>
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{usd(pendingTotal)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Batches closed</div>
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{batches.length}</div>
        </div>
      </div>`,
    new: `      <KpiStrip
        className="lg:grid-cols-3"
        tiles={[
          { label: "Unreconciled", value: \`\${unreconciled.length} payment\${unreconciled.length === 1 ? "" : "s"}\` },
          { label: "Waiting to close", value: usd(pendingTotal) },
          { label: "Batches closed", value: batches.length },
        ]}
      />`,
  },
  // 5. Batch table -> DataTableShell (empty state gains the wizard CTA).
  {
    old: `      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {loading && batches.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading batches…</div>
        ) : batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <Vault className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
            {unreconciled.length === 0
              ? "No reconciliation batches yet — recorded payments will appear here once collected."
              : \`No batches yet. \${unreconciled.length} payment\${unreconciled.length === 1 ? "" : "s"} (\${usd(pendingTotal)}) waiting — start a New Reconciliation to close them.\`}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Batch</th><th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Location</th><th className="px-4 py-2.5 text-right">Payments</th>
                <th className="px-4 py-2.5 text-right">Collected</th><th className="px-4 py-2.5">Variance</th>
                <th className="px-4 py-2.5">By</th><th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} onClick={() => setOpenId(b.id)} className="cursor-pointer border-t border-slate-100 hover:bg-violet-50/50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                    <span className="inline-flex items-center gap-1.5"><Scale className="h-3.5 w-3.5 text-violet-500" />{b.batch_number}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{fmtDate(b.closed_at)}</td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{b.location || "—"}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{b.payment_count}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{usd(b.collected_total)}</td>
                  <td className="px-4 py-2.5"><VarianceBadge value={b.variance} /></td>
                  <td className="px-4 py-2.5 text-slate-500">{b.created_by || "—"}</td>
                  <td className="px-2 py-2.5 text-slate-400"><ChevronRight className="h-4 w-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>`,
    new: `      {loading && batches.length === 0 ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-slate-500 dark:border-slate-700 dark:bg-slate-900"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading batches…</div>
      ) : (
        <DataTableShell
          head={["Batch", "Date", "Location", { label: "Payments", className: "text-right" }, { label: "Collected", className: "text-right" }, "Variance", "By", { label: "", className: "px-2" }]}
          isEmpty={batches.length === 0}
          emptyState={unreconciled.length === 0
            ? { icon: Vault, title: "No reconciliation batches yet.", message: "Recorded payments will appear here once collected." }
            : { icon: Vault, title: "No batches yet.", message: \`\${unreconciled.length} payment\${unreconciled.length === 1 ? "" : "s"} (\${usd(pendingTotal)}) waiting — start a New Reconciliation to close them.\`, actionLabel: "New Reconciliation", onAction: () => setShowWizard(true) }}
        >
          {batches.map((b) => (
            <Tr key={b.id} onClick={() => setOpenId(b.id)} className="cursor-pointer">
              <Td className="font-semibold text-slate-900 dark:text-slate-100">
                <span className="inline-flex items-center gap-1.5"><Scale className="h-3.5 w-3.5 text-violet-500" />{b.batch_number}</span>
              </Td>
              <Td className="text-slate-500">{fmtDate(b.closed_at)}</Td>
              <Td className="text-slate-700 dark:text-slate-300">{b.location || "—"}</Td>
              <Td className="text-right text-slate-500">{b.payment_count}</Td>
              <Td className="text-right font-medium">{usd(b.collected_total)}</Td>
              <Td><VarianceBadge value={b.variance} /></Td>
              <Td className="text-slate-500">{b.created_by || "—"}</Td>
              <Td className="px-2 text-slate-400"><ChevronRight className="h-4 w-4" /></Td>
            </Tr>
          ))}
        </DataTableShell>
      )}`,
  },
];
