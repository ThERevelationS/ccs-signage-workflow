import React from "react";
import {
  FilterBar,
  FilterField,
  FilterSearchInput,
  FilterSelect,
  filterInputCls,
} from "@/components/kit";
import { cn } from "@/lib/utils";
import {
  DEFAULT_QUEUE_FILTERS,
  DUE_PRESETS,
  PAGE_SIZES,
} from "./productQueueModel";

// CoreBridge-parity queue filter bar (COREBRIDGE_MAP.md §4). Fully STATELESS:
// it renders from the `filters` object and emits `onChange(next)` with a whole
// filter object — no fetching, no URL/page logic, no per-page forks. Mount
// points (per ESTIMATOR_MASTERPLAN C-01): Design, Estimating, Fabrication,
// InstallationDeliver, Production, EstimatorQueues.
//
// Filter keys emitted match productQueueModel's DEFAULT_QUEUE_FILTERS /
// filterQueueRows / serializeQueueFilters exactly, so the emitted object can be
// fed straight back into filterQueueRows and serializeQueueFilters:
//
//   model keys (consumed today):   status, substatus, designer,
//     responsibility, assignedTo, category, moduleKey, duePreset, search,
//     pageSize, includeFulfilled
//   CoreBridge keys (model extension pending, emitted for forward parity —
//     filterQueueRows ignores keys it does not know):
//     machine   <- options.machines
//     part      <- options.parts        (single-part picker)
//     salesperson <- options.salespeople
//     enteredBy <- options.enteredBys
//   options.partCategories -> `category`; options.assignees -> `assignedTo`.
//
// `duePreset` carries the model's DUE_PRESETS keys plus "rush" (CB's "Rush
// Jobs" preset, listed ahead of hard-dates-only in CB's dropdown order).
// until the model grows a `rush` case, duePresetMatch falls through `default`
// so the selection is preserved and serialized without breaking filtering.

// CB due dropdown order: model presets (minus hard_due_only) + Rush Jobs, then
// hard-dates-only last — matches "Past Due / Today / Tomorrow / This Week /
// Next 7 / Rush / hard due dates only".
const DUE_OPTIONS = [
  ...DUE_PRESETS.filter((d) => d.key !== "hard_due_only"),
  { key: "rush", label: "Rush Jobs" },
  ...DUE_PRESETS.filter((d) => d.key === "hard_due_only"),
];

// Select bound to a {value,label,color?} option list. `allValue` is the
// "no filter" sentinel — "all" for enum-style keys (the model's convention),
// "" for substring keys like substatus. A selected option's `color` renders as
// a small dot beside the control (CB responsibility/substatus colors).
function OptionSelect({ value, onChange, opts, allValue = "all", allLabel = "All", className }) {
  const list = Array.isArray(opts) ? opts : [];
  const selected = list.find((o) => String(o?.value) === String(value));
  return (
    <span className="inline-flex items-center gap-1">
      <FilterSelect
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value={allValue}>{allLabel}</option>
        {list.map((o) => (
          <option key={o?.value} value={o?.value}>
            {o?.label ?? o?.value}
          </option>
        ))}
      </FilterSelect>
      {selected?.color && (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: selected.color }}
          title={selected.label ?? selected.value}
        />
      )}
    </span>
  );
}

