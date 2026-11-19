// Edits for src/components/invoicing/CreditRefundDialogs.jsx — input
// vocabulary only; dialog logic untouched.
export default [
  {
    old: `} from "@/components/invoicing/refundMath";

const inputCls =
  "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const labelCls`,
    new: `} from "@/components/invoicing/refundMath";
import { filterInputCls } from "@/components/kit";

const inputCls = filterInputCls;
const labelCls`,
  },
];
