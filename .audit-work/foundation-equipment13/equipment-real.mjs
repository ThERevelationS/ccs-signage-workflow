// src/components/estimator/foundation/FoundationEquipmentTab.jsx
import { useState } from "react";

// visual:@/components/ui/card
var Card = (p) => p.children ?? null;
var CardContent = (p) => p.children ?? null;
var CardHeader = (p) => p.children ?? null;
var CardTitle = (p) => p.children ?? null;

// visual:@/components/ui/button
import { jsx } from "react/jsx-runtime";
var Button = (p) => /* @__PURE__ */ jsx("button", { ...p, children: p.children });

// visual:@/components/ui/label
import { jsx as jsx2 } from "react/jsx-runtime";
var Label = (p) => /* @__PURE__ */ jsx2("label", { children: p.children });

// visual:@/components/ui/select
var Select = (p) => p.children ?? null;
var SelectContent = (p) => p.children ?? null;
var SelectItem = (p) => p.children ?? null;
var SelectTrigger = (p) => p.children ?? null;
var SelectValue = (p) => p.children ?? null;

// visual:@/components/ui/badge
import { jsx as jsx3 } from "react/jsx-runtime";
var Badge = (p) => /* @__PURE__ */ jsx3("span", { children: p.children });

// visual:@/components/ui/checkbox
import { jsx as jsx4 } from "react/jsx-runtime";
var Checkbox = (p) => /* @__PURE__ */ jsx4("input", { checked: p.checked, type: "checkbox" });

// visual:lucide-react
var Plus = () => null;
var Trash2 = () => null;
var Wrench = () => null;

