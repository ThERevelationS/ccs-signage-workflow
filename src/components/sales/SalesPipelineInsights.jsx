import { AlertTriangle, CheckCircle2, Clock3, DatabaseZap, Tags, UsersRound } from "lucide-react";

const money = (value) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
}).format(Number(value) || 0);

const pct = (part, total) => total > 0 ? Math.round((part / total) * 100) : 0;

function CoverageRow({ label, covered, total, note }) {
  const percent = pct(covered, total);
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">{covered}/{total} · {percent}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-slate-700 transition-all" style={{ width: `${percent}%` }} />
      </div>
      {note && <div className="mt-1 text-[11px] text-gray-400">{note}</div>}
    </div>
  );
}

export default function SalesPipelineInsights({ summary }) {
  const openCount = summary?.openCount || 0;
  const outcomeReady = (summary?.totalTrackedOutcomeCount || 0) > 0;
  const stageReady = (summary?.stageAgeCoverageCount || 0) === openCount && openCount > 0;

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Clock3 className="h-4 w-4" />Pipeline Age</div>
            <div className="mt-2 text-3xl font-bold text-slate-900">{summary?.averageAgeDays ?? 0}<span className="ml-1 text-sm font-medium text-slate-500">avg days</span></div>
            <div className="mt-1 text-xs text-slate-500">Oldest open opportunity: {summary?.oldestAgeDays ?? 0} days</div>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-800"><UsersRound className="h-4 w-4" />Ownership Coverage</div>
            <div className="mt-2 text-3xl font-bold text-blue-900">{pct(summary?.assignedOwnerCount || 0, openCount)}%</div>
            <div className="mt-1 text-xs text-blue-700/80">{summary?.assignedOwnerCount || 0} assigned · {summary?.unassignedOwnerCount || 0} unassigned</div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-800"><Tags className="h-4 w-4" />Lead Source Coverage</div>
            <div className="mt-2 text-3xl font-bold text-amber-900">{pct(summary?.sourceCoverageCount || 0, openCount)}%</div>
            <div className="mt-1 text-xs text-amber-700/80">{summary?.sourceCoverageCount || 0} populated · {summary?.sourceMissingCount || 0} missing</div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800"><UsersRound className="h-4 w-4 text-blue-600" />Current Owner Workload</div>
                <p className="mt-1 text-xs text-gray-500">Open opportunities only. This is workload visibility, not a performance ranking.</p>
              </div>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className="border-b text-gray-400"><th className="pb-2 font-medium">Owner</th><th className="pb-2 text-right font-medium">Opps</th><th className="pb-2 text-right font-medium">Open value</th><th className="pb-2 text-right font-medium">Due</th><th className="pb-2 text-right font-medium">90d+</th></tr></thead>
                <tbody>
                  {(summary?.ownerWorkload || []).map((row) => (
                    <tr key={row.owner} className="border-b border-gray-100 last:border-0">
                      <td className={`py-2.5 font-medium ${row.owner === "Unassigned" ? "text-amber-700" : "text-gray-800"}`}>{row.owner}</td>
                      <td className="py-2.5 text-right text-gray-600">{row.count}</td>
                      <td className="py-2.5 text-right text-gray-700">{money(row.value)}</td>
                      <td className={`py-2.5 text-right ${row.dueCount > 0 ? "font-semibold text-red-700" : "text-gray-500"}`}>{row.dueCount}</td>
                      <td className={`py-2.5 text-right ${row.age90Count > 0 ? "font-semibold text-rose-700" : "text-gray-500"}`}>{row.age90Count}</td>
                    </tr>
                  ))}
                  {(summary?.ownerWorkload || []).length === 0 && <tr><td colSpan="5" className="py-6 text-center text-gray-400">No open opportunities.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800"><Clock3 className="h-4 w-4 text-rose-600" />Opportunity Aging</div>
            <p className="mt-1 text-xs text-gray-500">Age is measured from the WorkOrder creation date, which is available for the current pipeline.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(summary?.agingBuckets || []).map((bucket) => (
                <div key={bucket.key} className={`rounded-lg border p-3 ${bucket.key === "90_plus" && bucket.count > 0 ? "border-rose-200 bg-rose-50" : "border-gray-100 bg-gray-50"}`}>
                  <div className="text-xs font-medium text-gray-500">{bucket.label}</div>
                  <div className="mt-1 text-2xl font-bold text-gray-900">{bucket.count}</div>
                  <div className="mt-1 text-[11px] text-gray-500">{money(bucket.value)}</div>
                </div>
              ))}
            </div>
            {(summary?.age90PlusCount || 0) > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{summary.age90PlusCount} open opportunit{summary.age90PlusCount === 1 ? "y is" : "ies are"} at least 90 days old. Review ownership, next action, and whether the deal should remain open.</span>
              </div>
            )}
          </section>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800"><Tags className="h-4 w-4 text-violet-600" />Lead Source Mix</div>
            <p className="mt-1 text-xs text-gray-500">This becomes source-performance reporting only after source and outcome coverage are strong enough.</p>
            {(summary?.sourceBreakdown || []).length === 0 ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-4 text-sm text-amber-800">No current opportunities have a lead source yet. Source rankings and conversion rates are intentionally hidden.</div>
            ) : (
              <div className="mt-3 space-y-2">
                {summary.sourceBreakdown.map((row) => (
                  <div key={row.source} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <span className="truncate font-medium text-gray-700">{row.source}</span>
                    <span className="whitespace-nowrap text-xs text-gray-500">{row.count} · {money(row.value)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800"><DatabaseZap className="h-4 w-4 text-teal-600" />Reporting Readiness</div>
            <div className="mt-3 space-y-3">
              <CoverageRow label="Sales owner" covered={summary?.assignedOwnerCount || 0} total={openCount} note="Needed for fair salesperson workload and performance reporting." />
              <CoverageRow label="Lead source" covered={summary?.sourceCoverageCount || 0} total={openCount} note="Needed for source conversion and source-value reporting." />
              <CoverageRow label="Probability" covered={summary?.ratedProbabilityCount || 0} total={openCount} note="Needed for complete weighted pipeline forecasting." />
              <CoverageRow label="Verified sales activity" covered={summary?.trackedActivityCount || 0} total={openCount} note="Needed for trustworthy stale-opportunity reporting." />
              <CoverageRow label="Stage-change timing" covered={summary?.stageAgeCoverageCount || 0} total={openCount} note="Days-in-stage is withheld until this tracking has meaningful coverage." />
            </div>
            <div className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${outcomeReady && stageReady ? "border-teal-200 bg-teal-50 text-teal-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
              {outcomeReady && stageReady ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />}
              <span>{outcomeReady ? `${summary.totalTrackedOutcomeCount} authoritative Won/Lost outcome${summary.totalTrackedOutcomeCount === 1 ? " is" : "s are"} available.` : "No authoritative modern Won/Lost outcomes exist yet."} {!stageReady && " Salesperson win-rate, source conversion, and days-in-stage rankings remain intentionally withheld until the underlying tracking is mature."}</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