export default function QueueFilterBar({
  filters = {},
  onChange,
  options = {},
  pageSize,
  onPageSizeChange,
  compact = false,
  className,
}) {
  const f = { ...DEFAULT_QUEUE_FILTERS, ...(filters || {}) };
  const opts = options || {};

  // Always emit a complete model-shaped object so parents can stash it whole
  // (URL params, saved views, session storage all take the same shape).
  const emit = (key, value) => onChange?.({ ...f, [key]: value });

  const effectivePageSize = PAGE_SIZES.includes(Number(pageSize))
    ? Number(pageSize)
    : f.pageSize;
  const emitPageSize = (raw) => {
    const n = Number(raw);
    if (onPageSizeChange) onPageSizeChange(n);
    else emit("pageSize", n); // no dedicated handler — keep it inside filters
  };

  // Same reset semantics as ProductQueue.clearFilters: everything back to
  // DEFAULT_QUEUE_FILTERS, page size included.
  const clear = () => {
    onChange?.({ ...DEFAULT_QUEUE_FILTERS });
    if (onPageSizeChange) onPageSizeChange(DEFAULT_QUEUE_FILTERS.pageSize);
  };

  const inputCls = compact
    ? "min-h-8 rounded-lg px-2 py-1 text-xs"
    : undefined;
  const hasSubstatusOptions = Array.isArray(opts.substatuses) && opts.substatuses.length > 0;

  return (
    <FilterBar
      className={cn("items-end", compact && "gap-1.5 p-1.5", className)}
      search={
        <FilterField label="Search">
          <FilterSearchInput
            containerClassName={compact ? "min-w-36" : "min-w-44"}
            className={inputCls}
            placeholder="Order, company, product, substatus…"
            value={f.search}
            onChange={(e) => emit("search", e.target.value)}
          />
        </FilterField>
      }
      pageSize={
        <FilterField label="Per page">
          <FilterSelect
            className={inputCls}
            value={effectivePageSize}
            onChange={(e) => emitPageSize(e.target.value)}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </FilterSelect>
        </FilterField>
      }
      actions={
        <>
          <label className="flex items-center gap-1 pb-1 text-xs text-gray-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={f.includeFulfilled === true}
              onChange={(e) => emit("includeFulfilled", e.target.checked)}
            />
            Include fulfilled
          </label>
          <button
            type="button"
            className={cn(
              filterInputCls,
              inputCls,
              "w-auto cursor-pointer font-semibold text-slate-600 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
            )}
            onClick={clear}
          >
            Clear
          </button>
        </>
      }
    >
      <FilterField label="Machine">
        <OptionSelect className={inputCls} value={f.machine ?? "all"} opts={opts.machines}
          onChange={(v) => emit("machine", v)} />
      </FilterField>
      <FilterField label="Part Category">
        <OptionSelect className={inputCls} value={f.category} opts={opts.partCategories}
          onChange={(v) => emit("category", v)} />
      </FilterField>
      <FilterField label="Part">
        <OptionSelect className={inputCls} value={f.part ?? "all"} opts={opts.parts}
          onChange={(v) => emit("part", v)} />
      </FilterField>
      <FilterField label="Designer">
        <OptionSelect className={inputCls} value={f.designer} opts={opts.designers}
          onChange={(v) => emit("designer", v)} />
      </FilterField>
      <FilterField label="Due">
        <FilterSelect className={inputCls} value={f.duePreset}
          onChange={(e) => emit("duePreset", e.target.value)}>
          {DUE_OPTIONS.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </FilterSelect>
      </FilterField>
      <FilterField label="Substatus">
        {hasSubstatusOptions ? (
          <OptionSelect className={inputCls} value={f.substatus} opts={opts.substatuses}
            allValue="" onChange={(v) => emit("substatus", v)} />
        ) : (
          // Same "contains…" input ProductQueue uses — the model matches
          // substatus by substring, so free text stays meaningful here.
          <input
            className={cn(filterInputCls, inputCls, "w-28")}
            placeholder="contains…"
            value={f.substatus}
            onChange={(e) => emit("substatus", e.target.value)}
          />
        )}
      </FilterField>
      <FilterField label="Responsibility">
        <OptionSelect className={inputCls} value={f.responsibility} opts={opts.responsibilities}
          onChange={(v) => emit("responsibility", v)} />
      </FilterField>
      <FilterField label="Assigned To">
        <OptionSelect className={inputCls} value={f.assignedTo} opts={opts.assignees}
          onChange={(v) => emit("assignedTo", v)} />
      </FilterField>
      <FilterField label="Salesperson">
        <OptionSelect className={inputCls} value={f.salesperson ?? "all"} opts={opts.salespeople}
          onChange={(v) => emit("salesperson", v)} />
      </FilterField>
      <FilterField label="Entered By">
        <OptionSelect className={inputCls} value={f.enteredBy ?? "all"} opts={opts.enteredBys}
          onChange={(v) => emit("enteredBy", v)} />
      </FilterField>
      {/* Opt-in model keys not in the base spec: rendered only when the page
          supplies option lists, so queues that do filter on them get the
          control without any page-level fork. */}
      {Array.isArray(opts.statuses) && opts.statuses.length > 0 && (
        <FilterField label="Status">
          <OptionSelect className={inputCls} value={f.status} opts={opts.statuses}
            onChange={(v) => emit("status", v)} />
        </FilterField>
      )}
      {Array.isArray(opts.moduleKeys) && opts.moduleKeys.length > 0 && (
        <FilterField label="Module">
          <OptionSelect className={inputCls} value={f.moduleKey} opts={opts.moduleKeys}
            onChange={(v) => emit("moduleKey", v)} />
        </FilterField>
      )}
    </FilterBar>
  );
}
