import { useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  FileCheck,
  Loader2,
  Package,
} from "lucide-react";
import {
  PROOF_STATE_LABELS,
  customerFacingProducts,
  portalOrderSummary,
  proofActionable,
} from "./productPortalModel";

// Customer-facing "Your order" product-status panel (masterplan B-15).
// Drop-in for the CustomerPortal work_order view: pass a WorkOrder-shaped
// object (or any object carrying a products[] array). Styling follows the
// CustomerPortal/PortalPanel kit — slate card, uppercase mini header,
// divide-y rows, rounded-full chips.

const STATUS_TONES = {
  awaiting_customer_action: "amber",
  awaiting_proof_approval: "amber",
  order_review: "blue",
  site_survey: "blue",
  permitting: "blue",
  design_review: "blue",
  proof_approved: "indigo",
  in_production: "indigo",
  quality_control: "indigo",
  install_removal_only: "violet",
  service_repair: "violet",
  built: "emerald",
  completed: "emerald",
};

const TONE_CLASSES = {
  amber: "bg-amber-100 text-amber-800",
  blue: "bg-blue-100 text-blue-800",
  indigo: "bg-indigo-100 text-indigo-800",
  violet: "bg-violet-100 text-violet-800",
  emerald: "bg-emerald-100 text-emerald-800",
  slate: "bg-slate-100 text-slate-600",
};

const PROOF_TONES = {
  awaiting_approval: { tone: "amber", icon: FileCheck },
  approved: { tone: "emerald", icon: CheckCircle2 },
  changes_requested: { tone: "amber", icon: AlertCircle },
  in_preparation: { tone: "slate", icon: FileCheck },
};

const FULFILLED_STATES = new Set(["picked_up", "installed", "shipped", "delivered"]);

const chipCls = (tone) =>
  `inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TONE_CLASSES[tone] || TONE_CLASSES.slate}`;

// Date-only stamps ("YYYY-MM-DD") parse as local midnight — never UTC-shifted.
const fmtDue = (stamp) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(stamp || "").trim());
  if (!m) return String(stamp || "");
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString();
};

function statusTone(row) {
  if (FULFILLED_STATES.has(row.fulfillment_state)) return "emerald";
  return STATUS_TONES[row.status_key] || "slate";
}

export default function ProductStatusPanel({ workOrder, onApproveProof, onRequestChanges }) {
  const [busy, setBusy] = useState("");
  const products = customerFacingProducts(workOrder);
  const summary = portalOrderSummary(workOrder);

  const run = async (row, action, fn) => {
    if (busy || typeof fn !== "function") return;
    setBusy(`${row.id}:${action}`);
    try {
      await fn(row);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          <Package className="h-3.5 w-3.5" />Your order
        </p>
        <span className="inline-flex items-center gap-1.5">
          {summary.overall_label && products.length > 0 && (
            <span className={chipCls(summary.overall_label === "Action needed" ? "amber" : summary.overall_label === "Order complete" ? "emerald" : "slate")}>
              {summary.overall_label}
            </span>
          )}
          {products.length > 0 && (
            <span className="text-[11px] font-semibold text-slate-500">
              {summary.approved_count} of {summary.total_products} approved
            </span>
          )}
        </span>
      </div>

      <ul className="mt-2 divide-y divide-slate-100">
        {products.length === 0 && (
          <li className="py-3 text-center text-xs text-slate-400">No items listed on this order yet.</li>
        )}
        {products.map((row) => {
          const actionable = proofActionable(row);
          const proof = PROOF_TONES[row.proof_state];
          const rowBusy = busy.startsWith(`${row.id}:`);
          return (
            <li key={row.id} className="py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {row.product_name}
                    {row.qty > 1 ? ` × ${row.qty}` : ""}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-400">
                    <span>Item {row.position} of {row.total}</span>
                    {row.due_date && (
                      <span className="inline-flex items-center gap-0.5">
                        · <Calendar className="h-3 w-3" />Due {fmtDue(row.due_date)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {proof && PROOF_STATE_LABELS[row.proof_state] && (
                    <span className={chipCls(proof.tone)}>
                      <proof.icon className="h-3 w-3" />{PROOF_STATE_LABELS[row.proof_state]}
                    </span>
                  )}
                  <span className={chipCls(statusTone(row))}>
                    {row.customer_label || "In progress"}
                  </span>
                </div>
              </div>
              {actionable && (onApproveProof || onRequestChanges) && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="w-full text-[11px] text-amber-700">
                    Your proof is ready — approve it to keep your order moving.
                  </p>
                  {typeof onApproveProof === "function" && (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => run(row, "approve", onApproveProof)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {rowBusy && busy.endsWith(":approve")
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Approve proof
                    </button>
                  )}
                  {typeof onRequestChanges === "function" && (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => run(row, "changes", onRequestChanges)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {rowBusy && busy.endsWith(":changes")
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <AlertCircle className="h-3.5 w-3.5" />}
                      Request changes
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
