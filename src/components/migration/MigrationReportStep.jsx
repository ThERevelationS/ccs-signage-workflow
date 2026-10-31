import * as React from "react";
import { Download, Loader2, RefreshCw, ShieldAlert, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DataTableShell,
  Tr,
  Td,
  KpiStrip,
  RecordLink,
  StatusChip,
} from "@/components/kit";
import {
  REPORT_ERROR_LIMIT,
  buildErrorCsv,
  canUnimport,
  entityRecordKind,
  fmtDateTime,
  fmtInt,
  unimportConfirmHint,
} from "./migrationModel";

function downloadTextFile(name, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Step 5 -- the batch report (report action) plus rollback. per-entity totals,
// the first-200 error list downloadable as CSV, the unmapped-column tally,
// created-record deep links, and the two-step unimport confirm (typed batch
// tag) wired to unimport_batch.
export function MigrationReportStep({
  batchId,
  report,
  reportLoading,
  reportError,
  onRefresh,
  recordRefs,
  recordKind,
  onUnimport,
  unimporting,
  unimportResult,
  unimportError,
  onNewImport,
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  React.useEffect(() => {
    setConfirmOpen(false);
    setTyped("");
  }, [batchId]);

  const totals = report?.totals || {};
  const perEntity = report?.per_entity || {};
  const entityKeys = Object.keys(perEntity);
  const errors = report?.errors || [];
  const unmapped = report?.unmapped_columns || {};
  const unmappedPairs = Object.entries(unmapped).sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));
  const createdCount = Number(totals.created) || 0;
  const confirmable = canUnimport(typed, batchId);
  const batchStatus = report?.batch?.status || (unimportResult ? "rolled_back" : "done");

  const downloadErrors = () => {
    const csv = buildErrorCsv(errors.map((e, i) => ({ row: i + 1, ...e })));
    downloadTextFile(`${batchId || "migration"}-errors.csv`, csv);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={batchStatus} />
        <code className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {batchId}
        </code>
        {report?.generated_at && (
          <span className="text-[11px] text-slate-400">generated {fmtDateTime(report.generated_at)}</span>
        )}
        <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={onRefresh} disabled={reportLoading}>
          {reportLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
          Refresh counts
        </Button>
      </div>

      {reportError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {reportError}
        </div>
      )}

      <KpiStrip
        tiles={[
          { key: "rows", label: "Rows", value: fmtInt(totals.rows) },
          { key: "create", label: "Created", value: fmtInt(totals.created), tone: "emerald" },
          { key: "update", label: "Updated", value: fmtInt(totals.updated), tone: "sky" },
          { key: "skip", label: "Skipped", value: fmtInt(totals.skipped), tone: "slate" },
          { key: "err", label: "Errors", value: fmtInt(totals.errors), tone: totals.errors ? "red" : "slate" },
        ]}
      />

      {entityKeys.length > 0 && (
        <DataTableShell
          dense
          head={["Source entity", "Target", "Rows", "Created", "Updated", "Skipped", "Errors"]}
        >
          {entityKeys.map((key) => {
            const e = perEntity[key];
            return (
              <Tr key={key}>
                <Td className="font-medium text-slate-800 dark:text-slate-200">{key}</Td>
                <Td className="text-xs text-slate-500">{e.target_entity || "\u2014"}</Td>
                <Td>{fmtInt(e.rows)}</Td>
                <Td className="text-emerald-700 dark:text-emerald-300">{fmtInt(e.created)}</Td>
                <Td className="text-sky-700 dark:text-sky-300">{fmtInt(e.updated)}</Td>
                <Td className="text-slate-500">{fmtInt(e.skipped)}</Td>
                <Td className={e.errors ? "text-red-600 dark:text-red-400" : "text-slate-400"}>{fmtInt(e.errors)}</Td>
              </Tr>
            );
          })}
        </DataTableShell>
      )}

      {unmappedPairs.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Unmapped source columns seen
          </div>
          <div className="flex flex-wrap gap-1">
            {unmappedPairs.map(([col, n]) => (
              <span
                key={col}
                className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
                title={`${fmtInt(n)} row(s) carried this unmapped column`}
              >
                {col}{"\u00B7"}{fmtInt(n)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Errors{errors.length ? ` (first ${REPORT_ERROR_LIMIT})` : ""}
            {report?.errors_truncated ? " -- truncated" : ""}
          </span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={downloadErrors} disabled={!errors.length}>
            <Download className="mr-1 h-3 w-3" /> Errors CSV
          </Button>
        </div>
        <DataTableShell
          dense
          head={["Source entity", "Source ID", "Error"]}
          isEmpty={!errors.length}
          emptyState={{ title: "No errors recorded", message: "Nothing failed in this batch." }}
          className="max-h-80 border-0"
          sticky={false}
        >
          {errors.map((e, i) => (
            <Tr key={`${e.source_id}-${i}`}>
              <Td className="w-36 text-xs text-slate-500">{e.source_entity || "\u2014"}</Td>
              <Td className="w-40">
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">
                  {e.source_id || "\u2014"}
                </code>
              </Td>
              <Td className="text-xs text-red-600 dark:text-red-400">{e.error}</Td>
            </Tr>
          ))}
        </DataTableShell>
      </div>

      {(recordRefs || []).length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Created / updated records (this run)
          </div>
          <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-auto">
            {recordRefs.slice(0, 150).map((r) => (
              <span key={`${r.target_id}-${r.row}`} className="text-xs">
                <RecordLink kind={recordKind} id={r.target_id}>
                  {r.source_id || r.target_id}
                </RecordLink>
                {r.status === "updated" && <span className="ml-1 text-slate-400">(upd)</span>}
              </span>
            ))}
            {recordRefs.length > 150 && (
              <span className="text-xs text-slate-400">+{fmtInt(recordRefs.length - 150)} more</span>
            )}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-red-200 bg-red-50/60 px-3 py-3 dark:border-red-900 dark:bg-red-950/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start gap-2 text-xs text-red-800 dark:text-red-300">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>Rollback.</strong> Deletes records this batch created. Updated, skipped, and
              error rows are kept. Type the batch tag to unlock.
            </span>
          </div>
          {!confirmOpen && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 border-red-300 text-xs text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
              onClick={() => setConfirmOpen(true)}
              disabled={unimporting || createdCount === 0}
              title={createdCount === 0 ? "Nothing was created in this batch" : ""}
            >
              <Undo2 className="mr-1 h-3 w-3" /> Unimport batch
            </Button>
          )}
        </div>
        {confirmOpen && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={unimportConfirmHint(batchId)}
              className="h-8 w-72 bg-white text-xs dark:bg-slate-900"
              disabled={unimporting}
              autoFocus
            />
            <Button
              size="sm"
              className="h-8 bg-red-600 text-xs hover:bg-red-700"
              disabled={!confirmable || unimporting}
              onClick={() => onUnimport?.()}
            >
              {unimporting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Undo2 className="mr-1 h-3.5 w-3.5" />}
              Delete {fmtInt(createdCount)} created record(s)
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setConfirmOpen(false); setTyped(""); }} disabled={unimporting}>
              Cancel
            </Button>
          </div>
        )}
        {unimportResult && (
          <div className="mt-2 rounded-lg bg-white/70 px-2 py-1.5 text-xs text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
            Rolled back: {fmtInt(unimportResult.deleted)} deleted
            {unimportResult.already_missing ? `, ${fmtInt(unimportResult.already_missing)} already missing` : ""}
            {unimportResult.skipped_non_created ? `, ${fmtInt(unimportResult.skipped_non_created)} non-created rows kept` : ""}
            {unimportResult.errors ? `, ${fmtInt(unimportResult.errors)} delete errors` : ""}.
          </div>
        )}
        {unimportError && (
          <div className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">{unimportError}</div>
        )}
      </div>

      {onNewImport && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={onNewImport}>Start a new import</Button>
        </div>
      )}
    </div>
  );
}
