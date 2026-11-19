import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Box,
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  CopyPlus,
  Layers3,
  Link2,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Unlink
} from "lucide-react";
import CreatePartGroupModal from "./CreatePartGroupModal";
import BuilderPartEditWarningModal from "./BuilderPartEditWarningModal";
import DetachedPartOverrideModal from "./DetachedPartOverrideModal";
import MasterPartPickerModal from "@/components/estimator/parts/MasterPartPickerModal";
import { base44 } from "@/api/base44Client";
import { staffEntities } from "@/components/staff/staffEntities";
import { detachBuilderPartOverride, updateDetachedPartOverride } from "@/components/estimator/builder/partSync";
import { CopyBomButton } from "@/components/importer/ImportExportButtons";
import { addCatalogPartToProduct, removeManualProductPart, switchManualProductPart, updateManualProductPart } from "@/components/estimator/parts/customProductService";
import { typeDetails } from "@/components/estimator/parts/partCatalog";
import { money } from "@/components/estimator/aioPricing";
import FoundationReinforcementPricingInfo from "@/components/estimator/foundation/FoundationReinforcementPricingInfo";
import { foundationReinforcementPricingPresentation } from "@/components/estimator/foundation/foundationReinforcementFrozenPricing";
import { copyPartGroupToClipboard, copyPartToClipboard } from "@/components/estimator/products/clipboardService";
import { clonePartGroupInProduct, createPartGroupInProduct, dissolvePartGroup, moveIndependentPartGroup, renamePartGroup } from "@/components/estimator/parts/partGroupService";
import { expectedBuilderEntityFields, replaceBuilderEntityFieldsIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";
import MovePartGroupModal from "./MovePartGroupModal";
import SavePartTemplateModal from "@/components/estimator/parts/SavePartTemplateModal";
import PartLibraryPickerModal from "@/components/estimator/parts/PartLibraryPickerModal";
import VendorCostBadge from "@/components/estimator/VendorCostBadge";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const PART_ROW_PAGE = 100;
const typeLabel = (part) => String(part?.part_type || "part").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
const priceStateMeta = (part) => {
  if (["detached", "reattach_available"].includes(part.inventory_link_state) || part.price_state === "detached") {
    return { label: "Detached", className: "bg-amber-50 text-amber-700 border-amber-200", icon: Unlink };
  }
  if (part.price_state === "changed") {
    return { label: "Price updated", className: "bg-amber-50 text-amber-700 border-amber-200", icon: AlertTriangle };
  }
  if (part.price_state === "legacy_frozen") {
    return { label: "Frozen legacy price", className: "bg-slate-100 text-slate-600 border-slate-200", icon: LockKeyhole };
  }
  return { label: "Price current", className: "bg-green-50 text-green-700 border-green-200", icon: Link2 };
};
function PartRow({ part, index, selectionMode = false, selected = false, onSelect, onChanged, onEditBuilder, estimateId, expectedEstimateUpdatedAt = "", readOnly = false }) {
  const [open, setOpen] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveLibraryOpen, setSaveLibraryOpen] = useState(false);
  const frozen = num(part.frozen_extended_cost);
  const current = num(part.current_extended_cost, frozen);
  const differs = Math.abs(current - frozen) > 5e-3;
  const reinforcementPricing = foundationReinforcementPricingPresentation(part);
  const meta = reinforcementPricing ? reinforcementPricing.removalPending ? { label: "Removal pending", className: "bg-amber-50 text-amber-700 border-amber-200", icon: AlertTriangle } : !reinforcementPricing.current || reinforcementPricing.catalogUnverified ? { label: "Recalculation required", className: "bg-amber-50 text-amber-700 border-amber-200", icon: AlertTriangle } : reinforcementPricing.frozenStatus === "invalid" ? { label: "Review frozen basis", className: "bg-amber-50 text-amber-700 border-amber-200", icon: AlertTriangle } : priceStateMeta(part) : priceStateMeta(part);
  const StatusIcon = meta.icon;
  const isManual = part.builder_sync_state === "manual";
  const isManualAddon = part.builder_sync_state === "manual_addon";
  const isDetachedOverride = part.builder_sync_state === "detached_override";
  const isDirectlyEditable = isManual || isManualAddon;
  const isIndependent = isDirectlyEditable || isDetachedOverride;
  const inventoryDetails = typeDetails(part.inventory_entity, part.frozen_inventory_snapshot || {}, part.detail_overrides || {});
  return /* @__PURE__ */ jsxs("div", { className: "border border-gray-200 rounded-sm bg-white overflow-hidden", children: [
    /* @__PURE__ */ jsxs("div", { className: "w-full min-h-[42px] px-3 py-2 flex items-center gap-2 text-left hover:bg-gray-50", children: [
      selectionMode && /* @__PURE__ */ jsx(
        "input",
        {
          type: "checkbox",
          checked: selected,
          onChange: (event) => onSelect?.(part.id, event.target.checked),
          className: "h-4 w-4 rounded border-gray-300 accent-lime-500 flex-shrink-0",
          "aria-label": `Select ${part.part_name || "Part"}`
        }
      ),
      /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          onClick: () => setOpen((value) => !value),
          "aria-expanded": open,
          className: "flex-1 min-w-0 flex items-center gap-2 text-left",
          children: [
            open ? /* @__PURE__ */ jsx(ChevronDown, { className: "w-3.5 h-3.5 text-gray-500", "aria-hidden": "true" }) : /* @__PURE__ */ jsx(ChevronRight, { className: "w-3.5 h-3.5 text-gray-500", "aria-hidden": "true" }),
            /* @__PURE__ */ jsx(Box, { className: "w-3.5 h-3.5 text-gray-400", "aria-hidden": "true" }),
            /* @__PURE__ */ jsxs("span", { className: "text-[9px] font-bold tracking-wider text-gray-400 w-[52px] flex-shrink-0", children: [
              "PART ",
              String(index + 1).padStart(2, "0")
            ] }),
            /* @__PURE__ */ jsx("span", { className: "text-[12px] font-semibold text-gray-900 truncate flex-1", children: part.client_label || part.part_name || "Part" }),
            /* @__PURE__ */ jsx("span", { className: "hidden md:inline text-[10px] text-gray-500 px-2 py-0.5 rounded bg-gray-100", children: typeLabel(part) }),
            /* @__PURE__ */ jsxs("span", { className: `hidden sm:inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full border ${meta.className}`, children: [
              /* @__PURE__ */ jsx(StatusIcon, { className: "w-3 h-3", "aria-hidden": "true" }),
              " ",
              meta.label
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "text-right w-[92px] flex-shrink-0", children: [
              /* @__PURE__ */ jsx("div", { className: "text-[11px] font-bold text-gray-800", children: money(frozen) }),
              differs && /* @__PURE__ */ jsxs("div", { className: "text-[9px] text-amber-600", children: [
                "current ",
                money(current)
              ] })
            ] })
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsx(
      VendorCostBadge,
      {
        part,
        onEdit: readOnly ? null : () => isIndependent ? setOverrideOpen(true) : setWarningOpen(true)
      }
    ),
    open && /* @__PURE__ */ jsxs("div", { className: "border-t border-gray-200 bg-gray-50 px-3 py-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2 mb-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "text-[10px] text-gray-500", children: [
          isManual ? "Custom Product Part \u2014 edit directly or keep tracking its Master Inventory price." : isManualAddon ? "Independent add-on Part \u2014 not controlled by this Builder and safe from Builder recalculation." : isDetachedOverride ? "Independent override \u2014 Builder synchronization is disabled." : "Builder-linked Part \u2014 edit through the Builder or detach it first.",
          isDetachedOverride && part.builder_detached_at && /* @__PURE__ */ jsxs("div", { className: "text-[10px] text-amber-700 mt-0.5", children: [
            "Detached ",
            new Date(part.builder_detached_at).toLocaleString(),
            part.builder_detached_by ? ` by ${part.builder_detached_by}` : "",
            part.builder_detached_reason ? ` \u2014 ${part.builder_detached_reason}` : ""
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5", children: [
          estimateId && /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              disabled: copying,
              onClick: async () => {
                setCopying(true);
                try {
                  await copyPartToClipboard({ estimateId, builderProductId: part.builder_product_id, part });
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch (error) {
                  window.alert(error?.message || "Part could not be copied to the estimator clipboard.");
                } finally {
                  setCopying(false);
                }
              },
              className: "h-[28px] px-2.5 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-100 inline-flex items-center gap-1 disabled:opacity-50",
              title: "Copy Part to 30-day Clipboard",
              "aria-label": `Copy ${part.part_name || "Part"} to 30-day clipboard`,
              children: [
                /* @__PURE__ */ jsx(ClipboardCopy, { className: "w-3 h-3", "aria-hidden": "true" }),
                " ",
                copied ? "Copied" : "Copy"
              ]
            }
          ),
          /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => setSaveLibraryOpen(true), className: "h-[28px] px-2.5 rounded border border-violet-200 bg-white text-[11px] font-semibold text-violet-700 hover:bg-violet-50 inline-flex items-center gap-1", title: "Save Part permanently to Part Library", "aria-label": `Save ${part.part_name || "Part"} permanently to Part Library`, children: [
            /* @__PURE__ */ jsx(BookmarkPlus, { className: "w-3 h-3", "aria-hidden": "true" }),
            " Save"
          ] }),
          !readOnly && isDirectlyEditable && /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => setSwitchOpen(true), className: "h-[28px] px-3 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-100 inline-flex items-center gap-1", children: [
            /* @__PURE__ */ jsx(RefreshCw, { className: "w-3 h-3", "aria-hidden": "true" }),
            " Switch Part"
          ] }),
          !readOnly && /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => isIndependent ? setOverrideOpen(true) : setWarningOpen(true),
              className: "h-[28px] px-3 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-100",
              children: isDetachedOverride ? "Edit Override" : "Edit Part"
            }
          ),
          !readOnly && isDirectlyEditable && /* @__PURE__ */ jsx("button", { type: "button", onClick: async () => {
            if (!window.confirm(`Remove "${part.part_name || "Part"}" from this Product?`)) return;
            await removeManualProductPart(part.id, { builderProductId: part.builder_product_id, expectedEstimateUpdatedAt, expectedPartUpdatedAt: part.updated_date || "" });
            await onChanged?.();
          }, className: "h-[28px] px-2.5 rounded border border-red-200 bg-white text-[11px] font-semibold text-red-600 hover:bg-red-50", title: "Remove Part", "aria-label": `Remove ${part.part_name || "Part"} from this Product`, children: /* @__PURE__ */ jsx(Trash2, { className: "w-3 h-3", "aria-hidden": "true" }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3", children: [
        /* @__PURE__ */ jsxs("section", { className: "rounded border border-gray-200 bg-white p-3", children: [
          /* @__PURE__ */ jsx("div", { className: "text-[9px] font-bold tracking-widest text-gray-400 mb-2", children: "PART INFORMATION" }),
          /* @__PURE__ */ jsxs("dl", { className: "space-y-1.5 text-[11px]", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
              /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Type" }),
              /* @__PURE__ */ jsx("dd", { className: "font-medium text-gray-800 text-right", children: typeLabel(part) })
            ] }),
            part.part_subtype && /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
              /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Subtype" }),
              /* @__PURE__ */ jsx("dd", { className: "font-medium text-gray-800 text-right", children: String(part.part_subtype).replaceAll("_", " ") })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "flex justify-between gap-3", children: reinforcementPricing ? /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Priced quantity" }),
              /* @__PURE__ */ jsx("dd", { className: "font-medium text-gray-800 text-right", children: reinforcementPricing.current ? `${reinforcementPricing.current.quantity} ${reinforcementPricing.current.unit}` : reinforcementPricing.removalPending ? "Removal pending" : "Unavailable" })
            ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Quantity" }),
              /* @__PURE__ */ jsxs("dd", { className: "font-medium text-gray-800 text-right", children: [
                num(part.quantity, 1).toLocaleString(),
                " ",
                part.unit || ""
              ] })
            ] }) }),
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
              /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Builder source" }),
              /* @__PURE__ */ jsx("dd", { className: "font-medium text-gray-800 text-right truncate max-w-[190px]", children: part.source_module_key || "Manual" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("section", { className: "rounded border border-gray-200 bg-white p-3", children: [
          /* @__PURE__ */ jsx("div", { className: "text-[9px] font-bold tracking-widest text-gray-400 mb-2", children: "MASTER INVENTORY LINK" }),
          /* @__PURE__ */ jsxs("dl", { className: "space-y-1.5 text-[11px]", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
              /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Status" }),
              /* @__PURE__ */ jsx("dd", { className: "font-medium text-right", children: part.inventory_link_state === "manual" ? "Manual / Builder cost" : String(part.inventory_link_state || "manual").replaceAll("_", " ") })
            ] }),
            part.inventory_item_name && /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
              /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Inventory Part" }),
              /* @__PURE__ */ jsx("dd", { className: "font-medium text-gray-800 text-right truncate max-w-[190px]", children: part.inventory_item_name })
            ] }),
            part.inventory_entity && /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
              /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Inventory Type" }),
              /* @__PURE__ */ jsx("dd", { className: "font-medium text-gray-800 text-right truncate max-w-[190px]", children: part.inventory_entity })
            ] }),
            part.reattach_candidate_name && /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
              /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Suggested match" }),
              /* @__PURE__ */ jsx("dd", { className: "font-medium text-lime-700 text-right truncate max-w-[190px]", children: part.reattach_candidate_name })
            ] })
          ] })
        ] }),
        reinforcementPricing ? /* @__PURE__ */ jsx(FoundationReinforcementPricingInfo, { presentation: reinforcementPricing, formatMoney: money }) : /* @__PURE__ */ jsxs("section", { className: "rounded border border-gray-200 bg-white p-3", children: [
          /* @__PURE__ */ jsx("div", { className: "text-[9px] font-bold tracking-widest text-gray-400 mb-2", children: "PRICING INFORMATION" }),
          /* @__PURE__ */ jsxs("dl", { className: "space-y-1.5 text-[11px]", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
              /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Frozen unit cost" }),
              /* @__PURE__ */ jsx("dd", { className: "font-semibold text-gray-800", children: money(num(part.frozen_unit_cost)) })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
              /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Frozen extended" }),
              /* @__PURE__ */ jsx("dd", { className: "font-semibold text-gray-800", children: money(frozen) })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
              /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Current unit cost" }),
              /* @__PURE__ */ jsx("dd", { className: differs ? "font-semibold text-amber-700" : "font-semibold text-gray-800", children: money(num(part.current_unit_cost, num(part.frozen_unit_cost))) })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3", children: [
              /* @__PURE__ */ jsx("dt", { className: "text-gray-500", children: "Current extended" }),
              /* @__PURE__ */ jsx("dd", { className: differs ? "font-semibold text-amber-700" : "font-semibold text-gray-800", children: money(current) })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("section", { className: "rounded border border-gray-200 bg-white p-3", children: [
          /* @__PURE__ */ jsx("div", { className: "text-[9px] font-bold tracking-widest text-gray-400 mb-2", children: "TYPE-SPECIFIC DETAILS" }),
          inventoryDetails.length ? /* @__PURE__ */ jsx("dl", { className: "space-y-1.5 text-[11px] max-h-[170px] overflow-y-auto pr-1", children: inventoryDetails.map((detail) => /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-3 border-b border-gray-50 pb-1 last:border-b-0", children: [
            /* @__PURE__ */ jsxs("dt", { className: "text-gray-500 flex items-center gap-1", children: [
              detail.label,
              detail.overridden && /* @__PURE__ */ jsx("span", { className: "text-[8px] px-1 rounded bg-amber-100 text-amber-700 border border-amber-200", children: "OVERRIDE" })
            ] }),
            /* @__PURE__ */ jsx("dd", { className: "font-medium text-gray-800 text-right max-w-[190px] break-words", children: Array.isArray(detail.value) ? detail.value.join(", ") : String(detail.value).replaceAll("_", " ") })
          ] }, detail.field)) }) : /* @__PURE__ */ jsx("div", { className: "text-[10px] text-gray-400", children: "No additional type-specific inventory fields for this Part." })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(
      BuilderPartEditWarningModal,
      {
        open: warningOpen,
        part,
        onCancel: () => setWarningOpen(false),
        onEditBuilder: () => {
          setWarningOpen(false);
          onEditBuilder?.();
        },
        onDetach: async () => {
          await detachBuilderPartOverride(part.id, void 0, { expectedEstimateUpdatedAt, expectedPartUpdatedAt: part.updated_date || "" });
          setWarningOpen(false);
          setOverrideOpen(true);
          await onChanged?.();
        }
      }
    ),
    /* @__PURE__ */ jsx(
      DetachedPartOverrideModal,
      {
        open: overrideOpen,
        part,
        mode: isDirectlyEditable ? "manual" : "detached",
        onClose: () => setOverrideOpen(false),
        onSave: async (changes) => {
          if (isDirectlyEditable) await updateManualProductPart(part.id, changes, { expectedEstimateUpdatedAt, expectedPartUpdatedAt: part.updated_date || "" });
          else await updateDetachedPartOverride(part.id, changes, { expectedEstimateUpdatedAt, expectedPartUpdatedAt: part.updated_date || "" });
          setOverrideOpen(false);
          await onChanged?.();
        }
      }
    ),
    /* @__PURE__ */ jsx(
      SavePartTemplateModal,
      {
        open: saveLibraryOpen,
        itemType: "part",
        part,
        estimateId,
        builderProductId: part.builder_product_id,
        onClose: () => setSaveLibraryOpen(false)
      }
    ),
    isDirectlyEditable && /* @__PURE__ */ jsx(
      MasterPartPickerModal,
      {
        open: switchOpen,
        mode: "switch",
        suggestQuery: part.part_name || part.inventory_item_name || "",
        initialQuantity: part.quantity || 1,
        onClose: () => setSwitchOpen(false),
        onAdd: async (item) => {
          await switchManualProductPart(part.id, item, { expectedEstimateUpdatedAt, expectedPartUpdatedAt: part.updated_date || "" });
          setSwitchOpen(false);
          await onChanged?.();
        }
      }
    )
  ] });
}
function PartGroup({ group, parts, globalOffset, selectionMode, selectedIds, onSelect, onChanged, builderProductId, onEditBuilder, estimateId, expectedEstimateUpdatedAt = "", availableProducts = [], readOnly = false }) {
  const [open, setOpen] = useState(!group.is_collapsed);
  const [visibleParts, setVisibleParts] = useState(PART_ROW_PAGE);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.group_name || "Part Group");
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [saveLibraryOpen, setSaveLibraryOpen] = useState(false);
  const structuralActionRef = useRef(false);
  const groupVersionRef = useRef(group.updated_date || "");
  useEffect(() => {
    groupVersionRef.current = group.updated_date || groupVersionRef.current;
  }, [group.updated_date]);
  const frozen = parts.reduce((sum, part) => sum + num(part.frozen_extended_cost), 0);
  const canMove = parts.length > 0 && parts.every((part) => ["manual", "manual_addon"].includes(part.builder_sync_state));
  const moveTargets = (availableProducts || []).filter((line) => line.builder_product_id && line.builder_product_id !== builderProductId);
  const toggleOpen = async () => {
    const next = !open;
    setOpen(next);
    if (!readOnly) {
      const current = await base44.entities.BuilderPartGroup.get(group.id).catch(() => null);
      if (!current?.id || current.builder_product_id !== builderProductId) return;
      const collapsePatch = { is_collapsed: !next };
      const updated = await replaceBuilderEntityFieldsIfUnchanged({
        entity: base44.entities.BuilderPartGroup,
        id: group.id,
        expectedUpdatedAt: current.updated_date || "",
        expectedFields: expectedBuilderEntityFields(current, collapsePatch),
        nextFields: collapsePatch,
        guardFields: { builder_product_id: builderProductId },
        label: "Part Group collapsed state"
      }).catch(() => null);
      if (updated?.updated_date) groupVersionRef.current = updated.updated_date;
      else if (current?.updated_date) groupVersionRef.current = current.updated_date;
    }
  };
  const saveName = async () => {
    if (structuralActionRef.current) return;
    structuralActionRef.current = true;
    const nextName = name.trim() || "Part Group";
    setName(nextName);
    setRenaming(false);
    try {
      await renamePartGroup({
        builderProductId,
        groupId: group.id,
        groupName: nextName,
        expectedEstimateUpdatedAt,
        expectedGroupUpdatedAt: groupVersionRef.current
      });
      await onChanged?.();
    } catch (error) {
      window.alert(error?.message || "Part Group could not be renamed.");
    } finally {
      structuralActionRef.current = false;
    }
  };
  const dissolve = async () => {
    if (structuralActionRef.current) return;
    if (!window.confirm(`Dissolve "${group.group_name || "Part Group"}"? The Parts will stay in this Product and keep all frozen pricing.`)) return;
    structuralActionRef.current = true;
    try {
      await dissolvePartGroup({
        builderProductId,
        groupId: group.id,
        expectedEstimateUpdatedAt,
        expectedGroupUpdatedAt: groupVersionRef.current,
        expectedPartVersions: Object.fromEntries(parts.map((part) => [part.id, part.updated_date || ""]))
      });
      await onChanged?.();
    } catch (error) {
      await Promise.resolve(onChanged?.()).catch(() => null);
      window.alert(`${error?.message || "Part Group could not be dissolved."}

The Product was refreshed. If the dissolve had already started, use Resume Group Dissolve to safely continue it.`);
    } finally {
      structuralActionRef.current = false;
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "border border-gray-300 rounded-sm overflow-hidden bg-gray-50", children: [
    /* @__PURE__ */ jsxs("div", { className: "w-full px-3 py-2 flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-left", children: [
      /* @__PURE__ */ jsxs("button", { type: "button", onClick: toggleOpen, "aria-expanded": open, className: "flex items-center gap-2 min-w-0 flex-1 text-left", children: [
        open ? /* @__PURE__ */ jsx(ChevronDown, { className: "w-3.5 h-3.5 text-gray-600", "aria-hidden": "true" }) : /* @__PURE__ */ jsx(ChevronRight, { className: "w-3.5 h-3.5 text-gray-600", "aria-hidden": "true" }),
        /* @__PURE__ */ jsx(Layers3, { className: "w-4 h-4 text-gray-600", "aria-hidden": "true" }),
        /* @__PURE__ */ jsx("span", { className: "text-[9px] font-extrabold tracking-widest text-gray-500", children: "PART GROUP" }),
        renaming ? /* @__PURE__ */ jsx(
          "input",
          {
            autoFocus: true,
            value: name,
            onChange: (event) => setName(event.target.value),
            onClick: (event) => event.stopPropagation(),
            "aria-label": "Part Group name",
            onKeyDown: (event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveName();
              }
              if (event.key === "Escape") {
                setName(group.group_name || "Part Group");
                setRenaming(false);
              }
            },
            onBlur: saveName,
            className: "h-[25px] px-2 border border-gray-300 rounded bg-white text-[12px] font-bold text-gray-900 flex-1 min-w-[120px]"
          }
        ) : /* @__PURE__ */ jsx("span", { className: "text-[12px] font-bold text-gray-900 truncate flex-1", children: group.group_name || "Part Group" }),
        /* @__PURE__ */ jsxs("span", { className: "text-[10px] text-gray-500", children: [
          parts.length,
          " parts"
        ] }),
        /* @__PURE__ */ jsx("span", { className: "text-[11px] font-bold text-gray-800 w-[92px] text-right", children: money(frozen) })
      ] }),
      !selectionMode && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1 ml-1", children: [
        estimateId && /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            disabled: copying,
            onClick: async () => {
              setCopying(true);
              try {
                await copyPartGroupToClipboard({ estimateId, builderProductId, group, parts });
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch (error) {
                window.alert(error?.message || "Part Group could not be copied to the estimator clipboard.");
              } finally {
                setCopying(false);
              }
            },
            className: "h-[26px] px-2 rounded border border-gray-300 bg-white flex items-center gap-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50",
            title: "Copy Part Group to 30-day Clipboard",
            "aria-label": `Copy ${group.group_name || "Part Group"} to 30-day clipboard`,
            children: [
              /* @__PURE__ */ jsx(ClipboardCopy, { className: "w-3 h-3", "aria-hidden": "true" }),
              " ",
              copied ? "Copied" : "Copy"
            ]
          }
        ),
        /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: () => setSaveLibraryOpen(true),
            className: "h-[26px] px-2 rounded border border-violet-200 bg-white flex items-center gap-1 text-[10px] font-semibold text-violet-700 hover:bg-violet-50",
            title: "Save Part Group permanently to Part Library",
            "aria-label": `Save ${group.group_name || "Part Group"} permanently to Part Library`,
            children: [
              /* @__PURE__ */ jsx(BookmarkPlus, { className: "w-3 h-3", "aria-hidden": "true" }),
              " Save"
            ]
          }
        ),
        !readOnly && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              disabled: cloning,
              onClick: async () => {
                if (!window.confirm(`Clone "${group.group_name || "Part Group"}" and all ${parts.length} Part${parts.length === 1 ? "" : "s"}?`)) return;
                if (structuralActionRef.current) return;
                structuralActionRef.current = true;
                setCloning(true);
                try {
                  await clonePartGroupInProduct({
                    builderProductId,
                    groupId: group.id,
                    expectedEstimateUpdatedAt,
                    expectedGroupUpdatedAt: groupVersionRef.current,
                    expectedPartVersions: Object.fromEntries(parts.map((part) => [part.id, part.updated_date || ""]))
                  });
                  await onChanged?.();
                } catch (error) {
                  await Promise.resolve(onChanged?.()).catch(() => null);
                  window.alert(`${error?.message || "Part Group could not be cloned."}

The Product was refreshed. If the clone had already started, use Resume Group Clone to safely continue it.`);
                } finally {
                  structuralActionRef.current = false;
                  setCloning(false);
                }
              },
              className: "h-[26px] px-2 rounded border border-gray-300 bg-white flex items-center gap-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50",
              title: "Clone Part Group in this Product",
              "aria-label": `Clone ${group.group_name || "Part Group"} in this Product`,
              children: [
                /* @__PURE__ */ jsx(CopyPlus, { className: "w-3 h-3", "aria-hidden": "true" }),
                " ",
                cloning ? "Cloning\u2026" : "Clone"
              ]
            }
          ),
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              disabled: !canMove || moveTargets.length === 0,
              onClick: () => setMoveOpen(true),
              className: "h-[26px] px-2 rounded border border-gray-300 bg-white flex items-center gap-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40",
              title: canMove ? "Move Part Group to another Product" : "Builder-owned Parts cannot move directly. Use Clone or Copy instead.",
              "aria-label": canMove ? `Move ${group.group_name || "Part Group"} to another Product` : "Builder-owned Parts cannot move directly. Use Clone or Copy instead.",
              children: [
                /* @__PURE__ */ jsx(ArrowRightLeft, { className: "w-3 h-3", "aria-hidden": "true" }),
                " Move"
              ]
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => setRenaming(true),
              className: "w-[26px] h-[26px] rounded border border-gray-300 bg-white flex items-center justify-center text-gray-600 hover:bg-gray-50",
              title: "Rename Part Group",
              "aria-label": `Rename ${group.group_name || "Part Group"}`,
              children: /* @__PURE__ */ jsx(Pencil, { className: "w-3 h-3", "aria-hidden": "true" })
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: dissolve,
              className: "w-[26px] h-[26px] rounded border border-gray-300 bg-white flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-red-50",
              title: "Dissolve Part Group",
              "aria-label": `Dissolve ${group.group_name || "Part Group"}`,
              children: /* @__PURE__ */ jsx(Unlink, { className: "w-3 h-3", "aria-hidden": "true" })
            }
          )
        ] })
      ] })
    ] }),
    open && /* @__PURE__ */ jsxs("div", { className: "p-2 space-y-2 border-t border-gray-200", children: [
      parts.slice(0, visibleParts).map((part, index) => /* @__PURE__ */ jsx(
        PartRow,
        {
          part,
          index: globalOffset + index,
          selectionMode,
          selected: selectedIds.has(part.id),
          onSelect,
          onChanged,
          onEditBuilder,
          estimateId,
          expectedEstimateUpdatedAt,
          readOnly
        },
        part.id
      )),
      parts.length > visibleParts && /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          onClick: () => setVisibleParts((value) => value + PART_ROW_PAGE),
          className: "w-full h-[28px] rounded border border-gray-300 bg-white text-[10px] font-bold text-gray-600 hover:bg-gray-50",
          children: [
            "Show ",
            Math.min(PART_ROW_PAGE, parts.length - visibleParts),
            " more parts (",
            parts.length - visibleParts,
            " remaining)"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsx(
      MovePartGroupModal,
      {
        open: moveOpen,
        group,
        sourceBuilderProductId: builderProductId,
        products: moveTargets,
        onClose: () => setMoveOpen(false),
        onMove: async (targetBuilderProductId) => {
          if (structuralActionRef.current) return;
          structuralActionRef.current = true;
          try {
            await moveIndependentPartGroup({
              sourceBuilderProductId: builderProductId,
              targetBuilderProductId,
              groupId: group.id,
              expectedEstimateUpdatedAt,
              expectedGroupUpdatedAt: groupVersionRef.current,
              expectedPartVersions: Object.fromEntries(parts.map((part) => [part.id, part.updated_date || ""]))
            });
            setMoveOpen(false);
            await onChanged?.();
          } catch (error) {
            await Promise.resolve(onChanged?.()).catch(() => null);
            throw new Error(`${error?.message || "Part Group could not be moved."}

The Products were refreshed. If the move had already started, use Resume Group Move to safely continue it.`);
          } finally {
            structuralActionRef.current = false;
          }
        }
      }
    ),
    /* @__PURE__ */ jsx(
      SavePartTemplateModal,
      {
        open: saveLibraryOpen,
        itemType: "part_group",
        group,
        parts,
        estimateId,
        builderProductId,
        onClose: () => setSaveLibraryOpen(false)
      }
    )
  ] });
}
export default function BuilderPartsPanel({ builderProductId, refreshKey, onLoaded, onEditBuilder, onProductRefresh, allowAddParts = false, estimateId, expectedEstimateUpdatedAt = "", availableProducts = [], readOnly = false }) {
  const [loading, setLoading] = useState(!!builderProductId);
  const [parts, setParts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [dragGroupIdx, setDragGroupIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(/* @__PURE__ */ new Set());
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [partPickerOpen, setPartPickerOpen] = useState(false);
  const [partLibraryOpen, setPartLibraryOpen] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [partSearch, setPartSearch] = useState("");
  const [ungroupedVisible, setUngroupedVisible] = useState(PART_ROW_PAGE);
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [bulkDetaching, setBulkDetaching] = useState(false);
  const groupCreateRef = useRef(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!builderProductId) {
        setParts([]);
        setGroups([]);
        setLoading(false);
        onLoaded?.(0);
        return;
      }
      setLoading(true);
      try {
        const [partRows, groupRows] = await Promise.all([
          loadAllEntityRows({ entity: base44.entities.BuilderPart, query: { builder_product_id: builderProductId }, sort: "sort_order", label: "Builder Parts panel Parts" }),
          loadAllEntityRows({ entity: base44.entities.BuilderPartGroup, query: { builder_product_id: builderProductId }, sort: "sort_order", label: "Builder Parts panel Groups" })
        ]);
        if (!active) return;
        const activeParts = (partRows || []).filter((part) => part.is_active !== false).sort((a, b) => num(a.sort_order) - num(b.sort_order));
        const activeGroups = (groupRows || []).filter((group) => group.is_active !== false).sort((a, b) => num(a.sort_order) - num(b.sort_order));
        setParts(activeParts);
        setGroups(activeGroups);
        onLoaded?.(activeParts.length);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [builderProductId, refreshKey, refreshNonce]);
  const togglePartSelection = (partId, checked) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(partId);
      else next.delete(partId);
      return next;
    });
  };
  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectedIds(/* @__PURE__ */ new Set());
    setGroupModalOpen(false);
  };
  const removableSelected = parts.filter((part) => selectedIds.has(part.id) && ["manual", "manual_addon"].includes(part.builder_sync_state));
  const bulkRemoveSelected = async () => {
    if (!builderProductId || bulkRemoving || !removableSelected.length) return;
    const skipped = selectedIds.size - removableSelected.length;
    const message = skipped > 0 ? `Remove ${removableSelected.length} independent Part${removableSelected.length === 1 ? "" : "s"}? ${skipped} Builder-linked Part${skipped === 1 ? "" : "s"} will be kept (remove those through the Builder).` : `Remove ${removableSelected.length} independent Part${removableSelected.length === 1 ? "" : "s"} from this Product?`;
    if (!window.confirm(message)) return;
    setBulkRemoving(true);
    const failures = [];
    try {
      for (const part of removableSelected) {
        try {
          await removeManualProductPart(part.id, { builderProductId, expectedEstimateUpdatedAt, expectedPartUpdatedAt: part.updated_date || "" });
        } catch (error) {
          failures.push(`${part.part_name || "Part"}: ${error?.message || "remove failed"}`);
        }
      }
      setSelectionMode(false);
      setSelectedIds(/* @__PURE__ */ new Set());
      setRefreshNonce((value) => value + 1);
      await onProductRefresh?.();
      if (failures.length) {
        window.alert(`${failures.length} Part${failures.length === 1 ? "" : "s"} could not be removed:
${failures.join("\n")}

The Product was refreshed. If a removal had already started, use Resume Part Remove to safely continue it.`);
      }
    } finally {
      setBulkRemoving(false);
    }
  };
  const detachableSelected = parts.filter((part) => selectedIds.has(part.id) && part.builder_sync_state === "linked");
  const bulkDetachSelected = async () => {
    if (!builderProductId || bulkDetaching || !detachableSelected.length) return;
    if (!window.confirm(`Detach ${detachableSelected.length} Builder-linked Part${detachableSelected.length === 1 ? "" : "s"} for independent override? Frozen pricing is retained; each Part stops syncing with the Builder.`)) return;
    setBulkDetaching(true);
    const failures = [];
    try {
      for (const part of detachableSelected) {
        try {
          await detachBuilderPartOverride(part.id, void 0, { expectedEstimateUpdatedAt, expectedPartUpdatedAt: part.updated_date || "" });
        } catch (error) {
          failures.push(`${part.part_name || "Part"}: ${error?.message || "detach failed"}`);
        }
      }
      setSelectionMode(false);
      setSelectedIds(/* @__PURE__ */ new Set());
      setRefreshNonce((value) => value + 1);
      await onProductRefresh?.();
      if (failures.length) {
        window.alert(`${failures.length} Part${failures.length === 1 ? "" : "s"} could not be detached:
${failures.join("\n")}

The Product was refreshed. If a detach had already started, use Resume Part Detach to safely continue it.`);
      }
    } finally {
      setBulkDetaching(false);
    }
  };
  const createGroup = async (groupName) => {
    const selectedParts = parts.filter((part) => selectedIds.has(part.id));
    if (!builderProductId || selectedParts.length < 2 || groupCreateRef.current) return;
    groupCreateRef.current = true;
    try {
      await createPartGroupInProduct({
        builderProductId,
        partIds: selectedParts.map((part) => part.id),
        groupName,
        expectedEstimateUpdatedAt,
        expectedPartVersions: Object.fromEntries(selectedParts.map((part) => [part.id, part.updated_date || ""]))
      });
      setGroupModalOpen(false);
      setSelectionMode(false);
      setSelectedIds(/* @__PURE__ */ new Set());
      setRefreshNonce((value) => value + 1);
      await onProductRefresh?.();
    } catch (error) {
      setRefreshNonce((value) => value + 1);
      await Promise.resolve(onProductRefresh?.()).catch(() => null);
      window.alert(`${error?.message || "Part Group could not be created."}

The Product was refreshed. If creation had already started, use Resume Group Create to safely continue it.`);
    } finally {
      groupCreateRef.current = false;
    }
  };
  const partQuery = partSearch.trim().toLowerCase();
  const visibleParts = useMemo(() => {
    if (!partQuery) return parts;
    return parts.filter(
      (part) => [part.part_name, part.client_label, part.inventory_item_name, part.part_type, part.part_subtype].filter(Boolean).some((value) => String(value).toLowerCase().includes(partQuery))
    );
  }, [parts, partQuery]);
  const grouped = useMemo(() => {
    const byGroup = /* @__PURE__ */ new Map();
    groups.forEach((group) => byGroup.set(group.id, []));
    const ungrouped = [];
    visibleParts.forEach((part) => {
      if (part.part_group_id && byGroup.has(part.part_group_id)) byGroup.get(part.part_group_id).push(part);
      else ungrouped.push(part);
    });
    return { byGroup, ungrouped };
  }, [visibleParts, groups]);
  if (!builderProductId) {
    return /* @__PURE__ */ jsx("div", { className: "px-4 py-4 text-[11px] text-gray-400", children: "This legacy Product does not have Builder Parts yet." });
  }
  if (loading) {
    return /* @__PURE__ */ jsx("div", { role: "status", className: "px-4 py-4 text-[11px] text-gray-400", children: "Loading Parts\u2026" });
  }
  if (!parts.length) {
    return /* @__PURE__ */ jsxs("div", { className: "px-4 py-5 text-center border-t border-gray-200 bg-gray-50", children: [
      /* @__PURE__ */ jsx("div", { className: "text-[11px] font-semibold text-gray-600", children: "This Product does not have any Parts yet." }),
      /* @__PURE__ */ jsx("div", { className: "text-[10px] text-gray-400 mt-1", children: "Add a Part from Master Inventory now. Builder-generated BOM Parts will also appear here after the Builder is saved; manually added Parts remain independent add-ons." }),
      allowAddParts && !readOnly && /* @__PURE__ */ jsxs("div", { className: "mt-3 flex items-center justify-center gap-2", children: [
        /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => setPartPickerOpen(true), className: "h-[30px] px-3 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 inline-flex items-center gap-1.5", children: [
          /* @__PURE__ */ jsx(Plus, { className: "w-3.5 h-3.5", "aria-hidden": "true" }),
          " Add Part"
        ] }),
        /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => setPartLibraryOpen(true), className: "h-[30px] px-3 rounded border border-violet-200 bg-white text-[11px] font-bold text-violet-700 hover:bg-violet-50 inline-flex items-center gap-1.5", children: [
          /* @__PURE__ */ jsx(BookmarkPlus, { className: "w-3.5 h-3.5", "aria-hidden": "true" }),
          " Add Saved Part"
        ] }),
        /* @__PURE__ */ jsx(CopyBomButton, { estimateId, targetBuilderProductId: builderProductId, expectedEstimateUpdatedAt })
      ] }),
      /* @__PURE__ */ jsx(
        MasterPartPickerModal,
        {
          open: partPickerOpen,
          onClose: () => setPartPickerOpen(false),
          onAdd: async (item, quantity) => {
            await addCatalogPartToProduct({ builderProductId, catalogItem: item, quantity, expectedEstimateUpdatedAt });
            setRefreshNonce((value) => value + 1);
            await onProductRefresh?.();
          }
        }
      ),
      /* @__PURE__ */ jsx(
        PartLibraryPickerModal,
        {
          open: partLibraryOpen,
          estimateId,
          builderProductId,
          expectedEstimateUpdatedAt,
          onClose: () => setPartLibraryOpen(false),
          onAdded: async () => {
            setRefreshNonce((value) => value + 1);
            await onProductRefresh?.();
          }
        }
      )
    ] });
  }
  let offset = 0;
  const partsFrozenTotal = parts.reduce((sum, part) => sum + num(part.frozen_extended_cost), 0);
  const persistGroupOrder = async (nextGroups) => {
    for (let i = 0; i < nextGroups.length; i++) {
      const g = nextGroups[i];
      if (Number(g.sort_order) !== i) {
        await staffEntities.BuilderPartGroup.updateMany({ id: g.id }, { sort_order: i }).catch(() => null);
      }
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "border-t border-gray-300 bg-[#f6f6f6] px-3 py-3 space-y-2", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2 pb-1", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
        /* @__PURE__ */ jsxs("div", { className: "text-[10px] font-bold tracking-widest text-gray-500 whitespace-nowrap", children: [
          "PRODUCT PARTS \xB7 ",
          partQuery ? `${visibleParts.length}/${parts.length}` : parts.length
        ] }),
        parts.length > 10 && /* @__PURE__ */ jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsx(Search, { className: "w-3 h-3 text-gray-400 absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none", "aria-hidden": "true" }),
          /* @__PURE__ */ jsx(
            "input",
            {
              value: partSearch,
              onChange: (event) => setPartSearch(event.target.value),
              placeholder: "Search parts\u2026",
              "aria-label": "Search parts in this product",
              className: "h-[26px] w-[150px] pl-6 pr-1.5 border border-gray-300 rounded bg-white text-[11px] focus:outline-none focus:border-lime-400"
            }
          )
        ] })
      ] }),
      selectionMode ? /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxs("span", { className: "text-[10px] text-gray-500", children: [
          selectedIds.size,
          " selected"
        ] }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: cancelSelection,
            className: "h-[28px] px-3 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600 hover:bg-gray-50",
            children: "Cancel"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            disabled: selectedIds.size < 2,
            onClick: () => setGroupModalOpen(true),
            className: "h-[28px] px-3 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-40",
            children: "Group Selected Parts"
          }
        ),
        /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            disabled: bulkDetaching || detachableSelected.length === 0,
            onClick: bulkDetachSelected,
            title: detachableSelected.length === 0 ? "Only Builder-linked Parts can be detached" : "Detach the selected Builder-linked Parts for independent override",
            className: "h-[28px] px-3 rounded border border-amber-300 bg-white text-[11px] font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-40 inline-flex items-center gap-1",
            children: [
              /* @__PURE__ */ jsx(Unlink, { className: "w-3.5 h-3.5", "aria-hidden": "true" }),
              " ",
              bulkDetaching ? "Detaching\u2026" : `Detach Selected (${detachableSelected.length})`
            ]
          }
        ),
        /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            disabled: bulkRemoving || removableSelected.length === 0,
            onClick: bulkRemoveSelected,
            title: removableSelected.length === 0 ? "Only independent (non-Builder) Parts can be removed here" : "Remove the selected independent Parts",
            className: "h-[28px] px-3 rounded border border-red-300 bg-white text-[11px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-40 inline-flex items-center gap-1",
            children: [
              /* @__PURE__ */ jsx(Trash2, { className: "w-3.5 h-3.5", "aria-hidden": "true" }),
              " ",
              bulkRemoving ? "Removing\u2026" : `Delete Selected (${removableSelected.length})`
            ]
          }
        )
      ] }) : /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        allowAddParts && !readOnly && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => setPartPickerOpen(true), className: "h-[28px] px-3 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 inline-flex items-center gap-1.5", children: [
            /* @__PURE__ */ jsx(Plus, { className: "w-3.5 h-3.5", "aria-hidden": "true" }),
            " Add Part"
          ] }),
          /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => setPartLibraryOpen(true), className: "h-[28px] px-3 rounded border border-violet-200 bg-white text-[11px] font-bold text-violet-700 hover:bg-violet-50 inline-flex items-center gap-1.5", children: [
            /* @__PURE__ */ jsx(BookmarkPlus, { className: "w-3.5 h-3.5", "aria-hidden": "true" }),
            " Add Saved Part"
          ] }),
          /* @__PURE__ */ jsx(CopyBomButton, { estimateId, targetBuilderProductId: builderProductId, expectedEstimateUpdatedAt })
        ] }),
        !readOnly && /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: () => setSelectionMode(true),
            className: "h-[28px] px-3 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-100 inline-flex items-center gap-1.5",
            children: [
              /* @__PURE__ */ jsx(Layers3, { className: "w-3.5 h-3.5", "aria-hidden": "true" }),
              " Group Parts"
            ]
          }
        )
      ] })
    ] }),
    groups.map((group) => {
      const groupParts = grouped.byGroup.get(group.id) || [];
      if (!groupParts.length) return null;
      const node = /* @__PURE__ */ jsx(
        PartGroup,
        {
          group,
          parts: groupParts,
          globalOffset: offset,
          selectionMode,
          selectedIds,
          onSelect: togglePartSelection,
          onChanged: async () => {
            setRefreshNonce((value) => value + 1);
            await onProductRefresh?.();
          },
          builderProductId,
          onEditBuilder,
          estimateId,
          expectedEstimateUpdatedAt,
          availableProducts,
          readOnly
        },
        group.id
      );
      offset += groupParts.length;
      return readOnly ? node : /* @__PURE__ */ jsx(
        "div",
        {
          draggable: true,
          onDragStart: () => setDragGroupIdx(groups.indexOf(group)),
          onDragOver: (e) => {
            e.preventDefault();
            setDragOverIdx(groups.indexOf(group));
          },
          onDragLeave: () => setDragOverIdx(null),
          onDrop: async (e) => {
            e.preventDefault();
            if (dragGroupIdx === null) return;
            const target = groups.indexOf(group);
            const next = [...groups];
            const [moved] = next.splice(dragGroupIdx, 1);
            next.splice(target, 0, moved);
            setGroups(next);
            setDragGroupIdx(null);
            setDragOverIdx(null);
            await persistGroupOrder(next);
            setRefreshNonce((v) => v + 1);
          },
          onDragEnd: () => {
            setDragGroupIdx(null);
            setDragOverIdx(null);
          },
          className: `${dragOverIdx === groups.indexOf(group) ? "ring-2 ring-emerald-400 rounded" : ""}`,
          children: node
        },
        group.id
      );
    }),
    grouped.ungrouped.slice(0, partQuery ? grouped.ungrouped.length : ungroupedVisible).map((part, index) => /* @__PURE__ */ jsx(
      PartRow,
      {
        part,
        index: offset + index,
        selectionMode,
        selected: selectedIds.has(part.id),
        onSelect: togglePartSelection,
        onChanged: async () => {
          setRefreshNonce((value) => value + 1);
          await onProductRefresh?.();
        },
        onEditBuilder,
        estimateId,
        expectedEstimateUpdatedAt,
        readOnly
      },
      part.id
    )),
    !partQuery && grouped.ungrouped.length > ungroupedVisible && /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        onClick: () => setUngroupedVisible((value) => value + PART_ROW_PAGE),
        className: "w-full h-[28px] rounded border border-gray-300 bg-white text-[10px] font-bold text-gray-600 hover:bg-gray-50",
        children: [
          "Show ",
          Math.min(PART_ROW_PAGE, grouped.ungrouped.length - ungroupedVisible),
          " more parts (",
          grouped.ungrouped.length - ungroupedVisible,
          " remaining)"
        ]
      }
    ),
    partQuery && !visibleParts.length && /* @__PURE__ */ jsxs("div", { className: "py-4 text-center text-[11px] text-gray-400", children: [
      'No Parts match "',
      partSearch,
      '".'
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2 pt-2 border-t border-gray-200", children: [
      /* @__PURE__ */ jsx("div", { className: "text-[10px] font-bold tracking-widest text-gray-500", children: "PARTS TOTAL" }),
      /* @__PURE__ */ jsx("div", { className: "text-[11px] font-bold text-gray-800", children: money(partsFrozenTotal) })
    ] }),
    /* @__PURE__ */ jsx(
      CreatePartGroupModal,
      {
        open: groupModalOpen,
        selectedCount: selectedIds.size,
        onClose: () => setGroupModalOpen(false),
        onCreate: createGroup
      }
    ),
    /* @__PURE__ */ jsx(
      MasterPartPickerModal,
      {
        open: partPickerOpen,
        onClose: () => setPartPickerOpen(false),
        onAdd: async (item, quantity) => {
          await addCatalogPartToProduct({ builderProductId, catalogItem: item, quantity, expectedEstimateUpdatedAt });
          setRefreshNonce((value) => value + 1);
          await onProductRefresh?.();
        }
      }
    ),
    /* @__PURE__ */ jsx(
      PartLibraryPickerModal,
      {
        open: partLibraryOpen,
        estimateId,
        builderProductId,
        expectedEstimateUpdatedAt,
        onClose: () => setPartLibraryOpen(false),
        onAdded: async () => {
          setRefreshNonce((value) => value + 1);
          await onProductRefresh?.();
        }
      }
    )
  ] });
}
