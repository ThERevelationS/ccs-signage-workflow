import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Truck } from "lucide-react";
// NOTE: the shared file must be named in the frontend-shared-modules Vite
// allowlist (scripts/frontend-shared-modules.mjs) before this import resolves
// at dev/build time — same gate as customerLifecycleModel.js /
// workOrderConversion.js shared-TS imports.
import { resolveVendorCost } from "../../../base44/shared/vendorCostModel.ts";
import { money } from "@/components/estimator/aioPricing";

// Vendor cost/markup badge for vended part rows (ESTIMATOR_MASTERPLAN F-21;
// CoreBridge map §5 "vendor cost/markup on vended parts"). Renders the
// cost→retail split inline under a part row:
//   "VendorName · cost $X → retail $Y (+Z%)"
// and expands to the source/markup/margin detail. `vendors` accepts the same
// array-or-Map shape resolveVendorCost takes — the Vendor registry is
// backend-only today, so callers without a vendor feed still get the
// part-carried vendor_name/cost fields (missing-vendor degradation).
//
// onEdit is the part row's own edit affordance (BuilderPartsPanel wires the
// same handler as its "Edit Part"/"Edit Override" button) — the badge does
// not open a second editor; vendor cost/markup edit lanes land with the
// write-path item that declares the vendor_cost/vendor_markup_* fields.
const SOURCE_LABELS = {
  part_vendor_cost: "Part vendor cost override",
  vendor_default: "Vendor default cost",
  part_cost: "Part cost",
  none: "No cost resolved",
};

const pctLabel = (resolution) => {
  if (resolution.unit_cost > 0) {
    const pct = ((resolution.computed_retail - resolution.unit_cost) / resolution.unit_cost) * 100;
    return `${pct >= 0 ? "+" : ""}${Math.round(pct * 10) / 10}%`;
  }
  if (resolution.markup_percent) return `${resolution.markup_percent >= 0 ? "+" : ""}${resolution.markup_percent}% markup`;
  return "";
};

export default function VendorCostBadge({ part, vendors = null, onEdit = null, className = "" }) {
  const [open, setOpen] = useState(false);
  const resolution = useMemo(
    () => resolveVendorCost({ part, vendors }),
    [part, vendors],
  );
  if (!resolution.vended) return null;

  const vendorLabel = resolution.vendor_name || (resolution.vendor_id ? "Vendor linked" : "Vended");
  const markupLabel = pctLabel(resolution);
  const showSplit = resolution.source !== "none";

  return (
    <div className={`border-t border-sky-100 bg-sky-50/60 px-3 ${className}`}>
      <div className="flex items-center gap-2 min-h-[30px] py-1 text-left">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={`Vendor cost detail for ${part?.part_name || "part"}`}
          className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
        >
          {open
            ? <ChevronDown className="w-3 h-3 text-sky-600 flex-shrink-0" aria-hidden="true" />
            : <ChevronRight className="w-3 h-3 text-sky-600 flex-shrink-0" aria-hidden="true" />}
          <Truck className="w-3 h-3 text-sky-600 flex-shrink-0" aria-hidden="true" />
          <span className="text-[10px] font-semibold text-sky-900 truncate">
            {vendorLabel}
            {showSplit && (
              <span className="font-normal text-sky-700">
                {" · cost "}{money(resolution.unit_cost)}{" → retail "}{money(resolution.computed_retail)}
                {markupLabel ? ` (${markupLabel})` : ""}
              </span>
            )}
          </span>
        </button>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="h-[24px] px-2 rounded border border-sky-200 bg-white text-[10px] font-semibold text-sky-700 hover:bg-sky-50 inline-flex items-center gap-1 flex-shrink-0"
            aria-label={`Edit part cost for ${part?.part_name || "part"}`}
          ><Pencil className="w-2.5 h-2.5" aria-hidden="true" /> Edit</button>
        )}
      </div>

      {open && (
        <dl className="pb-2 pl-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1 text-[10px]">
          <div className="flex justify-between gap-3"><dt className="text-sky-700/70">Vendor</dt><dd className="font-semibold text-sky-900 text-right truncate max-w-[180px]">{vendorLabel}</dd></div>
          {part?.mfg_part_number ? (
            <div className="flex justify-between gap-3"><dt className="text-sky-700/70">Vendor part #</dt><dd className="font-medium text-sky-900 text-right truncate max-w-[180px]">{part.mfg_part_number}</dd></div>
          ) : null}
          <div className="flex justify-between gap-3"><dt className="text-sky-700/70">Vendor cost</dt><dd className="font-semibold text-sky-900 text-right">{money(resolution.unit_cost)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-sky-700/70">Cost source</dt><dd className="font-medium text-sky-900 text-right">{SOURCE_LABELS[resolution.source] || resolution.source}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-sky-700/70">Markup</dt><dd className="font-medium text-sky-900 text-right">
            {resolution.markup_percent ? `${resolution.markup_percent}%` : "—"}{resolution.markup_flat ? ` + ${money(resolution.markup_flat)}` : ""}
          </dd></div>
          <div className="flex justify-between gap-3"><dt className="text-sky-700/70">Retail</dt><dd className="font-semibold text-sky-900 text-right">{money(resolution.computed_retail)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-sky-700/70">Margin</dt><dd className="font-medium text-sky-900 text-right">
            {money(resolution.margin_cents / 100)}{resolution.margin_pct ? ` (${resolution.margin_pct}%)` : ""}
          </dd></div>
          <div className="flex justify-between gap-3"><dt className="text-sky-700/70">Vendor ref</dt><dd className="font-medium text-sky-900 text-right truncate max-w-[180px]">{resolution.vendor_id || "unlinked"}</dd></div>
        </dl>
      )}
    </div>
  );
}
