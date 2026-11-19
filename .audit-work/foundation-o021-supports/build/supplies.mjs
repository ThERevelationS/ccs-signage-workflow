// .audit-work/foundation-o021-supports/stage/src/components/masterInventory/MasterSuppliesTab.jsx
import { useEffect, useMemo, useRef, useState } from "react";

// s:s://@/api/base44Client
var api = {
  auth: { me: async () => globalThis.__USER || { role: "admin" } },
  entities: new Proxy({}, { get: (t, k) => globalThis.__ENTITIES[k] })
};

// s:s://@/components/estimator/loadAllEntityRows
var loadAllEntityRows = async ({ entity }) => entity && entity.__rows ? entity.__rows.slice() : [];

// s:s://@/components/ui/card
import { jsx } from "react/jsx-runtime";
var Card = ({ children, ...p }) => /* @__PURE__ */ jsx("div", { ...p, children });
var CardContent = ({ children, ...p }) => /* @__PURE__ */ jsx("div", { ...p, children });
var CardHeader = ({ children, ...p }) => /* @__PURE__ */ jsx("div", { ...p, children });
var CardTitle = ({ children, ...p }) => /* @__PURE__ */ jsx("div", { ...p, children });

// s:s://@/components/ui/button
import { jsx as jsx2 } from "react/jsx-runtime";
var Button = ({ children, ...p }) => /* @__PURE__ */ jsx2("button", { ...p, children });

// s:s://@/components/ui/input
import { jsx as jsx3 } from "react/jsx-runtime";
var Input = (p) => /* @__PURE__ */ jsx3("input", { ...p });

// s:s://@/components/ui/label
import { jsx as jsx4 } from "react/jsx-runtime";
var Label = ({ children, ...p }) => /* @__PURE__ */ jsx4("label", { ...p, children });

// s:s://@/components/ui/badge
import { jsx as jsx5 } from "react/jsx-runtime";
var Badge = ({ children, ...p }) => /* @__PURE__ */ jsx5("span", { ...p, children });

// s:s://@/components/ui/switch
import { jsx as jsx6 } from "react/jsx-runtime";
var Switch = ({ checked, onCheckedChange }) => /* @__PURE__ */ jsx6("button", { "data-switch": String(!!checked), onClick: () => onCheckedChange && onCheckedChange(!checked) });

// s:s://@/components/ui/select
import React from "react";
import { jsx as jsx7 } from "react/jsx-runtime";
var SelectItem = () => null;
SelectItem.__isItem = true;
var Select = ({ value, onValueChange, children }) => {
  const items = [];
  const walk = (n) => React.Children.forEach(n, (c) => {
    if (!c || typeof c !== "object" || !c.props) return;
    if (c.type && c.type.__isItem) items.push(c);
    else walk(c.props.children);
  });
  walk(children);
  return /* @__PURE__ */ jsx7(
    "select",
    {
      "data-stub": "radix-select",
      value: value == null ? "" : value,
      onChange: (e) => onValueChange && onValueChange(e.target.value),
      children: items.map((c, i) => /* @__PURE__ */ jsx7("option", { value: c.props.value, children: c.props.children }, i))
    }
  );
};
var SelectTrigger = () => null;
var SelectContent = ({ children }) => /* @__PURE__ */ jsx7("div", { children });
var SelectValue = () => null;

// s:s://@/components/ui/dialog
import { jsx as jsx8 } from "react/jsx-runtime";
var Dialog = ({ open, children }) => open ? /* @__PURE__ */ jsx8("div", { "data-dialog": "1", children }) : null;
var DialogContent = ({ children }) => /* @__PURE__ */ jsx8("div", { children });
var DialogHeader = ({ children }) => /* @__PURE__ */ jsx8("div", { children });
var DialogTitle = ({ children }) => /* @__PURE__ */ jsx8("div", { children });

// s:s://lucide-react
var I = () => null;
var Trash2 = I;
var Plus = I;
var Edit = I;
var Wrench = I;

// s:s://@/components/estimator/builder/builderEntityPersistence
var expectedEntityFields = () => ({});
var replaceEntityFieldsIfUnchanged = async ({ entity, id, nextFields }) => {
  globalThis.__CALLS.push({ op: "replaceFields", id, nextFields });
  return entity.update(id, nextFields);
};
var deleteEntityIfUnchanged = async ({ entity, record }) => entity.delete(record.id);

