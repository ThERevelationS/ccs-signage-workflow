import * as React from "react";
import { FileSpreadsheet, FileUp, Loader2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, FilterBar, FilterField, FilterSelect, StatusChip } from "@/components/kit";
import { groupMappers } from "./migrationModel";

// Step 1 -- pick the target import (a mapper from list_mappers, grouped into
// real vs stub entities) and choose the CoreBridge CSV. Parsing happens
// client-side in csvParse; this step only shows what was parsed.
export function MigrationUploadStep({
  mappers,
  mappersLoading,
  mappersError,
  entityKey,
  onEntityChange,
  fileName,
  parsed,
  onPickFile,
  picking,
  onContinue,
  continuing,
  continueError,
}) {
  const groups = React.useMemo(() => groupMappers(mappers), [mappers]);
  const selected = React.useMemo(
    () => [...groups.real, ...groups.stub].find((m) => m.key === entityKey) || null,
    [groups, entityKey]
  );
  const columns = parsed?.columns || [];
  const parseWarnings = parsed?.warnings || [];
  const parseErrors = parsed?.errors || [];
  const ready = !!selected && !!parsed && parsed.rowCount > 0 && !picking && !continuing;

  return (
    <div className="space-y-3">
      <FilterBar>
        <FilterField label="Import target">
          <FilterSelect
            value={entityKey || ""}
            onChange={(e) => onEntityChange?.(e.target.value)}
            disabled={mappersLoading || continuing}
            className="min-w-72"
          >
            <option value="">Choose what this CSV contains...</option>
            <optgroup label="Core records">
              {groups.real.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.key} ({m.target_entity})
                </option>
              ))}
            </optgroup>
            <optgroup label="Stub imports -- passthrough, partial support">
              {groups.stub.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.key} ({m.target_entity})
                </option>
              ))}
            </optgroup>
          </FilterSelect>
        </FilterField>
        {selected && (
          <StatusChip
            tone={selected.kind === "stub" ? "amber" : "emerald"}
            label={selected.kind === "stub" ? "stub import" : "full mapper"}
            size="md"
          />
        )}
        {mappersLoading && (
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading import registry...
          </span>
        )}
      </FilterBar>

      {mappersError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {mappersError}
        </div>
      )}

      {selected?.note && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
          {selected.note}
        </div>
      )}
      {selected?.kind === "stub" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This is a stub import -- values pass through with only light normalization. Check the
            dry-run output carefully before running the real import.
          </span>
        </div>
      )}
      {(selected?.parents || []).length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
          Parent links resolved from earlier imports:{" "}
          {selected.parents.map((p) => (
            <span key={p.field} className="mr-2 inline-flex items-center gap-1">
              <code className="rounded bg-slate-200/70 px-1 dark:bg-slate-700">{p.field}</code>
              <span className="text-slate-400">
                via {p.parent_key}{p.required ? " (required)" : ""}
              </span>
            </span>
          ))}
        </div>
      )}

      <div
        className={cn(
          "rounded-2xl border-2 border-dashed px-4 py-6 text-center",
          parsed
            ? "border-violet-200 bg-violet-50/40 dark:border-violet-900 dark:bg-violet-950/20"
            : "border-slate-300 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/40"
        )}
      >
        <input
          id="cb-migration-file"
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onPickFile?.(file);
          }}
        />
        {parsed ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <FileSpreadsheet className="h-4 w-4 text-violet-500" />
              {fileName}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              <strong className="text-slate-700 dark:text-slate-200">{parsed.rowCount.toLocaleString("en-US")}</strong>{" "}
              data rows {"\u00B7"}{" "}
              <strong className="text-slate-700 dark:text-slate-200">{columns.length}</strong> columns
              {parsed.delimiter && parsed.delimiter !== "," && (
                <> {"\u00B7"} {parsed.delimiter === "\t" ? "tab" : `"${parsed.delimiter}"`}-delimited detected</>
              )}
            </div>
            {columns.length > 0 && (
              <div className="mx-auto flex max-w-2xl flex-wrap justify-center gap-1">
                {columns.map((col) => (
                  <span
                    key={col}
                    className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
                  >
                    {col}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            compact
            icon={FileUp}
            title={picking ? "Parsing CSV..." : "Choose a CoreBridge CSV export"}
            message="The file is parsed in your browser first -- nothing uploads until the import step."
          />
        )}
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button asChild variant="outline" size="sm" disabled={picking || continuing}>
            <label htmlFor="cb-migration-file" className="cursor-pointer">
              {picking ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileUp className="mr-1.5 h-3.5 w-3.5" />}
              {parsed ? "Choose a different file" : "Browse..."}
            </label>
          </Button>
        </div>
        {parseErrors.map((err) => (
          <div key={err} className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{err}</div>
        ))}
        {parseWarnings.map((w) => (
          <div key={w} className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{w}</div>
        ))}
      </div>

      {continueError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {continueError}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onContinue} disabled={!ready} className="bg-violet-600 hover:bg-violet-700">
          {continuing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Continue to mapping
        </Button>
      </div>
    </div>
  );
}
