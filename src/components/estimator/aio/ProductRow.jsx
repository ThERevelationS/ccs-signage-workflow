import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ClipboardCopy, Copy, Layers3, LockKeyhole, PackagePlus, Pencil, Percent, RefreshCw, StickyNote, Trash2 } from "lucide-react";
import { getModuleLabel } from "@/components/estimator/moduleRegistry";
import { money } from "@/components/estimator/aioPricing";
import BuilderPartsPanel from "./BuilderPartsPanel";
import ProductNotesModal from "./ProductNotesModal";
import CreateQuickProductModal from "./CreateQuickProductModal";
import { copyProductToClipboard } from "@/components/estimator/products/clipboardService";

const Field = ({ label, className = "", ...props }) => (
  <label className={`text-[10px] font-semibold tracking-wide text-gray-400 block ${className}`}>
    {label}
    <input
      {...props}
      className="mt-0.5 w-full h-[28px] px-2 border border-gray-200 rounded text-[12px] text-gray-800 bg-white disabled:bg-gray-100 disabled:text-gray-500"
    />
  </label>
);

const priceMeta = (line) => {
  const frozen = Number(line.total_snapshot || 0);
  const live = Number(line.live_total_snapshot ?? frozen);
  const differs = Math.abs(live - frozen) > 0.005;

  if (line.needs_reattach_review || line.price_state === "detached_parts") {
    return {
      label: "Parts need reattach",
      className: "bg-amber-50 text-amber-700 border-amber-200",
      icon: AlertTriangle,
      differs,
    };
  }
  if (line.price_state === "legacy_frozen") {
    return {
      label: differs ? "Legacy price frozen · update available" : "Legacy price frozen",
      className: "bg-slate-100 text-slate-600 border-slate-200",
      icon: LockKeyhole,
      differs,
    };
  }
  if (line.price_state === "changed" || differs) {
    return {
      label: "Price changed",
      className: "bg-amber-50 text-amber-700 border-amber-200",
      icon: AlertTriangle,
      differs: true,
    };
  }
  if (line.price_state === "unchecked") {
    return {
      label: "Not priced yet",
      className: "bg-gray-50 text-gray-500 border-gray-200",
      icon: LockKeyhole,
      differs: false,
    };
  }
  return {
    label: "Price current",
    className: "bg-green-50 text-green-700 border-green-200",
    icon: CheckCircle2,
    differs: false,
  };
};