// src/components/estimator/foundation/FoundationEquipmentTab.jsx
import { jsx as jsx5, jsxs } from "react/jsx-runtime";
function EquipmentCard({ equipment, selectedEquipment, onUpdate, onRemove, allAttachments, allSubAttachments, showMiscAttachments }) {
  const eq = equipment;
  const compatibleAttachments = allAttachments.filter((a) => {
    if (!showMiscAttachments && a.is_miscellaneous_attachment) return false;
    return eq.compatible_attachment_ids?.includes(a.id);
  });
  const attCounts = selectedEquipment.attachment_counts || {};
  if (selectedEquipment.attachment_ids?.length && Object.keys(attCounts).length === 0) {
    selectedEquipment.attachment_ids.forEach((id) => attCounts[id] = 1);
  }
  const subAttCounts = selectedEquipment.sub_attachment_counts || {};
  const handleAttChange = (id, change, allowMultiple) => {
    const current = attCounts[id] || 0;
    let next = Math.max(0, current + change);
    if (!allowMultiple && next > 1) next = 1;
    onUpdate({ ...selectedEquipment, attachment_counts: { ...attCounts, [id]: next } });
  };
  const handleSubAttChange = (id, change, allowMultiple) => {
    const current = subAttCounts[id] || 0;
    let next = Math.max(0, current + change);
    if (!allowMultiple && next > 1) next = 1;
    onUpdate({ ...selectedEquipment, sub_attachment_counts: { ...subAttCounts, [id]: next } });
  };
  const rentalPeriod = selectedEquipment.rental_period || "day";
  const rentalDuration = selectedEquipment.rental_duration || 1;
  const getRentalCost = (item) => {
    if (rentalPeriod === "day") return (item.cost_per_day || 0) * rentalDuration;
    if (rentalPeriod === "week") return (item.cost_per_week || 0) * rentalDuration;
    if (rentalPeriod === "month") return (item.cost_per_month || 0) * rentalDuration;
    return 0;
  };
  const attachmentCost = compatibleAttachments.reduce((sum, a) => sum + getRentalCost(a) * (attCounts[a.id] || 0), 0);
  const visibleSubAttachments = allSubAttachments.filter((s) => {
    return compatibleAttachments.some((a) => (attCounts[a.id] || 0) > 0 && a.compatible_sub_attachment_ids?.includes(s.id));
  });
  const subAttachmentCost = visibleSubAttachments.reduce((sum, s) => sum + getRentalCost(s) * (subAttCounts[s.id] || 0), 0);
  const baseRentalCost = getRentalCost(eq);
  const deliveryCost = selectedEquipment.include_delivery ? eq.pickup_delivery_cost || 0 : 0;
  const totalCost = baseRentalCost + deliveryCost + attachmentCost + subAttachmentCost;
  return /* @__PURE__ */ jsxs(Card, { className: "border border-indigo-200 shadow-sm overflow-hidden mb-4", children: [
    /* @__PURE__ */ jsx5(CardHeader, { className: "py-3 px-4 bg-indigo-50/60 border-b border-indigo-100", children: /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-1.5", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [
          /* @__PURE__ */ jsx5(CardTitle, { className: "text-sm font-semibold", children: eq.material_name }),
          eq.equipment_type && /* @__PURE__ */ jsx5(Badge, { variant: "outline", className: "text-xs", children: eq.equipment_type }),
          eq.rental_company && /* @__PURE__ */ jsx5("span", { className: "text-xs text-slate-500", children: eq.rental_company }),
          /* @__PURE__ */ jsxs(Badge, { variant: "secondary", className: "text-xs", children: [
            "Total: $",
            totalCost.toFixed(2)
          ] })
        ] }),
        eq.notes && /* @__PURE__ */ jsx5("p", { className: "text-xs text-slate-500 leading-relaxed max-w-3xl", children: eq.notes })
      ] }),
      /* @__PURE__ */ jsx5("div", { className: "flex gap-1", children: /* @__PURE__ */ jsx5(Button, { size: "sm", variant: "ghost", className: "text-red-500", onClick: onRemove, children: /* @__PURE__ */ jsx5(Trash2, { className: "w-3 h-3", "aria-hidden": "true" }) }) })
    ] }) }),
    /* @__PURE__ */ jsxs(CardContent, { className: "px-4 pb-4 space-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-3", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx5(Label, { className: "text-xs", children: "Rental Period" }),
          /* @__PURE__ */ jsxs(Select, { value: rentalPeriod, onValueChange: (v) => onUpdate({ ...selectedEquipment, rental_period: v }), children: [
            /* @__PURE__ */ jsx5(SelectTrigger, { className: "h-8", children: /* @__PURE__ */ jsx5(SelectValue, {}) }),
            /* @__PURE__ */ jsxs(SelectContent, { children: [
              eq.cost_per_day && /* @__PURE__ */ jsxs(SelectItem, { value: "day", children: [
                "Daily ($",
                eq.cost_per_day,
                "/day)"
              ] }),
              eq.cost_per_week && /* @__PURE__ */ jsxs(SelectItem, { value: "week", children: [
                "Weekly ($",
                eq.cost_per_week,
                "/wk)"
              ] }),
              eq.cost_per_month && /* @__PURE__ */ jsxs(SelectItem, { value: "month", children: [
                "Monthly ($",
                eq.cost_per_month,
                "/mo)"
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx5(Label, { className: "text-xs", children: "Duration" }),
          /* @__PURE__ */ jsx5(
            "input",
            {
              type: "number",
              "aria-label": "Rental duration",
              className: "flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              value: rentalDuration,
              min: 1,
              onChange: (e) => onUpdate({ ...selectedEquipment, rental_duration: parseFloat(e.target.value) || 1 })
            }
          )
        ] }),
        eq.pickup_delivery_cost > 0 && /* @__PURE__ */ jsx5("div", { className: "flex items-end pb-1", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx5(
            Checkbox,
            {
              checked: selectedEquipment.include_delivery || false,
              onCheckedChange: (v) => onUpdate({ ...selectedEquipment, include_delivery: v }),
              id: `delivery-${eq.id}`
            }
          ),
          /* @__PURE__ */ jsxs(Label, { htmlFor: `delivery-${eq.id}`, className: "text-xs cursor-pointer", children: [
            "Include Delivery ($",
            eq.pickup_delivery_cost,
            ")"
          ] })
        ] }) }),
        /* @__PURE__ */ jsxs("div", { className: "bg-amber-50 rounded-lg p-2 flex flex-col justify-center", children: [
          /* @__PURE__ */ jsx5("p", { className: "text-xs text-slate-500", children: "Rental Cost" }),
          /* @__PURE__ */ jsxs("p", { className: "font-semibold text-sm", children: [
            "$",
            baseRentalCost.toFixed(2)
          ] })
        ] })
      ] }),
      compatibleAttachments.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs(Label, { className: "text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block", children: [
          /* @__PURE__ */ jsx5(Wrench, { className: "w-3 h-3 inline mr-1", "aria-hidden": "true" }),
          "Attachments"
        ] }),
        /* @__PURE__ */ jsx5("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-2", children: compatibleAttachments.map((att) => {
          const count = attCounts[att.id] || 0;
          return /* @__PURE__ */ jsxs(
            "div",
            {
              className: `flex items-center justify-between gap-2 p-2 rounded-lg border text-xs transition-colors ${count > 0 ? "bg-amber-50 border-amber-300" : "bg-slate-50 border-slate-200 hover:bg-slate-100"}`,
              children: [
                /* @__PURE__ */ jsxs("div", { className: "flex-1 cursor-pointer", onClick: () => handleAttChange(att.id, count > 0 ? -count : 1, att.allow_multiple), children: [
                  /* @__PURE__ */ jsx5("p", { className: "font-medium text-slate-800", children: att.material_name }),
                  /* @__PURE__ */ jsxs("p", { className: "text-amber-700 font-semibold mt-0.5", children: [
                    "$",
                    getRentalCost(att).toFixed(2)
                  ] })
                ] }),
                /* @__PURE__ */ jsx5("div", { className: "flex items-center gap-2", children: att.allow_multiple ? /* @__PURE__ */ jsxs("div", { className: "flex items-center bg-white border rounded", children: [
                  /* @__PURE__ */ jsx5(Button, { variant: "ghost", size: "icon", className: "h-6 w-6", onClick: () => handleAttChange(att.id, -1, true), children: "-" }),
                  /* @__PURE__ */ jsx5("span", { className: "w-4 text-center font-medium", children: count }),
                  /* @__PURE__ */ jsx5(Button, { variant: "ghost", size: "icon", className: "h-6 w-6", onClick: () => handleAttChange(att.id, 1, true), children: "+" })
                ] }) : /* @__PURE__ */ jsx5(Checkbox, { checked: count > 0, onCheckedChange: (v) => handleAttChange(att.id, v ? 1 : -1, false) }) })
              ]
            },
            att.id
          );
        }) })
      ] }),
      visibleSubAttachments.length > 0 && /* @__PURE__ */ jsxs("div", { className: "pt-2", children: [
        /* @__PURE__ */ jsxs(Label, { className: "text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block", children: [
          /* @__PURE__ */ jsx5(Plus, { className: "w-3 h-3 inline mr-1", "aria-hidden": "true" }),
          "Sub-Attachments"
        ] }),
        /* @__PURE__ */ jsx5("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-2", children: visibleSubAttachments.map((sub) => {
          const count = subAttCounts[sub.id] || 0;
          return /* @__PURE__ */ jsxs(
            "div",
            {
              className: `flex items-center justify-between gap-2 p-2 rounded-lg border text-xs transition-colors ${count > 0 ? "bg-blue-50 border-blue-300" : "bg-slate-50 border-slate-200 hover:bg-slate-100"}`,
              children: [
                /* @__PURE__ */ jsxs("div", { className: "flex-1 cursor-pointer", onClick: () => handleSubAttChange(sub.id, count > 0 ? -count : 1, sub.allow_multiple), children: [
                  /* @__PURE__ */ jsx5("p", { className: "font-medium text-slate-800", children: sub.material_name }),
                  /* @__PURE__ */ jsxs("p", { className: "text-blue-700 font-semibold mt-0.5", children: [
                    "$",
                    getRentalCost(sub).toFixed(2)
                  ] })
                ] }),
                /* @__PURE__ */ jsx5("div", { className: "flex items-center gap-2", children: sub.allow_multiple ? /* @__PURE__ */ jsxs("div", { className: "flex items-center bg-white border rounded", children: [
                  /* @__PURE__ */ jsx5(Button, { variant: "ghost", size: "icon", className: "h-6 w-6", onClick: () => handleSubAttChange(sub.id, -1, true), children: "-" }),
                  /* @__PURE__ */ jsx5("span", { className: "w-4 text-center font-medium", children: count }),
                  /* @__PURE__ */ jsx5(Button, { variant: "ghost", size: "icon", className: "h-6 w-6", onClick: () => handleSubAttChange(sub.id, 1, true), children: "+" })
                ] }) : /* @__PURE__ */ jsx5(Checkbox, { checked: count > 0, onCheckedChange: (v) => handleSubAttChange(sub.id, v ? 1 : -1, false) }) })
              ]
            },
            sub.id
          );
        }) })
      ] })
    ] })
  ] });
}
function EquipmentTab({ foundationItems = [], inventory, selectedEquipmentList, onUpdate, markDirty }) {
  const [showAllEquipment, setShowAllEquipment] = useState(false);
  const [showMiscAttachments, setShowMiscAttachments] = useState(false);
  const allEquipment = inventory.filter((i) => i.material_type === "excavation_equipment");
  const allAttachments = inventory.filter((i) => i.material_type === "attachment").sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const allSubAttachments = inventory.filter((i) => i.material_type === "sub_attachment").sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const hasPillar = foundationItems.some((i) => i.foundation_type === "pillar");
  const hasSpreadFoot = foundationItems.some((i) => i.foundation_type === "spread_foot");
  let filteredExcavationEquipment = allEquipment.filter((eq) => !eq.is_non_excavation_equipment);
  if (!showAllEquipment) {
    if (hasPillar && !hasSpreadFoot) {
      filteredExcavationEquipment = filteredExcavationEquipment.filter((eq) => eq.is_pillar_excavation);
    } else if (hasSpreadFoot && !hasPillar) {
      filteredExcavationEquipment = filteredExcavationEquipment.filter((eq) => eq.is_spread_foot_excavation);
    } else if (hasPillar && hasSpreadFoot) {
      filteredExcavationEquipment = filteredExcavationEquipment.filter((eq) => eq.is_pillar_excavation || eq.is_spread_foot_excavation);
    }
  }
  filteredExcavationEquipment.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const filteredNonExcavationEquipment = allEquipment.filter((eq) => eq.is_non_excavation_equipment).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const addEquipment = (eqId) => {
    if (!eqId || eqId === "_none") return;
    const eqItem = inventory.find((i) => i.id === eqId);
    const newEntry = {
      _id: Date.now() + Math.random(),
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
  const totalEquipmentCost = selectedEquipmentList.reduce((sum, entry) => {
    const eq = inventory.find((i) => i.id === entry.equipment_id);
    if (!eq) return sum;
    const rentalPeriod = entry.rental_period || "day";
    const rentalDuration = entry.rental_duration || 1;
    const getRentalCost = (item) => {
      if (rentalPeriod === "day") return (item.cost_per_day || 0) * rentalDuration;
      if (rentalPeriod === "week") return (item.cost_per_week || 0) * rentalDuration;
      if (rentalPeriod === "month") return (item.cost_per_month || 0) * rentalDuration;
      return 0;
    };
    const base = getRentalCost(eq);
    const delivery = entry.include_delivery ? eq.pickup_delivery_cost || 0 : 0;
    let attCost = 0;
    if (entry.attachment_counts) {
      Object.entries(entry.attachment_counts).forEach(([id, qty]) => {
        const a = allAttachments.find((att) => att.id === id);
        if (a) attCost += getRentalCost(a) * qty;
      });
    } else if (entry.attachment_ids) {
      attCost = allAttachments.filter((a) => entry.attachment_ids.includes(a.id)).reduce((s, a) => s + getRentalCost(a), 0);
    }
    let subAttCost = 0;
    if (entry.sub_attachment_counts) {
      Object.entries(entry.sub_attachment_counts).forEach(([id, qty]) => {
        const s = allSubAttachments.find((sub) => sub.id === id);
        if (s) subAttCost += getRentalCost(s) * qty;
      });
    }
    return sum + base + delivery + attCost + subAttCost;
  }, 0);
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsx5(Card, { className: "border-indigo-200 bg-indigo-50/50 shadow-sm mb-4", children: /* @__PURE__ */ jsxs(CardContent, { className: "py-3 px-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-6 mb-4 pb-4 border-b border-indigo-100", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx5(Checkbox, { id: "showAllEq", checked: showAllEquipment, onCheckedChange: setShowAllEquipment }),
          /* @__PURE__ */ jsx5(Label, { htmlFor: "showAllEq", className: "text-sm cursor-pointer text-indigo-900 font-medium", children: "Show all equipment" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx5(Checkbox, { id: "showMiscAtt", checked: showMiscAttachments, onCheckedChange: setShowMiscAttachments }),
          /* @__PURE__ */ jsx5(Label, { htmlFor: "showMiscAtt", className: "text-sm cursor-pointer text-indigo-900 font-medium", children: "Show Miscellaneous Attachments" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-end gap-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-[260px]", children: [
          /* @__PURE__ */ jsx5(Label, { className: "text-xs font-semibold text-indigo-900 uppercase tracking-wide", children: "Add Excavation Equipment" }),
          /* @__PURE__ */ jsxs(Select, { value: "", onValueChange: addEquipment, children: [
            /* @__PURE__ */ jsx5(SelectTrigger, { className: "h-9 mt-1", children: /* @__PURE__ */ jsx5(SelectValue, { placeholder: "Select excavation equipment to add\u2026" }) }),
            /* @__PURE__ */ jsx5(SelectContent, { children: filteredExcavationEquipment.length === 0 ? /* @__PURE__ */ jsx5(SelectItem, { value: "_none", disabled: true, children: "No excavation equipment available" }) : filteredExcavationEquipment.map((eq) => /* @__PURE__ */ jsx5(SelectItem, { value: eq.id, children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col py-1", children: [
              /* @__PURE__ */ jsx5("span", { className: "font-medium", children: eq.material_name }),
              eq.notes && /* @__PURE__ */ jsx5("span", { className: "text-xs text-slate-500 whitespace-normal max-w-[450px] mt-0.5", children: eq.notes })
            ] }) }, eq.id)) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-[260px]", children: [
          /* @__PURE__ */ jsx5(Label, { className: "text-xs font-semibold text-indigo-900 uppercase tracking-wide", children: "Add Non-Excavation Equipment" }),
          /* @__PURE__ */ jsxs(Select, { value: "", onValueChange: addEquipment, children: [
            /* @__PURE__ */ jsx5(SelectTrigger, { className: "h-9 mt-1", children: /* @__PURE__ */ jsx5(SelectValue, { placeholder: "Select non-excavation equipment to add\u2026" }) }),
            /* @__PURE__ */ jsx5(SelectContent, { children: filteredNonExcavationEquipment.length === 0 ? /* @__PURE__ */ jsx5(SelectItem, { value: "_none", disabled: true, children: "No non-excavation equipment available" }) : filteredNonExcavationEquipment.map((eq) => /* @__PURE__ */ jsx5(SelectItem, { value: eq.id, children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col py-1", children: [
              /* @__PURE__ */ jsx5("span", { className: "font-medium", children: eq.material_name }),
              eq.notes && /* @__PURE__ */ jsx5("span", { className: "text-xs text-slate-500 whitespace-normal max-w-[450px] mt-0.5", children: eq.notes })
            ] }) }, eq.id)) })
          ] })
        ] })
      ] })
    ] }) }),
    selectedEquipmentList.length === 0 && /* @__PURE__ */ jsx5(Card, { className: "border-dashed", children: /* @__PURE__ */ jsxs(CardContent, { className: "py-10 text-center text-slate-400", children: [
      /* @__PURE__ */ jsx5("div", { className: "text-4xl mb-2", children: "\u{1F69C}" }),
      /* @__PURE__ */ jsx5("p", { className: "font-medium", children: "No equipment added yet" }),
      /* @__PURE__ */ jsx5("p", { className: "text-sm mt-1", children: "Select equipment from the dropdown above." })
    ] }) }),
    selectedEquipmentList.map((entry, idx) => {
      const eq = inventory.find((i) => i.id === entry.equipment_id);
      if (!eq) return null;
      return /* @__PURE__ */ jsx5(
        EquipmentCard,
        {
          equipment: eq,
          selectedEquipment: entry,
          onUpdate: (updated) => updateEntry(idx, updated),
          onRemove: () => removeEquipment(idx),
          allAttachments,
          allSubAttachments,
          showMiscAttachments
        },
        entry._id || idx
      );
    }),
    selectedEquipmentList.length > 0 && /* @__PURE__ */ jsx5(Card, { className: "bg-amber-50 border-amber-200", children: /* @__PURE__ */ jsxs(CardContent, { className: "py-3 px-4 flex items-center justify-between", children: [
      /* @__PURE__ */ jsx5("span", { className: "font-medium text-amber-800", children: "Total Equipment Cost" }),
      /* @__PURE__ */ jsxs("span", { className: "text-lg font-bold text-amber-700", children: [
        "$",
        totalEquipmentCost.toFixed(2)
      ] })
    ] }) })
  ] });
}
export {
  EquipmentTab as default
};
