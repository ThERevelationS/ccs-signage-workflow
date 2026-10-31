import * as React from "react";
import { CheckCircle2, FlaskConical, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTableShell, Tr, Td, KpiStrip } from "@/components/kit";
import { DRY_RUN_ROW_LIMIT, fmtInt } from "./migrationModel";

// Step 3 -- dry-run validation summary (import_rows dry_run:true on the first
// <=500 rows). Shows would-create/update/skip/error counts and the per-row
// errors so the operator fixes the CSV or mapping before the live run.
export function MigrationDryRunStep({
  dryRun,
  rowCount,
  onDuplicate,
  onDuplicateChange,
  onBack,
  onRunImport,
  running,
}) {
  const counts = dryRun?.counts || {};
  const errorRows = dryRun?.errorRows || [];
  const totalRows = Number(rowCount) || 0;
  const sampled = Math.min(totalRows, DRY_RUN_ROW_LIMIT);
  const errors = Number(counts.errors) || 0;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300">
        <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Dry run validated the first <strong>{fmtInt(sampled)}</strong> of {fmtInt(totalRows)} rows --
          nothing was created. Counts below are what the live import is expected to do for those rows.
        </span>
      </div>

      <KpiStrip
        tiles={[
          { key: "create", label: "Would create", value: fmtInt(counts.created), tone: "emerald" },
          { key: "update", label: "Would update", value: fmtInt(counts.updated), tone: "sky" },
          { key: "skip", label: "Would skip", value: fmtInt(counts.skipped), tone: "slate", hint: "already imported" },
          { key: "err", label: "Row errors", value: fmtInt(counts.errors), tone: errors ? "red" : "slate" },
        ]}
      />

      {errors > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {fmtInt(errors)} row(s) failed validation. You can still run the import -- failing rows are
            recorded as errors and skipped -- or go back and fix the mapping/CSV first.
          </span>
        </div>
      )}
      {errors === 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" /> Every sampled row validated cleanly.
        </div>
      )}

      <DataTableShell
        dense
        head={["CSV line", "Source ID", "Error"]}
        isEmpty={!errorRows.length}
        emptyState={{ title: "No row errors", message: "All sampled rows passed validation." }}
      >
        {errorRows.map((e, i) => (
          <Tr key={`${e.csv_line || e.row}-${i}`}>
            <Td className="w-20 whitespace-nowrap text-slate-500">{e.csv_line || e.row || "\u2014"}</Td>
            <Td className="w-40">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">
                {e.source_id || "\u2014"}
              </code>
            </Td>
            <Td className="text-xs text-red-600 dark:text-red-400">{e.error}</Td>
          </Tr>
        ))}
      </DataTableShell>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/40">
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
          When a row was already imported:
          <select
            value={onDuplicate}
            onChange={(e) => onDuplicateChange?.(e.target.value)}
            className="min-h-9 rounded-xl border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="skip">Skip it (keep existing record)</option>
            <option value="update">Update the existing record</option>
          </select>
        </label>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onBack} disabled={running}>
            Back to mapping
          </Button>
          <Button onClick={onRunImport} disabled={running || totalRows === 0} className="bg-violet-600 hover:bg-violet-700">
            {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Run import ({fmtInt(totalRows)} rows)
          </Button>
        </div>
      </div>
    </div>
  );
}
