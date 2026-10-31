import * as React from "react";
import { Loader2, OctagonX, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DataTableShell, Tr, Td, KpiStrip } from "@/components/kit";
import { IMPORT_CHUNK_SIZE, fmtInt } from "./migrationModel";

// Step 4 -- live import progress. The chunk loop itself lives in
// migrationModel.runImportPlan; this renders the state it emits: row x of n,
// live counts, per-row errors as they stream back, and a stop-after-chunk
// control for big runs.
export function MigrationImportStep({ progress, onStop }) {
  const p = progress || {};
  const total = Number(p.total) || 0;
  const done = Math.min(Number(p.done) || 0, total);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const counts = p.counts || {};
  const running = !!p.running;
  const errorRows = p.errorRows || [];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {running ? (
              <>Importing row {fmtInt(done)} of {fmtInt(total)}...</>
            ) : p.stopped ? (
              <>Stopped at row {fmtInt(done)} of {fmtInt(total)}</>
            ) : (
              <>Processed {fmtInt(done)} of {fmtInt(total)} rows</>
            )}
          </span>
          <span className="text-slate-400">
            chunk {Math.max(0, (p.chunkIndex ?? -1) + 1)} of {p.chunks || Math.ceil(total / IMPORT_CHUNK_SIZE) || 1}
            {" "}{"\u00B7"}{" "}{IMPORT_CHUNK_SIZE} rows per call
          </span>
        </div>
        <Progress value={pct} className="h-2.5" />
        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
          <span>{pct}%</span>
          {running && onStop && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-red-600 hover:text-red-700" onClick={onStop}>
              <OctagonX className="mr-1 h-3 w-3" /> Stop after this chunk
            </Button>
          )}
        </div>
      </div>

      <KpiStrip
        tiles={[
          { key: "create", label: "Created", value: fmtInt(counts.created), tone: "emerald" },
          { key: "update", label: "Updated", value: fmtInt(counts.updated), tone: "sky" },
          { key: "skip", label: "Skipped", value: fmtInt(counts.skipped), tone: "slate" },
          { key: "err", label: "Errors", value: fmtInt(counts.errors), tone: counts.errors ? "red" : "slate" },
        ]}
      />

      {p.truncatedChunks > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            The server truncated {p.truncatedChunks} chunk(s) at its {IMPORT_CHUNK_SIZE}-row cap -- some
            rows may not have been processed. Re-check the report before assuming the file finished.
          </span>
        </div>
      )}
      {p.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {p.error}
        </div>
      )}
      {running && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Chunks run one at a time -- leave this page open until the import finishes.
        </div>
      )}

      <DataTableShell
        dense
        head={["CSV line", "Source ID", "Error"]}
        isEmpty={!errorRows.length}
        emptyState={{ title: "No errors so far", message: "Failing rows land here as chunks return." }}
        className="max-h-72"
      >
        {errorRows.slice(0, 200).map((e, i) => (
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
    </div>
  );
}
