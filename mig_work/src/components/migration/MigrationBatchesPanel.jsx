import * as React from "react";
import { FileBarChart, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DataTableShell,
  Tr,
  Td,
  StatusChip,
  FilterBar,
  FilterSearchInput,
} from "@/components/kit";
import { migrationActions, migrationErrorMessage } from "./migrationClient";
import { batchRow, fmtDateTime, fmtInt } from "./migrationModel";

// Batches tab -- the list_batches history. Each batch is a LegacyMigrationMap
// marker: entity, counts, status, who started it. "Report" hands the batch id
// back to the wizard, which opens the report step for it.
export function MigrationBatchesPanel({ sessionToken, onOpenReport, reloadKey = 0 }) {
  const [batches, setBatches] = React.useState(null);
  const [error, setError] = React.useState("");
  const [query, setQuery] = React.useState("");

  const load = React.useCallback(async () => {
    setError("");
    try {
      const data = await migrationActions.listBatches(sessionToken);
      setBatches((data?.batches || []).map(batchRow));
    } catch (e) {
      setError(migrationErrorMessage(e, "Batch history could not be loaded."));
      setBatches([]);
    }
  }, [sessionToken]);

  React.useEffect(() => { load(); }, [load, reloadKey]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = batches || [];
    if (!q) return list;
    return list.filter((b) =>
      [b.batch_id, b.entity, b.source_label, b.started_by, b.status]
        .some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [batches, query]);

  return (
    <div className="space-y-3">
      <FilterBar
        search={
          <FilterSearchInput
            placeholder="Search batch tag, entity, file, or operator..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={batches === null}>
            {batches === null ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            Refresh
          </Button>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      <DataTableShell
        head={["Batch tag", "Entity", "Source", "Status", "Created / upd / skip / err", "Rows", "Started", "By", ""]}
        isEmpty={!!batches && filtered.length === 0}
        emptyState={{
          title: batches === null ? "Loading batches..." : "No migration batches yet",
          message: "Every import run records a batch marker; finished runs land here.",
        }}
      >
        {(filtered || []).map((b) => (
          <Tr key={b.batch_id}>
            <Td>
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">
                {b.batch_id}
              </code>
            </Td>
            <Td className="text-xs font-medium text-slate-700 dark:text-slate-200">{b.entity || "mixed"}</Td>
            <Td className="max-w-[180px]">
              <span className="block truncate text-xs text-slate-500" title={b.source_label}>
                {b.source_label || "\u2014"}
              </span>
            </Td>
            <Td><StatusChip status={b.status} size="sm" /></Td>
            <Td className="whitespace-nowrap text-xs">
              <span className="text-emerald-700 dark:text-emerald-300">{fmtInt(b.counts.created)}</span>
              {" / "}
              <span className="text-sky-700 dark:text-sky-300">{fmtInt(b.counts.updated)}</span>
              {" / "}
              <span className="text-slate-500">{fmtInt(b.counts.skipped)}</span>
              {" / "}
              <span className={b.counts.errors ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-400"}>
                {fmtInt(b.counts.errors)}
              </span>
            </Td>
            <Td className="text-xs text-slate-500">{fmtInt(b.rows)}</Td>
            <Td className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(b.started_at)}</Td>
            <Td className="text-xs text-slate-500">{b.started_by || "\u2014"}</Td>
            <Td className="text-right">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenReport?.(b.batch_id)}>
                <FileBarChart className="mr-1 h-3 w-3" /> Report
              </Button>
            </Td>
          </Tr>
        ))}
      </DataTableShell>
    </div>
  );
}
