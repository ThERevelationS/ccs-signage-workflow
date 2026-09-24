import { Badge } from "@/components/ui/badge";

function ReadOnlyJson({ title, value }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] font-semibold text-slate-700">{title}</div>
      <pre className="max-h-64 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-800">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default function SmartsheetControlledCreationProposalsCard({
  proposals,
  dataset,
  crossSheetConflicts = [],
}) {
  if (proposals?.state !== "ready") {
    return (
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <div className="font-semibold">Controlled creation proposals <Badge variant="outline">locked</Badge></div>
        <p className="mt-1">No proposals are available until this sheet has an intentionally captured rollout baseline and a fresh complete read-only row preview. Existing historical rows will not enter normal creation.</p>
      </div>
    );
  }

  const summary = proposals.summary || {};
  const rows = proposals.rows || [];
  const crossByRowId = new Map();
  for (const collision of crossSheetConflicts) {
    const rowIds = dataset === "sales" ? collision.sales_row_ids : collision.order_row_ids;
    for (const rowId of rowIds || []) {
      const matches = crossByRowId.get(rowId) || [];
      matches.push(collision);
      crossByRowId.set(rowId, matches);
    }
  }

  const customerGroups = new Map();
  for (const item of rows) {
    if (item.customer?.kind !== "new_customer") continue;
    const previous = customerGroups.get(item.customer.key) || {
      customer: item.customer,
      rows: [],
    };
    previous.rows.push(item);
    customerGroups.set(item.customer.key, previous);
  }

  return (
    <section className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 text-xs text-indigo-950" aria-label="Observation-only controlled creation proposals">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">Controlled creation proposals</h4>
          <p className="mt-1 max-w-2xl text-[11px]">
            Exact preview from this read-only snapshot and saved Customer decisions. No creation, Customer edit,
            alias update, synchronization, or approval-to-create action exists here.
          </p>
        </div>
        <Badge className="bg-red-100 text-red-800">Creation disabled</Badge>
      </div>

      <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
        <Badge variant="outline">{summary.post_baseline_rows || 0} post-baseline rows</Badge>
        <Badge variant="outline">{summary.dependent_record_lines ?? summary.post_baseline_rows ?? 0} separate project/order lines</Badge>
        <Badge className="bg-emerald-100 text-emerald-800">{summary.proposal_ready || 0} complete proposals</Badge>
        <Badge className="bg-amber-100 text-amber-800">{summary.blocked || 0} blocked / review</Badge>
        <Badge className="bg-violet-100 text-violet-800">{summary.new_customer_groups || 0} distinct planned Customers</Badge>
        <Badge className="bg-red-100 text-red-800">{proposals.automatic_creates || 0} automatic creates</Badge>
      </div>

      {crossSheetConflicts.length > 0 && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-900">
          {crossSheetConflicts.length} cross-sheet new-Customer collision(s) were blocked. A proposed Customer
          name also appears in the other sheet; review the two Customer decisions together before any later creation.
        </div>
      )}

      {customerGroups.size > 0 && (
        <div className="mt-3 rounded-md border border-violet-200 bg-white/80 p-2">
          <div className="font-semibold text-violet-950">New Customer + dependent record bundles</div>
          <p className="mt-0.5 text-[11px] text-violet-800">
            Each group proposes ONE new Customer shared by the listed rows on this sheet, while EVERY listed Smartsheet row remains its own WorkOrder/Order line. Customer grouping never collapses separate projects or descriptions. IDs are placeholders, not real Base44 IDs.
          </p>
          <div className="mt-2 space-y-2">
            {[...customerGroups.values()].slice(0, 50).map((group) => (
              <div key={group.customer.key} className="rounded-md border border-violet-100 bg-violet-50/60 p-2 text-[11px]">
                <div className="font-semibold text-violet-950">{group.customer.company_name}</div>
                <div className="mt-1 break-all font-mono text-[10px] text-violet-800">{group.customer.key}</div>
                <div className="mt-1">
                  Planned Customer fields: {Object.entries(group.customer.customer_payload || {}).map(([key, value]) => `${key}: ${value}`).join(" • ")}
                </div>
                <div className="mt-1">
                  Dependent {dataset === "sales" ? "WorkOrders" : "Orders"}: {group.rows.map((row) => `row ${row.row_number || row.row_id}`).join(", ")}
                </div>
                {group.rows.some((row) => !row.proposal_ready) && (
                  <div className="mt-1 font-medium text-amber-800">One or more dependent records are blocked; review the row details below.</div>
                )}
              </div>
            ))}
            {customerGroups.size > 50 && (
              <p className="text-[11px] text-slate-600">Showing the first 50 of {customerGroups.size} proposed Customer groups.</p>
            )}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="mt-3 rounded-md border bg-white/70 p-3 text-[11px]">
          No post-baseline rows have entered the proposal queue. Baseline rows remain excluded.
        </p>
      ) : (
        <div className="mt-3 max-h-[36rem] space-y-2 overflow-y-auto">
          {rows.slice(0, 100).map((row) => (
            <details key={row.row_id} className="group rounded-md border border-indigo-100 bg-white">
              <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-slate-900">Row {row.row_number || "—"} — {row.label}</span>
                  <span className="mt-0.5 block text-[10px] text-slate-500">
                    {row.entity} • separate source line • permanent row ID {row.row_id}
                    {row.customer?.kind === "existing_customer"
                      ? ` • Existing Customer: ${row.customer.company_name}`
                      : row.customer?.kind === "new_customer"
                        ? ` • Planned new Customer: ${row.customer.company_name}`
                        : " • Customer unresolved"}
                  </span>
                </span>
                <Badge className={row.proposal_ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}>
                  {row.proposal_ready ? "complete preview" : "blocked / review"}
                </Badge>
                <span aria-hidden="true" className="text-indigo-700 group-open:rotate-180">⌄</span>
              </summary>

              <div className="space-y-3 border-t px-3 py-3">
                {row.blockers.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-950">
                    <div className="font-semibold">Resolve before future creation</div>
                    {row.blockers.map((entry, index) => (
                      <p key={`${entry.code}-${index}`} className="mt-1">
                        <strong>{entry.label}</strong>{entry.detail ? ` — ${entry.detail}` : ""}
                      </p>
                    ))}
                  </div>
                )}
                {(crossByRowId.get(row.row_id) || []).map((conflict, index) => (
                  <div key={`${conflict.normalized_name}-${index}`} className="rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-900">
                    Cross-sheet Customer collision: Workflow row IDs {(conflict.sales_row_ids || []).slice(0, 5).join(", ")}
                    {" "}and Order Request row IDs {(conflict.order_row_ids || []).slice(0, 5).join(", ")}.
                    {" "}{conflict.reason}
                  </div>
                ))}
                {row.customer?.kind === "new_customer" && (
                  <div className="rounded-md border border-violet-200 bg-violet-50 p-2 text-[11px]">
                    <div className="font-semibold">1. Proposed new Customer</div>
                    <ReadOnlyJson title="Customer fields" value={row.customer.customer_payload} />
                    <p className="mt-1 break-all">Future {row.entity}.customer_id would reference this proposed Customer after it has a real ID: {row.customer.key}.</p>
                  </div>
                )}
                {row.customer?.kind === "existing_customer" && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-[11px]">
                    <div className="font-semibold">1. Use existing Customer — no duplicate Customer</div>
                    <p className="mt-1 break-all">{row.customer.company_name} • ID {row.customer.customer_id}</p>
                    {row.customer.alias_plan ? (
                      <ReadOnlyJson title="Planned alias append (not applied)" value={row.customer.alias_plan} />
                    ) : (
                      <p className="mt-1">No alias update planned.</p>
                    )}
                  </div>
                )}
                <div className="font-semibold text-indigo-950">2. Proposed {row.entity} and relationships</div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <ReadOnlyJson title="All candidate creation fields" value={row.proposed_payload} />
                  <ReadOnlyJson title="Customer + downstream relationships" value={row.relationships} />
                  <ReadOnlyJson title="Smartsheet source values" value={row.source_values} />
                  <ReadOnlyJson title="Field-by-field conversion (including blanks)" value={row.fields} />
                </div>
                <p className="text-[10px] text-slate-600">
                  Base44-only history and activity timestamps are intentionally omitted. No WorkOrder/Order ID exists yet.
                  These values are a proposal only and must be revalidated before any future write.
                </p>
              </div>
            </details>
          ))}
          {rows.length > 100 && (
            <p className="rounded-md bg-white p-2 text-[11px] text-indigo-900">
              Showing the first 100 of {rows.length.toLocaleString()} post-baseline proposals. Summary counts include all rows.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
