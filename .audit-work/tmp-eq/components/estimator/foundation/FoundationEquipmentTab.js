import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Wrench } from "lucide-react";
import { money, calcEquipmentPricing, equipmentCostTotal } from "./foundationCalc";
import { hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";
import { setFoundationEquipmentCount } from "./foundationEquipmentBindings";
const fin = (v) => Number.isFinite(v);
const intQty = (v) => fin(v) && Number.isInteger(v) && v >= 0;
const amt = (v) => hasFoundationCostSnapshot(v) ? money(v) : "Not saved";
function OverrideChip({ label, value, onClear, moneyVal = false }) {
  if (value === void 0 || value === null) return null;
  return /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1 rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800", children: [
    label,
    ": ",
    moneyVal && typeof value === "number" ? money(value) : String(value),
    /* @__PURE__ */ jsx("button", { type: "button", "aria-label": `Clear ${label}`, onClick: onClear, className: "text-amber-900 hover:underline", children: "Clear" })
  ] });
}
function EquipmentCard({ entry, detail, index, inventory, onUpdate, onRemove, showMiscAttachments }) {
  const [err, setErr] = useState("");
  const [qtyDrafts, setQtyDrafts] = useState({});
  useEffect(() => {
    setQtyDrafts({});
    setErr("");
  }, [entry]);
  const eq = detail.equipment;
  const issues = detail.issues || [];
  const broken = issues.length > 0;
  const update = (next) => onUpdate(index, next);
  const setQty = (kind, id, quantity) => {
    try {
      const next = setFoundationEquipmentCount(entry, { kind, id, quantity });
      setErr("");
      update(next);
    } catch (e) {
      setErr(e.message || "Quantity change rejected.");
    }
  };
  const qtyCommit = (kind, id, key) => {
    const raw = qtyDrafts[key];
    if (raw === void 0 || raw === "") {
      setQtyDrafts((d) => {
        const { [key]: _d, ...rest } = d;
        return rest;
      });
      return;
    }
    const n = Number(raw);
    if (!intQty(n)) {
      setErr("Quantity must be a whole number 0 or greater.");
      return;
    }
    setQtyDrafts((d) => {
      const { [key]: _d, ...rest } = d;
      return rest;
    });
    setQty(kind, id, n);
  };
  const eqOptions = inventory.filter((i) => i.material_type === "excavation_equipment");
  const compatibleAtts = inventory.filter((a) => a.material_type === "attachment" && (showMiscAttachments || !a.is_miscellaneous_attachment) && (eq?.compatible_attachment_ids || []).includes(a.id));
  const activeParents = detail.attachmentRows.filter((r) => r.quantity > 0 && r.inventory);
  const compatibleSubs = inventory.filter((s) => s.material_type === "sub_attachment" && activeParents.some((r) => (eq?.compatible_attachment_ids || []).includes(r.id) && (r.inventory.compatible_sub_attachment_ids || []).includes(s.id)));
  const selectedAttIds = new Set(detail.attachmentMode === "normalized" ? detail.attachmentRows.map((r) => r.id) : detail.attachmentRows.filter((r) => r.quantity !== 0).map((r) => r.id));
  const selectedSubIds = new Set(detail.subAttachmentRows.filter((r) => r.quantity !== 0).map((r) => r.id));
  const attView = detail.attachmentMode === "legacy_ids" ? [...new Set(detail.attachmentRows.map((r) => r.id))].map((id) => ({
    id,
    quantity: detail.attachmentRows.filter((r) => r.id === id).length,
    inventory: detail.attachmentRows.find((r) => r.id === id)?.inventory,
    row: detail.attachmentRows.find((r) => r.id === id),
    group: detail.attachmentRows.filter((r) => r.id === id).length > 1
  })) : detail.attachmentRows.map((row) => ({ id: row.id, quantity: row.quantity, inventory: row.inventory, row, group: false }));
  const dupNormIds = detail.attachmentMode === "normalized" ? new Set(detail.attachmentRows.map((r) => r.id).filter((id) => detail.attachmentRows.filter((r) => r.id === id).length > 1)) : /* @__PURE__ */ new Set();
  const periodOptions = ["day", "week", "month"].filter((p) => eq ? fin(eq[`cost_per_${p}`]) : true);
  const savedPeriod = detail.rentalPeriod;
  if (savedPeriod && !periodOptions.includes(savedPeriod)) periodOptions.push(savedPeriod);
  const customQtyActive = entry.custom_qty !== void 0 && entry.custom_qty !== null;
  const cardTotal = !broken ? money(detail.totalCost) : hasFoundationCostSnapshot(entry.equipment_cost) ? money(entry.equipment_cost) : "Not saved";
  const lineAmt = (v) => broken ? "Unavailable" : money(v);
  const attRow = (a, key) => {
    const inv = a.inventory;
    const missing = !inv;
    const dupNorm = detail.attachmentMode === "normalized" && dupNormIds.has(a.id);
    const disabledQty = dupNorm;
    const draftKey = `a-${key}-${a.id}`;
    return /* @__PURE__ */ jsxs("div", { className: `flex items-center justify-between gap-2 p-2 rounded-lg border text-xs ${a.quantity > 0 ? "bg-amber-50 border-amber-300" : "bg-slate-50 border-slate-200"}`, children: [
      /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsx("div", { className: "font-medium text-slate-800 truncate", children: inv?.material_name || `Catalog item unavailable (${a.id})` }),
        /* @__PURE__ */ jsxs("div", { className: "text-[10px] text-slate-500", children: [
          missing && /* @__PURE__ */ jsx("span", { className: "text-amber-700 font-semibold", children: "Unavailable \u2014 review. " }),
          dupNorm && /* @__PURE__ */ jsx("span", { className: "text-amber-700 font-semibold", children: "Duplicate rows \u2014 quantity editing disabled. " }),
          detail.attachmentMode === "normalized" && a.row.quantity === 0 && /* @__PURE__ */ jsx("span", { children: "qty 0 priced as 1. " }),
          a.group && /* @__PURE__ */ jsxs("span", { children: [
            "legacy duplicate ids \xD7",
            a.quantity,
            " \u2014 catalog per-unit rate only. "
          ] }),
          !missing && inv && !a.group && hasFoundationCostSnapshot(a.row.cost) && /* @__PURE__ */ jsx("span", { children: money(a.row.cost) }),
          !missing && a.group && fin(inv?.cost_per_day) && /* @__PURE__ */ jsxs("span", { children: [
            "rate ",
            money(inv.cost_per_day),
            "/day"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex items-center gap-1 shrink-0", children: dupNorm ? /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", className: "h-6 text-[10px]", onClick: () => setQty("attachment", a.id, 0), children: "Remove all duplicates" }) : /* @__PURE__ */ jsx(
        "input",
        {
          type: "number",
          min: "0",
          disabled: disabledQty,
          "aria-label": `Attachment qty ${inv?.material_name || a.id}`,
          className: "h-7 w-14 rounded-md border border-input px-1 text-xs disabled:opacity-40",
          value: qtyDrafts[draftKey] ?? a.quantity,
          onChange: (e) => setQtyDrafts((d) => ({ ...d, [draftKey]: e.target.value })),
          onBlur: () => qtyCommit("attachment", a.id, draftKey)
        }
      ) })
    ] }, key);
  };
  const subRow = (s, key) => {
    const inv = s.inventory;
    const missing = !inv;
    const parentLinked = activeParents.some((r) => (r.inventory.compatible_sub_attachment_ids || []).includes(s.id));
    const draftKey = `s-${key}-${s.id}`;
    return /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2 p-2 rounded-lg border text-xs bg-slate-50 border-slate-200", children: [
      /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsx("div", { className: "font-medium text-slate-800 truncate", children: inv?.material_name || `Catalog item unavailable (${s.id})` }),
        /* @__PURE__ */ jsxs("div", { className: "text-[10px] text-slate-500", children: [
          missing && /* @__PURE__ */ jsx("span", { className: "text-amber-700 font-semibold", children: "Unavailable \u2014 review. " }),
          !missing && !parentLinked && /* @__PURE__ */ jsx("span", { className: "text-amber-700 font-semibold", children: "No selected parent attachment links this item. " }),
          !missing && hasFoundationCostSnapshot(s.cost) && /* @__PURE__ */ jsx("span", { children: money(s.cost) })
        ] })
      ] }),
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "number",
          min: "0",
          "aria-label": `Sub attachment qty ${inv?.material_name || s.id}`,
          className: "h-7 w-14 rounded-md border border-input px-1 text-xs",
          value: qtyDrafts[draftKey] ?? s.quantity,
          onChange: (e) => setQtyDrafts((d) => ({ ...d, [draftKey]: e.target.value })),
          onBlur: () => qtyCommit("sub_attachment", s.id, draftKey)
        }
      )
    ] }, key);
  };
  return /* @__PURE__ */ jsxs(Card, { className: "border border-indigo-200 shadow-sm overflow-hidden mb-4", children: [
    /* @__PURE__ */ jsx(CardHeader, { className: "py-3 px-4 bg-indigo-50/60 border-b border-indigo-100", children: /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-1.5", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [
          /* @__PURE__ */ jsx(CardTitle, { className: "text-sm font-semibold", children: eq?.material_name || `Equipment ${index + 1}` }),
          eq?.equipment_type && /* @__PURE__ */ jsx(Badge, { variant: "outline", className: "text-xs", children: eq.equipment_type }),
          eq?.rental_company && /* @__PURE__ */ jsx("span", { className: "text-xs text-slate-500", children: eq.rental_company }),
          broken && /* @__PURE__ */ jsx(Badge, { variant: "secondary", className: "text-xs text-amber-800", children: "Saved amounts (not current pricing)" }),
          /* @__PURE__ */ jsxs(Badge, { variant: "secondary", className: "text-xs", children: [
            "Total: ",
            cardTotal
          ] })
        ] }),
        eq?.notes && /* @__PURE__ */ jsx("p", { className: "text-xs text-slate-500 leading-relaxed max-w-3xl", children: eq.notes })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex gap-1", children: /* @__PURE__ */ jsx(Button, { size: "sm", variant: "ghost", className: "text-red-500", "aria-label": `Remove equipment ${index + 1}`, onClick: onRemove, children: /* @__PURE__ */ jsx(Trash2, { className: "w-3 h-3", "aria-hidden": "true" }) }) })
    ] }) }),
    /* @__PURE__ */ jsxs(CardContent, { className: "px-4 pb-4 space-y-4", children: [
      broken && /* @__PURE__ */ jsx("ul", { className: "list-disc pl-5 text-[11px] text-amber-800", children: issues.map((i, k) => /* @__PURE__ */ jsx("li", { children: i.message }, k)) }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx(Label, { className: "text-xs", children: "Equipment" }),
          /* @__PURE__ */ jsxs(
            Select,
            {
              value: entry.equipment_id || "",
              onValueChange: (v) => update({ ...entry, equipment_id: v }),
              children: [
                /* @__PURE__ */ jsx(SelectTrigger, { className: "h-8", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Select equipment\u2026" }) }),
                /* @__PURE__ */ jsxs(SelectContent, { children: [
                  entry.equipment_id && !eqOptions.some((o) => o.id === entry.equipment_id) && /* @__PURE__ */ jsx(SelectItem, { value: entry.equipment_id, disabled: true, children: `Catalog equipment unavailable (${entry.equipment_id})` }),
                  eqOptions.map((o) => /* @__PURE__ */ jsx(SelectItem, { value: o.id, children: o.material_name }, o.id))
                ] })
              ]
            }
          ),
          eq && (eq.compatible_attachment_ids?.length || eq.compatible_sub_attachment_ids?.length) === 0 ? null : null,
          broken && /* @__PURE__ */ jsx("p", { className: "text-[10px] text-amber-700 mt-0.5", children: "Reassigning preserves selected attachments/overrides \u2014 review compatibility." })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx(Label, { className: "text-xs", children: "Rental Period" }),
          /* @__PURE__ */ jsxs(Select, { value: detail.rentalPeriod, onValueChange: (v) => update({ ...entry, rental_period: v }), children: [
            /* @__PURE__ */ jsx(SelectTrigger, { className: "h-8", children: /* @__PURE__ */ jsx(SelectValue, {}) }),
            /* @__PURE__ */ jsx(SelectContent, { children: periodOptions.map((p) => /* @__PURE__ */ jsx(SelectItem, { value: p, children: p === "day" ? `Daily (${fin(eq?.cost_per_day) ? money(eq.cost_per_day) : "?"}/day)` : p === "week" ? `Weekly (${fin(eq?.cost_per_week) ? money(eq.cost_per_week) : "?"}/wk)` : p === "month" ? `Monthly (${fin(eq?.cost_per_month) ? money(eq.cost_per_month) : "?"}/mo)` : `Review (${savedPeriod})` }, p)) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsxs(Label, { className: "text-xs", children: [
            "Duration ",
            customQtyActive && /* @__PURE__ */ jsx("span", { className: "text-amber-700", children: "(custom qty override active \u2014 editing duration does not clear it)" })
          ] }),
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "number",
              "aria-label": "Rental duration",
              min: 1,
              className: "flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm",
              value: entry.rental_duration ?? 1,
              onChange: (e) => update({ ...entry, rental_duration: Number(e.target.value) || 1 })
            }
          )
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex items-end pb-1", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(
            Checkbox,
            {
              checked: entry.include_delivery || false,
              onCheckedChange: (v) => update({ ...entry, include_delivery: v }),
              id: `delivery-${entry._id || index}`
            }
          ),
          /* @__PURE__ */ jsxs(Label, { htmlFor: `delivery-${entry._id || index}`, className: "text-xs cursor-pointer", children: [
            "Include Delivery ",
            fin(eq?.pickup_delivery_cost) ? `(${money(eq.pickup_delivery_cost)})` : ""
          ] })
        ] }) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsx(OverrideChip, { label: "Custom rate", value: entry.custom_rate, moneyVal: true, onClear: () => update({ ...entry, custom_rate: null }) }),
        /* @__PURE__ */ jsx(OverrideChip, { label: "Custom qty", value: entry.custom_qty, onClear: () => update({ ...entry, custom_qty: null }) }),
        /* @__PURE__ */ jsx(OverrideChip, { label: `Custom delivery${entry.include_delivery ? "" : " (inactive \u2014 delivery excluded)"}`, value: entry.custom_delivery_charge, moneyVal: true, onClear: () => update({ ...entry, custom_delivery_charge: null }) })
      ] }),
      err && /* @__PURE__ */ jsx("p", { role: "alert", className: "text-[11px] text-red-700", children: err }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-3 gap-2 text-xs text-slate-600", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          "Base: ",
          /* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-900", children: lineAmt(detail.baseCost) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          "Delivery: ",
          /* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-900", children: lineAmt(detail.deliveryCost) })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          "Total: ",
          /* @__PURE__ */ jsx("span", { className: "font-semibold text-slate-900", children: cardTotal })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs(Label, { className: "text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block", children: [
          /* @__PURE__ */ jsx(Wrench, { className: "w-3 h-3 inline mr-1", "aria-hidden": "true" }),
          " Attachments"
        ] }),
        /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-2", children: attView.filter((a) => detail.attachmentMode === "normalized" || a.quantity !== 0).map((a, k) => attRow(a, k)) }),
        compatibleAtts.filter((a) => !selectedAttIds.has(a.id)).length > 0 && eq && /* @__PURE__ */ jsx("div", { className: "mt-2", children: /* @__PURE__ */ jsxs(Select, { value: "", onValueChange: (v) => v && setQty("attachment", v, 1), children: [
          /* @__PURE__ */ jsx(SelectTrigger, { className: "h-8", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Add attachment\u2026" }) }),
          /* @__PURE__ */ jsx(SelectContent, { children: compatibleAtts.filter((a) => !selectedAttIds.has(a.id)).map((a) => /* @__PURE__ */ jsx(SelectItem, { value: a.id, children: a.material_name }, a.id)) })
        ] }) }),
        attView.some((a) => a.inventory && !(eq?.compatible_attachment_ids || []).includes(a.id)) && /* @__PURE__ */ jsx("p", { className: "text-[10px] text-amber-700 mt-1", children: "Selected item incompatible with this parent \u2014 review." })
      ] }),
      detail.subAttachmentRows.filter((s) => s.quantity !== 0).length > 0 && /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx(Label, { className: "text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block", children: "Sub-attachments" }),
        /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-2", children: detail.subAttachmentRows.filter((s) => s.quantity !== 0).map((s, k) => subRow(s, k)) })
      ] }),
      compatibleSubs.filter((s) => !selectedSubIds.has(s.id)).length > 0 && eq && /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsxs(Select, { value: "", onValueChange: (v) => v && setQty("sub_attachment", v, 1), children: [
        /* @__PURE__ */ jsx(SelectTrigger, { className: "h-8", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Add sub-attachment\u2026" }) }),
        /* @__PURE__ */ jsx(SelectContent, { children: compatibleSubs.filter((s) => !selectedSubIds.has(s.id)).map((s) => /* @__PURE__ */ jsx(SelectItem, { value: s.id, children: s.material_name }, s.id)) })
      ] }) })
    ] })
  ] });
}
export default function EquipmentTab({ foundationItems = [], inventory = [], selectedEquipmentList = [], onUpdate, markDirty }) {
  const [showAllEquipment, setShowAllEquipment] = useState(false);
  const [showMiscAttachments, setShowMiscAttachments] = useState(false);
  const pricingRows = calcEquipmentPricing(selectedEquipmentList, inventory);
  const total = equipmentCostTotal(pricingRows.map((r) => r.pricedEntry));
  const incomplete = pricingRows.some((r) => r.issues.length);
  const sortByOrder = (rows) => [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const excavation = sortByOrder(inventory.filter((i) => i.material_type === "excavation_equipment" && !i.is_non_excavation_equipment));
  const nonExcavation = sortByOrder(inventory.filter((i) => i.material_type === "excavation_equipment" && i.is_non_excavation_equipment));
  const types = new Set((foundationItems || []).map((f) => f.foundation_type));
  const hasPillar = types.has("pillar");
  const hasSpread = types.has("spread_foot") || types.has("standard");
  const filteredExcavation = showAllEquipment || !hasPillar && !hasSpread ? excavation : excavation.filter((e) => hasPillar && e.is_pillar_excavation || hasSpread && e.is_spread_foot_excavation);
  const filteredNonExcavation = nonExcavation;
  const addEquipment = (eqId) => {
    if (!eqId || eqId === "_none") return;
    const eqItem = inventory.find((i) => i.id === eqId);
    const newEntry = {
      _id: `eq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      equipment_id: eqId,
      rental_period: "day",
      rental_duration: 1,
      include_delivery: (eqItem?.pickup_delivery_cost || 0) > 0,
      attachment_counts: {},
      sub_attachment_counts: {}
    };
    onUpdate([...selectedEquipmentList, newEntry]);
    markDirty();
  };
  const removeEquipment = (idx) => {
    const eq = inventory.find((i) => i.id === selectedEquipmentList[idx]?.equipment_id);
    if (!window.confirm(`Remove ${eq?.material_name || "this equipment"}?`)) return;
    onUpdate(selectedEquipmentList.filter((_, i) => i !== idx));
    markDirty();
  };
  const updateEntry = (idx, updated) => {
    const arr = [...selectedEquipmentList];
    arr[idx] = updated;
    onUpdate(arr);
    markDirty();
  };
  const addSelect = (label, rows, placeholder) => /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-[260px]", children: [
    /* @__PURE__ */ jsx(Label, { className: "text-xs font-semibold text-indigo-900 uppercase tracking-wide", children: label }),
    /* @__PURE__ */ jsxs(Select, { value: "", onValueChange: addEquipment, children: [
      /* @__PURE__ */ jsx(SelectTrigger, { className: "h-9 mt-1", children: /* @__PURE__ */ jsx(SelectValue, { placeholder }) }),
      /* @__PURE__ */ jsx(SelectContent, { children: rows.length === 0 ? /* @__PURE__ */ jsx(SelectItem, { value: "_none", disabled: true, children: "No equipment available" }) : rows.map((eq) => /* @__PURE__ */ jsx(SelectItem, { value: eq.id, children: eq.material_name }, eq.id)) })
    ] })
  ] });
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsx(Card, { className: "border-indigo-200 bg-indigo-50/50 shadow-sm mb-4", children: /* @__PURE__ */ jsxs(CardContent, { className: "py-3 px-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-6 mb-4 pb-4 border-b border-indigo-100", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(Checkbox, { id: "showAllEq", checked: showAllEquipment, onCheckedChange: setShowAllEquipment }),
          /* @__PURE__ */ jsx(Label, { htmlFor: "showAllEq", className: "text-sm cursor-pointer text-indigo-900 font-medium", children: "Show all equipment" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(Checkbox, { id: "showMiscAtt", checked: showMiscAttachments, onCheckedChange: setShowMiscAttachments }),
          /* @__PURE__ */ jsx(Label, { htmlFor: "showMiscAtt", className: "text-sm cursor-pointer text-indigo-900 font-medium", children: "Show Miscellaneous Attachments" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-end gap-4", children: [
        addSelect("Add Excavation Equipment", filteredExcavation, "Select excavation equipment to add\u2026"),
        addSelect("Add Non-Excavation Equipment", filteredNonExcavation, "Select non-excavation equipment to add\u2026")
      ] })
    ] }) }),
    incomplete && /* @__PURE__ */ jsx("div", { role: "alert", className: "rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800 font-semibold", children: "Pricing unavailable: selected materials/rental items need attention. Saved/known amounts only." }),
    selectedEquipmentList.length === 0 && /* @__PURE__ */ jsx(Card, { className: "border-dashed", children: /* @__PURE__ */ jsxs(CardContent, { className: "py-10 text-center text-slate-400", children: [
      /* @__PURE__ */ jsx("div", { className: "text-4xl mb-2", children: "\u{1F69C}" }),
      /* @__PURE__ */ jsx("p", { className: "font-medium", children: "No equipment added yet" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm mt-1", children: "Select equipment from the dropdown above." })
    ] }) }),
    selectedEquipmentList.map((entry, idx) => /* @__PURE__ */ jsx(
      EquipmentCard,
      {
        entry,
        detail: pricingRows[idx],
        index: idx,
        inventory,
        onUpdate: updateEntry,
        onRemove: () => removeEquipment(idx),
        showMiscAttachments
      },
      entry.component_id || entry._id || idx
    )),
    selectedEquipmentList.length > 0 && /* @__PURE__ */ jsx(Card, { className: "bg-amber-50 border-amber-200", children: /* @__PURE__ */ jsxs(CardContent, { className: "py-3 px-4 flex items-center justify-between", children: [
      /* @__PURE__ */ jsx("span", { className: "font-medium text-amber-800", children: "Total Equipment Cost" }),
      /* @__PURE__ */ jsx("span", { className: "text-lg font-bold text-amber-700", children: incomplete ? "Pricing unavailable" : money(total) })
    ] }) })
  ] });
}
