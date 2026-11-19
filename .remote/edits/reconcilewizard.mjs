// Edits for src/components/reconciliation/ReconcileWizard.jsx — input
// vocabulary only; wizard logic and its tally tables untouched.
export default [
  {
    old: `import { NotificationTriggers } from "@/components/workflow/NotificationService";

const clean = (v) => String(v ?? "").trim();`,
    new: `import { NotificationTriggers } from "@/components/workflow/NotificationService";
import { filterInputCls } from "@/components/kit";

const clean = (v) => String(v ?? "").trim();`,
  },
  {
    old: `const inputCls = "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const labelCls`,
    new: `const inputCls = filterInputCls;
const labelCls`,
  },
];