export default function ProductRow({
  line,
  index,
  percentOfTotal,
  onChange,
  onRemove,
  onEdit,
  onUpdatePrice,
  onProductRefresh,
  onClone,
  onSaveNotes,
  onCreateQuickProduct,
  onPersistSettings,
}) {
  const [open, setOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(true);
  const [partCount, setPartCount] = useState(0);
  const [updatingPrice, setUpdatingPrice] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [quickProductOpen, setQuickProductOpen] = useState(false);
  const [copyingClipboard, setCopyingClipboard] = useState(false);
  const [copiedClipboard, setCopiedClipboard] = useState(false);
  const set = (patch) => onChange(index, patch);
  const commit = (patch) => onPersistSettings?.(line, index, patch);
  const frozen = Number(line.total_snapshot || 0);
  const live = Number(line.live_total_snapshot ?? frozen);
  const amount = frozen * (1 + Number(line.adjustment_percent || 0) / 100);
  const meta = priceMeta(line);
  const isCustom = line.module_key === "custom";
  const StatusIcon = meta.icon;

  const handleUpdatePrice = async () => {
    if (!onUpdatePrice || updatingPrice) return;
    setUpdatingPrice(true);
    try {
      await onUpdatePrice(line, index);
    } finally {
      setUpdatingPrice(false);
    }
  };

  const handleClone = async () => {
    if (!onClone || cloning) return;
    const name = line.client_product_name || line.project_name || "Product";
    if (!window.confirm(`Clone “${name}”?\n\nThe copy will preserve its Builder configuration, Parts, Part Groups, detached overrides and frozen pricing as a new independent Product.`)) return;
    setCloning(true);
    try {
      await onClone(line, index);
    } finally {
      setCloning(false);
    }
  };

  return (
    <div className="border border-gray-300 rounded-sm overflow-hidden bg-white shadow-sm">
      <div className="px-3 py-2.5 flex items-center gap-2.5 bg-white border-l-[4px] border-lime-300 hover:bg-gray-50">
        <button
          type="button"
          onClick={() => setPartsOpen((value) => !value)}
          className="w-[26px] h-[26px] rounded border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-gray-100 flex-shrink-0"
          title={partsOpen ? "Collapse Product Parts" : "Expand Product Parts"}
        >
          {partsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-gray-900 truncate">
              {line.client_product_name || line.project_name || getModuleLabel(line.module_key)}
            </span>
            {isCustom ? (
              <span className="text-[10px] px-2 py-0.5 rounded-sm bg-lime-100 text-gray-800 border border-lime-300 inline-flex items-center gap-1">
                <Layers3 className="w-3 h-3 text-lime-700" /> CUSTOM PRODUCT
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-sm bg-[#454545] text-white border border-gray-700 inline-flex items-center gap-1">
                <Layers3 className="w-3 h-3 text-lime-300" /> BUILDER · {line.builder_name || getModuleLabel(line.module_key)}
              </span>
            )}
            {line.owned && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                ⚡ Built here
              </span>
            )}
            <span className={`text-[10px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${meta.className}`}>
              <StatusIcon className="w-3 h-3" /> {meta.label}
            </span>
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            {line.project_name && line.project_name !== line.client_product_name ? `Source: ${line.project_name} · ` : ""}
            {line.section_status === "complete" ? "complete" : "in progress"}
            {line.product_category ? ` · ${line.product_category}` : ""}
            {` · ${partCount} Part${partCount === 1 ? "" : "s"}`}
            {line.linked_date ? ` · added ${new Date(line.linked_date).toLocaleDateString()}` : ""}
          </div>
        </div>

        <div className="text-right w-[122px] flex-shrink-0">
          <div className="text-[13px] font-bold text-gray-800">{money(amount)}</div>
          {meta.differs && (
            <div className="text-[9px] text-amber-600">live {money(live)}</div>
          )}
          {percentOfTotal != null && (
            <div className="text-[9px] text-gray-400">{percentOfTotal.toFixed(0)}% of total</div>
          )}
        </div>

        {meta.differs && line.builder_product_id && (
          line.needs_reattach_review || line.price_state === "detached_parts" ? (
            <button
              type="button"
              disabled
              className="h-[28px] px-3 border border-amber-300 bg-amber-50 rounded flex items-center gap-1 text-[12px] font-semibold text-amber-700 cursor-not-allowed"
              title="Resolve or reattach detached Parts before updating this product's price."
            >
              <AlertTriangle className="w-3 h-3" />
              Resolve Parts First
            </button>
          ) : (
            <button
              type="button"
              onClick={handleUpdatePrice}
              disabled={updatingPrice}
              className="h-[28px] px-3 border border-lime-400 bg-lime-200 rounded flex items-center gap-1 text-[12px] font-semibold text-gray-800 hover:bg-lime-300 disabled:opacity-50"
              title={`Accept current builder price ${money(live)}`}
            >
              <RefreshCw className={`w-3 h-3 ${updatingPrice ? "animate-spin" : ""}`} />
              {updatingPrice ? "Updating…" : "Update Price"}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => isCustom ? setOpen((value) => !value) : onEdit?.(line, index)}
          className="h-[28px] px-3 border border-gray-200 rounded flex items-center gap-1 text-[12px] text-gray-700 hover:bg-gray-100"
        >
          <Pencil className="w-3 h-3" /> {isCustom ? "Product Settings" : "Edit Product"}
        </button>
        <button
          type="button"
          onClick={() => setNotesOpen(true)}
          title="Manage Product Notes"
          className={`h-[28px] px-2.5 border rounded flex items-center justify-center gap-1 text-[11px] font-semibold ${line.product_notes ? "border-lime-300 text-lime-700 bg-lime-50" : "border-gray-200 text-gray-600 hover:bg-gray-100"}`}
        >
          <StickyNote className="w-3.5 h-3.5" /><span className="hidden xl:inline">Notes</span>
        </button>
        <button
          type="button"
          onClick={() => setQuickProductOpen(true)}
          title="Create Quick Product"
          className="h-[28px] px-2.5 border border-gray-200 rounded flex items-center justify-center gap-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-100"
        >
          <PackagePlus className="w-3.5 h-3.5" /><span className="hidden 2xl:inline">Quick Product</span>
        </button>
        <button
          type="button"
          disabled={copyingClipboard || !line.estimate_id}
          onClick={async () => {
            if (!line.estimate_id) return;
            setCopyingClipboard(true);
            try {
              await copyProductToClipboard({ estimateId: line.estimate_id, line });
              setCopiedClipboard(true);
              setTimeout(() => setCopiedClipboard(false), 1500);
            } catch (error) {
              window.alert(error?.message || "Product could not be copied to the estimator clipboard.");
            } finally {
              setCopyingClipboard(false);
            }
          }}
          title="Copy Product to 30-day Clipboard"
          className="h-[28px] px-2.5 border border-gray-200 rounded flex items-center justify-center gap-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >
          <ClipboardCopy className="w-3.5 h-3.5" /><span className="hidden xl:inline">{copiedClipboard ? "Copied" : "Copy"}</span>
        </button>
        <button
          type="button"
          onClick={handleClone}
          disabled={cloning}
          title="Clone Product"
          className="h-[28px] px-2.5 border border-gray-200 rounded flex items-center justify-center gap-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >
          <Copy className={`w-3.5 h-3.5 ${cloning ? "animate-pulse" : ""}`} /><span className="hidden xl:inline">{cloning ? "Cloning…" : "Clone"}</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          title="Product Settings & Pricing Options"
          className={`h-[28px] px-2.5 border rounded flex items-center justify-center gap-1 text-[11px] font-semibold ${
            open ? "border-red-300 text-red-600 bg-red-50" : "border-gray-200 text-gray-600 hover:bg-gray-100"
          }`}
        >
          <Percent className="w-3 h-3" /> Pricing
        </button>
        <button
          onClick={() => onRemove(index)}
          title="Remove product"
          className="w-[28px] h-[28px] border border-gray-200 rounded flex items-center justify-center text-red-500 hover:bg-red-50"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {open && (
        <div className="px-4 pb-3 pt-2 bg-gray-50 border-t border-gray-200">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[9px] font-extrabold tracking-widest text-gray-500">PRODUCT SETTINGS & PRICING OPTIONS</div>
            <div className="text-[9px] text-gray-400">Changes save when you leave each field. Pricing adjustments affect the customer quote, not the frozen Builder cost.</div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field
            label="CLIENT PRODUCT NAME"
            value={line.client_product_name || line.project_name || ""}
            onChange={(e) => set({ client_product_name: e.target.value })}
            onBlur={(e) => commit({ client_product_name: e.target.value })}
            className="col-span-2"
          />
          <Field
            label={isCustom ? "PRODUCT TYPE" : "BUILDER TYPE"}
            value={isCustom ? "Custom Product" : line.builder_name || getModuleLabel(line.module_key)}
            disabled
          />
          <Field
            label="PRODUCT CATEGORY"
            value={line.product_category || ""}
            onChange={(e) => set({ product_category: e.target.value })}
            onBlur={(e) => commit({ product_category: e.target.value })}
            placeholder="e.g. Interior Signage"
          />
          <Field
            label="FROZEN COST"
            type="number"
            value={frozen}
            disabled
          />
          <Field
            label="LIVE CALCULATION"
            type="number"
            value={live}
            disabled
          />
          <Field
            label="ADJUSTMENT %"
            type="number"
            value={line.adjustment_percent ?? 0}
            onChange={(e) => set({ adjustment_percent: parseFloat(e.target.value) || 0 })}
            onBlur={(e) => commit({ adjustment_percent: parseFloat(e.target.value) || 0 })}
          />
          <Field
            label="QUANTITY"
            type="number"
            value={line.customer_quantity ?? 1}
            onChange={(e) => set({ customer_quantity: parseFloat(e.target.value) || 1 })}
            onBlur={(e) => commit({ customer_quantity: parseFloat(e.target.value) || 1 })}
          />
          <label className="text-[10px] font-semibold tracking-wide text-gray-400 block">
            STATUS
            <select
              value={line.section_status || "in_progress"}
              onChange={(e) => {
                const patch = { section_status: e.target.value };
                set(patch);
                commit(patch);
              }}
              className="mt-0.5 w-full h-[28px] px-2 border border-gray-200 rounded text-[12px] text-gray-800 bg-white"
            >
              <option value="in_progress">In progress</option>
              <option value="complete">Complete</option>
            </select>
          </label>
          <div className="col-span-2 sm:col-span-4">
            <Field
              label="CUSTOMER DESCRIPTION"
              value={line.customer_description || ""}
              onChange={(e) => set({ customer_description: e.target.value })}
              onBlur={(e) => commit({ customer_description: e.target.value })}
              placeholder="Shown to the customer on the quote"
            />
          </div>
        </div>
        </div>
      )}

      <CreateQuickProductModal
        open={quickProductOpen}
        line={line}
        partCount={partCount}
        onClose={() => setQuickProductOpen(false)}
        onSave={async (options) => {
          await onCreateQuickProduct?.(line, options, index);
        }}
      />

      <ProductNotesModal
        open={notesOpen}
        line={line}
        onClose={() => setNotesOpen(false)}
        onSave={async (notes) => {
          await onSaveNotes?.(line, notes, index);
        }}
      />

      {partsOpen && (
        <BuilderPartsPanel
          builderProductId={line.builder_product_id}
          refreshKey={`${line.last_price_check_at || ""}:${line.last_price_update_at || ""}:${line.price_state || ""}`}
          onLoaded={setPartCount}
          onEditBuilder={() => onEdit?.(line, index)}
          onProductRefresh={onProductRefresh}
          allowAddParts={isCustom}
          estimateId={line.estimate_id}
        />
      )}
    </div>
  );
}