// s:s://@/components/masterInventory/inventoryPersistence
var createInventoryRecordWithRecovery = async ({ entity, data }) => {
  globalThis.__CALLS.push({ op: "createRecord", data });
  return entity.create(data);
};

// .audit-work/foundation-o021-supports/stage/src/components/masterInventory/inventoryNormalization.js
var inventoryNumberInput = (value) => String(value).trim() === "" ? null : Number.isFinite(Number(value)) ? Number(value) : value;

// s:s://@/components/staff/staffEntities
var staffEntities = new Proxy({}, { get: (t, k) => globalThis.__ENTITIES[k] });

// .audit-work/foundation-o021-supports/stage/src/components/masterInventory/MasterSuppliesTab.jsx
import { Fragment, jsx as jsx9, jsxs } from "react/jsx-runtime";
var ChannelLetterInstallInventoryEntity = staffEntities.ChannelLetterInstallInventory;
var FoundationInventoryEntity = staffEntities.FoundationInventory;
var FOUNDATION_SUPPLY_TYPES = [
  "concrete_service",
  "bagged_concrete",
  "rebar",
  "rebar_support",
  "forming_material",
  "pole",
  "brick_stone",
  "fill_material",
  "wall_material",
  "wall_cap"
];
var FOUNDATION_TYPE_OPTIONS = FOUNDATION_SUPPLY_TYPES.map((t) => ({
  value: t,
  label: t.replace(/_/g, " ")
}));
var CHANNEL_PRICING_MODES = ["per_letter_flat", "per_letter_by_size", "per_raceway_foot", "per_project_flat"];
function normalize(row, source) {
  if (source === "channel_letter") {
    return {
      _source: source,
      id: row.id,
      name: row.item_name,
      subtype: row.pricing_mode || "\u2014",
      cost_display: row.cost_per_letter || row.cost_per_foot || row.cost_flat || 0,
      supplier: row.supplier || "",
      show_in_channel_letters: row.show_in_install_materials ?? true,
      show_in_foundation: row.show_in_foundation_materials ?? false,
      show_in_sign_maintenance: row.show_in_maintenance_materials ?? false,
      raw: row
    };
  }
  return {
    _source: "foundation",
    id: row.id,
    name: row.material_name,
    subtype: row.material_type,
    cost_display: row.cost_per_unit || 0,
    supplier: row.supplier || "",
    show_in_channel_letters: row.show_in_channel_letters ?? false,
    show_in_foundation: row.show_in_foundation ?? true,
    show_in_sign_maintenance: row.show_in_sign_maintenance ?? false,
    raw: row
  };
}
function MasterSuppliesTab({ isAdmin }) {
  const [channelRows, setChannelRows] = useState([]);
  const [foundationRows, setFoundationRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [loadError, setLoadError] = useState("");
  const toggleRef = useRef(/* @__PURE__ */ new Set());
  const deleteRef = useRef(/* @__PURE__ */ new Set());
  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [chn, fnd] = await Promise.all([
        loadAllEntityRows({ entity: ChannelLetterInstallInventoryEntity, sort: "sort_order", label: "Installation supplies" }),
        loadAllEntityRows({ entity: FoundationInventoryEntity, sort: "material_name", label: "Foundation supplies" })
      ]);
      setChannelRows(chn);
      setFoundationRows(fnd.filter((r) => FOUNDATION_SUPPLY_TYPES.includes(r.material_type)));
    } catch (e) {
      console.error(e);
      setLoadError(e?.message || "Supply inventory could not be verified.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const rows = useMemo(() => {
    const a = channelRows.map((r) => normalize(r, "channel_letter"));
    const b = foundationRows.map((r) => normalize(r, "foundation"));
    const all = [...a, ...b];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(
      (r) => [r.name, r.subtype, r.supplier].some((v) => v && String(v).toLowerCase().includes(q))
    );
  }, [channelRows, foundationRows, search]);
  const toggleVisibility = async (row, masterField, next) => {
    let field = masterField;
    if (row._source === "channel_letter") {
      if (masterField === "show_in_channel_letters") field = "show_in_install_materials";
      if (masterField === "show_in_sign_maintenance") field = "show_in_maintenance_materials";
      if (masterField === "show_in_foundation") field = "show_in_foundation_materials";
    }
    const entity = row._source === "channel_letter" ? ChannelLetterInstallInventoryEntity : FoundationInventoryEntity;
    const lockKey = `${row._source}:${row.id}:${field}`;
    if (toggleRef.current.has(lockKey)) return;
    toggleRef.current.add(lockKey);
    try {
      const live = await entity.get(row.id);
      if (live?.[field] !== row.raw?.[field]) {
        alert("This supply visibility setting changed in another session. The latest inventory will be reloaded before you edit it again.");
        await load();
        return;
      }
      const togglePatch = { [field]: next };
      await replaceEntityFieldsIfUnchanged({
        entity,
        id: row.id,
        expectedFields: expectedEntityFields(live, togglePatch),
        nextFields: togglePatch,
        label: "Supply visibility"
      });
      if (row._source === "channel_letter") {
        setChannelRows((prev) => prev.map((r) => r.id === row.id ? { ...r, [field]: next } : r));
      } else {
        setFoundationRows((prev) => prev.map((r) => r.id === row.id ? { ...r, [field]: next } : r));
      }
    } catch (error) {
      console.error("Supply toggle failed:", error);
      alert(error?.message || "Supply visibility could not be updated.");
      await load();
    } finally {
      toggleRef.current.delete(lockKey);
    }
  };
  const deleteItem = async (row) => {
    const lockKey = `${row._source}:${row.id}`;
    if (deleteRef.current.has(lockKey)) return;
    deleteRef.current.add(lockKey);
    if (!window.confirm(`Delete "${row.name}"?`)) {
      deleteRef.current.delete(lockKey);
      return;
    }
    const entity = row._source === "channel_letter" ? ChannelLetterInstallInventoryEntity : FoundationInventoryEntity;
    try {
      const live = await entity.get(row.id);
      if (row.raw?.updated_date && live?.updated_date && row.raw.updated_date !== live.updated_date) {
        alert("This supply changed in another session and was not deleted. The latest inventory will be reloaded first.");
        await load();
        return;
      }
      await deleteEntityIfUnchanged({
        entity,
        record: live,
        label: `Supply \u201C${row.name || "Item"}\u201D`
      });
      await load();
    } catch (error) {
      console.error("Supply delete failed:", error);
      alert(error?.message || "Supply could not be deleted.");
      await load();
    } finally {
      deleteRef.current.delete(lockKey);
    }
  };
  return /* @__PURE__ */ jsxs(Card, { className: "bg-white border-0 shadow-sm", children: [
    /* @__PURE__ */ jsxs(CardHeader, { className: "border-b flex flex-row items-center justify-between gap-3 flex-wrap", children: [
      /* @__PURE__ */ jsxs(CardTitle, { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx9(Wrench, { className: "w-5 h-5 text-purple-600" }),
        "Installation & Maintenance Supplies",
        /* @__PURE__ */ jsxs(Badge, { variant: "outline", className: "ml-2 font-normal", children: [
          rows.length,
          " items"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-2 items-center", children: [
        /* @__PURE__ */ jsx9(Input, { placeholder: "Search\u2026", value: search, onChange: (e) => setSearch(e.target.value), className: "h-9 w-56" }),
        isAdmin && /* @__PURE__ */ jsxs(Button, { size: "sm", disabled: !!loadError, onClick: () => {
          setEditItem({ _new: true, _source: "channel_letter", raw: {} });
          setShowForm(true);
        }, className: "bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50", children: [
          /* @__PURE__ */ jsx9(Plus, { className: "w-4 h-4 mr-1" }),
          " Add Supply"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx9(CardContent, { className: "p-0", children: loading ? /* @__PURE__ */ jsx9("div", { className: "p-8 text-center text-slate-500", children: "Loading\u2026" }) : loadError ? /* @__PURE__ */ jsxs("div", { className: "p-8 text-center text-red-700 bg-red-50 border border-red-200", children: [
      /* @__PURE__ */ jsx9("div", { className: "font-semibold", children: "Supply inventory could not be verified." }),
      /* @__PURE__ */ jsx9("div", { className: "mt-1 text-xs", children: loadError }),
      /* @__PURE__ */ jsx9(Button, { variant: "outline", size: "sm", className: "mt-3", onClick: load, children: "Retry" })
    ] }) : rows.length === 0 ? /* @__PURE__ */ jsx9("div", { className: "p-8 text-center text-slate-400 text-sm", children: "No supplies yet." }) : /* @__PURE__ */ jsx9("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsx9("thead", { className: "border-b bg-slate-50", children: /* @__PURE__ */ jsxs("tr", { className: "text-left", children: [
        /* @__PURE__ */ jsx9("th", { className: "px-4 py-3 font-medium text-slate-600", children: "Item" }),
        /* @__PURE__ */ jsx9("th", { className: "px-4 py-3 font-medium text-slate-600", children: "Type / Mode" }),
        /* @__PURE__ */ jsx9("th", { className: "px-4 py-3 font-medium text-slate-600", children: "Cost" }),
        /* @__PURE__ */ jsx9("th", { className: "px-4 py-3 font-medium text-slate-600", children: "Supplier" }),
        /* @__PURE__ */ jsx9("th", { className: "px-4 py-3 font-medium text-slate-600", children: "Storage" }),
        /* @__PURE__ */ jsx9("th", { className: "px-4 py-3 font-medium text-slate-600", children: "Channel & Dim." }),
        /* @__PURE__ */ jsx9("th", { className: "px-4 py-3 font-medium text-slate-600", children: "Concrete | Masonry" }),
        /* @__PURE__ */ jsx9("th", { className: "px-4 py-3 font-medium text-slate-600", children: "Sign Maintenance" }),
        isAdmin && /* @__PURE__ */ jsx9("th", { className: "px-4 py-3 font-medium text-slate-600 text-right", children: "Actions" })
      ] }) }),
      /* @__PURE__ */ jsx9("tbody", { className: "divide-y", children: rows.map((row) => /* @__PURE__ */ jsxs("tr", { className: "hover:bg-slate-50", children: [
        /* @__PURE__ */ jsx9("td", { className: "px-4 py-3 font-medium text-slate-900", children: row.name }),
        /* @__PURE__ */ jsx9("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsx9(Badge, { variant: "outline", className: "font-normal capitalize", children: row.subtype.replace(/_/g, " ") }) }),
        /* @__PURE__ */ jsxs("td", { className: "px-4 py-3 text-slate-700", children: [
          "$",
          parseFloat(row.cost_display || 0).toFixed(2)
        ] }),
        /* @__PURE__ */ jsx9("td", { className: "px-4 py-3 text-slate-700", children: row.supplier || "\u2014" }),
        /* @__PURE__ */ jsx9("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsx9(Badge, { variant: "secondary", className: "font-normal", children: row._source === "channel_letter" ? "CL Inventory" : "Foundation" }) }),
        /* @__PURE__ */ jsx9("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsx9(Switch, { checked: !!row.show_in_channel_letters, onCheckedChange: (v) => toggleVisibility(row, "show_in_channel_letters", v), disabled: !isAdmin }) }),
        /* @__PURE__ */ jsx9("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsx9(Switch, { checked: !!row.show_in_foundation, onCheckedChange: (v) => toggleVisibility(row, "show_in_foundation", v), disabled: !isAdmin }) }),
        /* @__PURE__ */ jsx9("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsx9(Switch, { checked: !!row.show_in_sign_maintenance, onCheckedChange: (v) => toggleVisibility(row, "show_in_sign_maintenance", v), disabled: !isAdmin }) }),
        isAdmin && /* @__PURE__ */ jsxs("td", { className: "px-4 py-3 text-right whitespace-nowrap", children: [
          /* @__PURE__ */ jsx9(Button, { variant: "ghost", size: "icon", onClick: () => {
            setEditItem(row);
            setShowForm(true);
          }, children: /* @__PURE__ */ jsx9(Edit, { className: "w-4 h-4" }) }),
          /* @__PURE__ */ jsx9(Button, { variant: "ghost", size: "icon", className: "text-red-500 hover:bg-red-50", onClick: () => deleteItem(row), children: /* @__PURE__ */ jsx9(Trash2, { className: "w-4 h-4" }) })
        ] })
      ] }, `${row._source}-${row.id}`)) })
    ] }) }) }),
    /* @__PURE__ */ jsx9(Dialog, { open: showForm, onOpenChange: setShowForm, children: /* @__PURE__ */ jsxs(DialogContent, { className: "max-w-2xl max-h-[90vh] overflow-y-auto", children: [
      /* @__PURE__ */ jsx9(DialogHeader, { children: /* @__PURE__ */ jsxs(DialogTitle, { children: [
        editItem?._new ? "Add" : "Edit",
        " Supply"
      ] }) }),
      editItem && /* @__PURE__ */ jsx9(
        SupplyForm,
        {
          row: editItem,
          onCancel: () => {
            setShowForm(false);
            setEditItem(null);
          },
          onSaved: () => {
            setShowForm(false);
            setEditItem(null);
            load();
          }
        }
      )
    ] }) })
  ] });
}
function SupplyForm({ row, onCancel, onSaved }) {
  const isNew = !!row._new;
  const [source, setSource] = useState(row._source);
  const saveRef = useRef(false);
  const buildInitial = (src, raw) => {
    if (src === "channel_letter") {
      return {
        item_name: raw.item_name || "",
        pricing_mode: raw.pricing_mode || "per_letter_flat",
        cost_per_letter: raw.cost_per_letter || 0,
        cost_per_foot: raw.cost_per_foot || 0,
        cost_flat: raw.cost_flat || 0,
        cost_extra_small: raw.cost_extra_small || 0,
        cost_small: raw.cost_small || 0,
        cost_medium: raw.cost_medium || 0,
        cost_large: raw.cost_large || 0,
        cost_extra_large: raw.cost_extra_large || 0,
        cost_extra_extra_large: raw.cost_extra_extra_large || 0,
        unit: raw.unit || "",
        supplier: raw.supplier || "",
        notes: raw.notes || "",
        show_in_install_materials: raw.show_in_install_materials ?? true,
        show_in_foundation_materials: raw.show_in_foundation_materials ?? false,
        show_in_maintenance_materials: raw.show_in_maintenance_materials ?? false
      };
    }
    return {
      material_name: raw.material_name || "",
      material_type: raw.material_type || "concrete_service",
      material_description: raw.material_description || "",
      cost_per_unit: raw.cost_per_unit || 0,
      unit: raw.unit || "",
      supplier: raw.supplier || "",
      notes: raw.notes || "",
      // Carry through foundation-specific fields when editing so we don't drop them.
      ...passThroughFoundation(raw),
      show_in_channel_letters: raw.show_in_channel_letters ?? false,
      show_in_foundation: raw.show_in_foundation ?? true,
      show_in_sign_maintenance: raw.show_in_sign_maintenance ?? false
    };
  };
  const [form, setForm] = useState(buildInitial(source, row.raw || {}));
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const handleSourceChange = (next) => {
    setSource(next);
    setForm(buildInitial(next, {}));
  };
  const nameField = source === "channel_letter" ? "item_name" : "material_name";
  const isValid = !!form[nameField];
  const handleSave = async () => {
    if (saveRef.current) return;
    saveRef.current = true;
    const entity = source === "channel_letter" ? ChannelLetterInstallInventoryEntity : FoundationInventoryEntity;
    try {
      if (isNew) {
        await createInventoryRecordWithRecovery({
          entity,
          data: form,
          nameField,
          label: "Supply item"
        });
      } else {
        const live = await entity.get(row.id);
        if (row.raw?.updated_date && live?.updated_date && row.raw.updated_date !== live.updated_date) {
          alert("This supply changed in another session. Your changes were not saved; the inventory will reload so you can review the latest record.");
          onSaved?.();
          return;
        }
        await replaceEntityFieldsIfUnchanged({
          entity,
          id: row.id,
          expectedUpdatedAt: live.updated_date || "",
          expectedFields: expectedEntityFields(live, form),
          nextFields: form,
          label: "Supply item"
        });
      }
      onSaved?.();
    } catch (error) {
      console.error("Supply save failed:", error);
      alert(error?.message || "Supply could not be saved.");
    } finally {
      saveRef.current = false;
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
    isNew && /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx9(Label, { className: "text-xs", children: "Storage / Item Family" }),
      /* @__PURE__ */ jsxs(Select, { value: source, onValueChange: handleSourceChange, children: [
        /* @__PURE__ */ jsx9(SelectTrigger, { className: "h-8 mt-1", children: /* @__PURE__ */ jsx9(SelectValue, {}) }),
        /* @__PURE__ */ jsxs(SelectContent, { children: [
          /* @__PURE__ */ jsx9(SelectItem, { value: "channel_letter", children: "Channel Letter / Install Supply (per-letter, per-foot pricing)" }),
          /* @__PURE__ */ jsx9(SelectItem, { value: "foundation", children: "Concrete / Masonry / Pole Supply (per-unit pricing, full fields)" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx9(Label, { className: "text-xs", children: "Name *" }),
      /* @__PURE__ */ jsx9(Input, { className: "h-8", value: form[nameField] || "", onChange: (e) => set(nameField, e.target.value) })
    ] }),
    source === "channel_letter" ? /* @__PURE__ */ jsx9(ChannelLetterFields, { form, set }) : /* @__PURE__ */ jsx9(FoundationFields, { form, set }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx9(Label, { className: "text-xs", children: "Supplier" }),
        /* @__PURE__ */ jsx9(Input, { className: "h-8", value: form.supplier || "", onChange: (e) => set("supplier", e.target.value) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx9(Label, { className: "text-xs", children: "Unit" }),
        /* @__PURE__ */ jsx9(Input, { className: "h-8", value: form.unit || "", onChange: (e) => set("unit", e.target.value) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx9(Label, { className: "text-xs", children: "Notes" }),
      /* @__PURE__ */ jsx9(Input, { className: "h-8", value: form.notes || "", onChange: (e) => set("notes", e.target.value) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-lg border bg-slate-50 p-3 space-y-2", children: [
      /* @__PURE__ */ jsx9("p", { className: "text-xs font-semibold text-slate-700", children: "Show in which estimator(s)?" }),
      source === "channel_letter" ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx9(Toggle, { label: "Channel & Dimensional Letters", checked: form.show_in_install_materials, onChange: (v) => set("show_in_install_materials", v) }),
        /* @__PURE__ */ jsx9(Toggle, { label: "Concrete | Masonry | Poles", checked: form.show_in_foundation_materials, onChange: (v) => set("show_in_foundation_materials", v) }),
        /* @__PURE__ */ jsx9(Toggle, { label: "Sign Maintenance", checked: form.show_in_maintenance_materials, onChange: (v) => set("show_in_maintenance_materials", v) })
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx9(Toggle, { label: "Channel & Dimensional Letters", checked: form.show_in_channel_letters, onChange: (v) => set("show_in_channel_letters", v) }),
        /* @__PURE__ */ jsx9(Toggle, { label: "Concrete | Masonry | Poles", checked: form.show_in_foundation, onChange: (v) => set("show_in_foundation", v) }),
        /* @__PURE__ */ jsx9(Toggle, { label: "Sign Maintenance", checked: form.show_in_sign_maintenance, onChange: (v) => set("show_in_sign_maintenance", v) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-2 pt-2", children: [
      /* @__PURE__ */ jsx9(Button, { variant: "outline", size: "sm", onClick: onCancel, children: "Cancel" }),
      /* @__PURE__ */ jsx9(Button, { size: "sm", onClick: handleSave, disabled: !isValid, children: "Save" })
    ] })
  ] });
}
function Toggle({ label, checked, onChange }) {
  return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
    /* @__PURE__ */ jsx9(Switch, { checked: !!checked, onCheckedChange: onChange }),
    /* @__PURE__ */ jsx9(Label, { className: "text-xs", children: label })
  ] });
}
function ChannelLetterFields({ form, set }) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx9(Label, { className: "text-xs", children: "Pricing Mode" }),
      /* @__PURE__ */ jsxs(Select, { value: form.pricing_mode, onValueChange: (v) => set("pricing_mode", v), children: [
        /* @__PURE__ */ jsx9(SelectTrigger, { className: "h-8", children: /* @__PURE__ */ jsx9(SelectValue, {}) }),
        /* @__PURE__ */ jsx9(SelectContent, { children: CHANNEL_PRICING_MODES.map((m) => /* @__PURE__ */ jsx9(SelectItem, { value: m, children: m.replace(/_/g, " ") }, m)) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-3 gap-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx9(Label, { className: "text-xs", children: "$ / Letter" }),
        /* @__PURE__ */ jsx9(Input, { type: "number", className: "h-8", value: form.cost_per_letter, onChange: (e) => set("cost_per_letter", parseFloat(e.target.value) || 0) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx9(Label, { className: "text-xs", children: "$ / Foot" }),
        /* @__PURE__ */ jsx9(Input, { type: "number", className: "h-8", value: form.cost_per_foot, onChange: (e) => set("cost_per_foot", parseFloat(e.target.value) || 0) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx9(Label, { className: "text-xs", children: "Flat $" }),
        /* @__PURE__ */ jsx9(Input, { type: "number", className: "h-8", value: form.cost_flat, onChange: (e) => set("cost_flat", parseFloat(e.target.value) || 0) })
      ] })
    ] }),
    form.pricing_mode === "per_letter_by_size" && /* @__PURE__ */ jsx9("div", { className: "grid grid-cols-3 gap-2", children: ["extra_small", "small", "medium", "large", "extra_large", "extra_extra_large"].map((sz) => /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx9(Label, { className: "text-xs capitalize", children: sz.replace(/_/g, " ") }),
      /* @__PURE__ */ jsx9(Input, { type: "number", className: "h-8", value: form[`cost_${sz}`] || 0, onChange: (e) => set(`cost_${sz}`, parseFloat(e.target.value) || 0) })
    ] }, sz)) })
  ] });
}
function FoundationFields({ form, set }) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx9(Label, { className: "text-xs", children: "Type" }),
        /* @__PURE__ */ jsxs(Select, { value: form.material_type, onValueChange: (v) => set("material_type", v), children: [
          /* @__PURE__ */ jsx9(SelectTrigger, { className: "h-8", children: /* @__PURE__ */ jsx9(SelectValue, {}) }),
          /* @__PURE__ */ jsx9(SelectContent, { children: FOUNDATION_TYPE_OPTIONS.map((t) => /* @__PURE__ */ jsx9(SelectItem, { value: t.value, children: t.label }, t.value)) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx9(Label, { className: "text-xs", children: "Cost / Unit ($)" }),
        /* @__PURE__ */ jsx9(Input, { type: "number", className: "h-8", value: form.cost_per_unit ?? "", onChange: (e) => set("cost_per_unit", inventoryNumberInput(e.target.value)) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx9(Label, { className: "text-xs", children: "Description" }),
      /* @__PURE__ */ jsx9(Input, { className: "h-8", value: form.material_description || "", onChange: (e) => set("material_description", e.target.value) })
    ] })
  ] });
}
function passThroughFoundation(raw) {
  const passKeys = [
    "foundation_usage",
    "lumber_size",
    "thickness_inches",
    "pole_shape",
    "pole_width_inches",
    "pole_depth_inches",
    "pole_wall_thickness_inches",
    "pole_stock_length_ft",
    "pole_stock_price",
    "pole_pricing_mode",
    "paint_rate_per_linear_ft",
    "brick_length_inches",
    "brick_width_inches",
    "brick_height_inches",
    "brick_color",
    "brick_texture",
    "fill_material_subtype",
    "wall_material_subtype",
    "wall_unit_length_inches",
    "wall_unit_width_inches",
    "wall_unit_height_inches",
    "wall_color",
    "wall_texture",
    "cap_stock_length_inches",
    "cap_width_inches",
    "cap_height_inches",
    "cap_profile",
    "cap_color",
    "cap_stock_price",
    "is_cuttable",
    "rebar_size",
    "rebar_support_kind",
    "rebar_support_height_inches",
    "rebar_support_height_min_inches",
    "rebar_support_height_max_inches",
    "rebar_support_footprint_length_inches",
    "rebar_support_footprint_width_inches",
    "rebar_support_material",
    "rebar_support_pack_size",
    "rebar_support_compatible_bar_sizes",
    "rebar_support_placement_notes",
    "minimum_order_yards",
    "below_minimum_cost_per_cy",
    "minimum_cost",
    "mix_3500_price",
    "mix_4000_price",
    "mix_4500_price",
    "mix_5000_price",
    "mix_fast_set_price",
    "admix_calcium_chloride_price",
    "admix_set_retarding_price",
    "admix_water_reducing_price",
    "admix_fibers_price",
    "admix_winter_service_price",
    "small_load_fee_1_1_75",
    "small_load_fee_2_2_75",
    "small_load_fee_3_3_75",
    "small_load_fee_4_4_25",
    "small_load_fee_4_5_4_75",
    "fuel_surcharge",
    "sort_order"
  ];
  const out = {};
  for (const k of passKeys) {
    if (raw[k] !== void 0 && raw[k] !== null) out[k] = raw[k];
  }
  return out;
}
export {
  MasterSuppliesTab as default
};
