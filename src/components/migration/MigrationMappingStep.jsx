import * as React from "react";
import { ArrowRight, Info, Loader2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DataTableShell, Tr, Td, FilterSelect, StatusChip } from "@/components/kit";
import {
  SOURCE_ID_FIELD,
  cleanMapping,
  mappingHasSourceId,
  requiredCoverage,
  targetFieldOptions,
} from "./migrationModel";
import { firstValueForColumn } from "./csvParse";

const UNMAPPED = "";

// Step 2 -- column mapping. The backend's preview_mapping proposed the initial
// map; the operator edits each source column's target field here. Required
// coverage + the __source_id__ dedupe key are called out before the dry run
// so preventable row failures never reach the server.
export function MigrationMappingStep({
  entityKey,
  mapper,
  preview,
  columns,
  rows,
  mapping,
  onMappingChange,
  onBack,
  onRunDryRun,
  running,
  runError,
}) {
  const fieldOptions = React.useMemo(
    () => targetFieldOptions({ preview, mapper, currentMapping: mapping }),
    [preview, mapper, mapping]
  );
  const coverage = React.useMemo(
    () => requiredCoverage({
      requiredFields: preview?.required_fields,
      mapping,
      defaults: preview?.default_suggestions,
    }),
    [preview, mapping]
  );
  const unmapped = (columns || []).filter((c) => !cleanMapping(mapping)[c]);
  const hasSourceId = mappingHasSourceId(mapping);
  const warnings = preview?.warnings || [];
  const mappedCount = (columns || []).length - unmapped.length;

  const fieldLabel = (field) => {
    if (field === SOURCE_ID_FIELD) return "Source ID (dedupe key)";
    if ((preview?.required_fields || []).includes(field)) return `${field} (required)`;
    return field;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone="sky" label={`${entityKey} \u2192 ${preview?.target_entity || "?"}`} />
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {mappedCount} of {(columns || []).length} columns mapped
        </span>
        {preview?.dry_run && (
          <span className="text-[11px] text-slate-400">Preview is a dry run -- nothing was written.</span>
        )}
      </div>

      {preview?.mapper_note && (
        <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{preview.mapper_note}</span>
        </div>
      )}

      {!hasSourceId && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            No column is mapped to <strong>Source ID</strong>. Every row will fail -- map the
            CoreBridge id column to "Source ID (dedupe key)".
          </span>
        </div>
      )}

      {(coverage.required || []).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Required fields
          </span>
          {coverage.covered.map((f) => (
            <StatusChip key={f} tone="emerald" label={f} size="sm" />
          ))}
          {coverage.autoFilled.map((f) => (
            <StatusChip key={f} tone="sky" label={`${f} (auto)`} size="sm" />
          ))}
          {coverage.missing.map((f) => (
            <StatusChip key={f} tone="red" label={`${f} -- unmapped`} size="sm" />
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/40">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            <TriangleAlert className="h-3.5 w-3.5" /> Mapping warnings
          </div>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-800 dark:text-amber-300">
            {warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}

      {unmapped.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
          <span className="font-semibold text-slate-600 dark:text-slate-300">Unmapped columns</span>{" "}
          (not imported): {unmapped.join(", ")}
        </div>
      )}

      <DataTableShell
        dense
        head={["Source column", "Sample value", "", "Target field"]}
        isEmpty={!(columns || []).length}
        emptyState={{ title: "No columns parsed", message: "Go back and choose a CSV file." }}
      >
        {(columns || []).map((col) => {
          const value = cleanMapping(mapping)[col] || UNMAPPED;
          return (
            <Tr key={col}>
              <Td className="font-medium text-slate-800 dark:text-slate-200">
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">{col}</code>
              </Td>
              <Td className="max-w-[220px]">
                <span className="block truncate text-xs text-slate-500 dark:text-slate-400" title={firstValueForColumn(rows, col)}>
                  {firstValueForColumn(rows, col) || "\u2014"}
                </span>
              </Td>
              <Td className="w-8 px-1 text-slate-300 dark:text-slate-600">
                <ArrowRight className="h-3.5 w-3.5" />
              </Td>
              <Td>
                <FilterSelect
                  value={value}
                  onChange={(e) => onMappingChange?.(col, e.target.value)}
                  className={cn(
                    "min-h-8 w-full min-w-56 py-1 text-xs",
                    !value && "text-slate-400 dark:text-slate-500"
                  )}
                >
                  <option value={UNMAPPED}>{"\u2014"} do not import {"\u2014"}</option>
                  {fieldOptions.map((field) => (
                    <option key={field} value={field}>{fieldLabel(field)}</option>
                  ))}
                </FilterSelect>
              </Td>
            </Tr>
          );
        })}
      </DataTableShell>

      {runError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {runError}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack} disabled={running}>
          Back to upload
        </Button>
        <Button
          onClick={onRunDryRun}
          disabled={running || !hasSourceId || !coverage.ok}
          className="bg-violet-600 hover:bg-violet-700"
          title={
            !hasSourceId
              ? "Map a column to Source ID first"
              : !coverage.ok
                ? "Required fields are still unmapped"
                : ""
          }
        >
          {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Run dry run
        </Button>
      </div>
    </div>
  );
}
