// Edits for src/components/procurement/ReceivePanel.jsx — status chips only.
// The receipt progress bar, receiving math, and table stay as-is.
export default [
  // 1. Kit import.
  {
    old: `import { sendStaffEmail } from "@/components/comms/sendStaffEmail";
import {
  LINE_STATUS_LABELS,`,
    new: `import { sendStaffEmail } from "@/components/comms/sendStaffEmail";
import { StatusChip } from "@/components/kit";
import {
  LINE_STATUS_LABELS,`,
  },
  // 2. Local badge map -> StatusChip wrapper (same call site, same tones).
  {
    old: `const LINE_BADGE_STYLES = {
  open: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
  received: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
};

function LineStatusBadge({ status }) {
  return (
    <span className={\`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide \${LINE_BADGE_STYLES[status] || LINE_BADGE_STYLES.open}\`}>
      {LINE_STATUS_LABELS[status] || status}
    </span>
  );
}`,
    new: `// Tones match the old badge map: open slate, partial amber, received emerald.
const LINE_STATUS_TONES = { open: "slate", partial: "amber", received: "emerald" };

function LineStatusBadge({ status }) {
  return (
    <StatusChip
      tone={LINE_STATUS_TONES[status] || "slate"}
      label={LINE_STATUS_LABELS[status] || status}
      size="sm"
    />
  );
}`,
  },
  // 3. Backorder / Overdue flags -> StatusChip (both red, as before).
  {
    old: `          {receipt.totals.backordered > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-950/60 dark:text-red-300">
              Backorder {receipt.totals.backordered}
            </span>
          )}
          {receipt.overdue && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-950/60 dark:text-red-300">Overdue</span>
          )}`,
    new: `          {receipt.totals.backordered > 0 && (
            <StatusChip tone="red" label={\`Backorder \${receipt.totals.backordered}\`} size="sm" className="ml-2" />
          )}
          {receipt.overdue && (
            <StatusChip tone="red" label="Overdue" size="sm" className="ml-2" />
          )}`,
  },
];
