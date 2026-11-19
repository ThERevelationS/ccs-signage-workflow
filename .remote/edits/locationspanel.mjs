// Edits for src/components/reconciliation/LocationsPanel.jsx — StatusChip for
// the Active/Inactive pill, EmptyState for the empty registry, kit input cls.
export default [
  // 1. Kit import + inputCls alias.
  {
    old: `import { staffEntities } from "@/components/staff/staffEntities";

const clean = (v) => String(v ?? "").trim();
const inputCls = "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const labelCls`,
    new: `import { staffEntities } from "@/components/staff/staffEntities";
import { EmptyState, StatusChip, filterInputCls } from "@/components/kit";

const clean = (v) => String(v ?? "").trim();
const inputCls = filterInputCls;
const labelCls`,
  },
  // 2. Active/Inactive pills -> StatusChip (tones preserve emerald/slate).
  {
    old: `                    {loc.active !== false
                      ? <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">Active</span>
                      : <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">Inactive</span>}`,
    new: `                    <StatusChip
                      tone={loc.active !== false ? "emerald" : "slate"}
                      label={loc.active !== false ? "Active" : "Inactive"}
                      size="sm"
                    />`,
  },
  // 3. Empty registry line -> EmptyState (the Add button below stays the CTA).
  {
    old: `        {locations.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No locations registered yet.</p>
        ) : (`,
    new: `        {locations.length === 0 ? (
          <EmptyState compact icon={MapPin} title="No locations registered yet." className="py-6" />
        ) : (`,
  },
];
