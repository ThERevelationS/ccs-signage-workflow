// testtree/stubs/react-shim.mjs
import { createRequire } from "node:module";
var require2 = createRequire(import.meta.url);
var React = require2("react");
var realUseState = React.useState;
var seedQueue = null;
var __seedReactStates = (arr) => {
  seedQueue = Array.isArray(arr) ? [...arr] : null;
};
var useState = (init) => {
  if (seedQueue && seedQueue.length) {
    return realUseState(seedQueue.shift());
  }
  return realUseState(init);
};
var useEffect = React.useEffect;
var useLayoutEffect = React.useLayoutEffect;
var useMemo = React.useMemo;
var useRef = React.useRef;
var useCallback = React.useCallback;
var useReducer = React.useReducer;
var useContext = React.useContext;
var useId = React.useId;
var useImperativeHandle = React.useImperativeHandle;
var useSyncExternalStore = React.useSyncExternalStore;
var useTransition = React.useTransition;
var useDeferredValue = React.useDeferredValue;
var Fragment = React.Fragment;
var StrictMode = React.StrictMode;
var Suspense = React.Suspense;
var Children = React.Children;
var cloneElement = React.cloneElement;
var createContext = React.createContext;
var createElement = React.createElement;
var createFactory = React.createFactory;
var createRef = React.createRef;
var forwardRef = React.forwardRef;
var isValidElement = React.isValidElement;
var lazy = React.lazy;
var memo = React.memo;
var startTransition = React.startTransition;
var version = React.version;
var react_shim_default = React;

// test-o008u-remaining.jsx
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// testtree/stubs/ui.jsx
var passthrough = (tag) => ({ children, ...props }) => react_shim_default.createElement(tag, props, children);
var Card = passthrough("div");
var CardContent = passthrough("div");
var CardHeader = passthrough("div");
var CardTitle = passthrough("div");
var Button = ({ children, size, variant, ...props }) => react_shim_default.createElement("button", { type: "button", ...props }, children);
var Badge = passthrough("span");
var Switch = ({ checked, onCheckedChange, disabled }) => react_shim_default.createElement("button", {
  type: "button",
  role: "switch",
  "aria-checked": checked ? "true" : "false",
  disabled
});
var Tabs = passthrough("div");
var TabsContent = passthrough("div");
var TabsList = passthrough("div");
var TabsTrigger = passthrough("button");
var Dialog = passthrough("div");
var DialogContent = passthrough("div");
var DialogHeader = passthrough("div");
var DialogTitle = passthrough("div");
var Input = ({ className, ...props }) => react_shim_default.createElement("input", { className, ...props });
var Label = passthrough("label");
var Checkbox = ({ checked, onCheckedChange, id }) => react_shim_default.createElement("input", { type: "checkbox", checked: !!checked, readOnly: true, id });
var Select = passthrough("div");
var SelectContent = passthrough("div");
var SelectItem = ({ children, value }) => react_shim_default.createElement("option", { value }, children);
var SelectTrigger = passthrough("div");
var SelectValue = passthrough("span");
var ListSkeleton = () => react_shim_default.createElement("div", { "data-skeleton": "list" });

// testtree/stubs/lucide.jsx
var icon = (name) => () => react_shim_default.createElement("svg", { "data-icon": name });
var ArrowDown = icon("ArrowDown");
var ArrowUp = icon("ArrowUp");
var ArrowUpDown = icon("ArrowUpDown");
var ArrowUpFromLine = icon("ArrowUpFromLine");
var ArrowLeft = icon("ArrowLeft");
var Edit = icon("Edit");
var Pencil = icon("Pencil");
var Trash2 = icon("Trash2");
var Package = icon("Package");
var Plus = icon("Plus");
var Wrench = icon("Wrench");
var Link2 = icon("Link2");
var Settings2 = icon("Settings2");
var Truck = icon("Truck");
var Star = icon("Star");
var Search = icon("Search");
var Boxes = icon("Boxes");
var Upload = icon("Upload");
var ShieldAlert = icon("ShieldAlert");
var Download = icon("Download");
var Building2 = icon("Building2");
var Layers = icon("Layers");
var GripVertical = icon("GripVertical");

// testtree/stubs/builderEntityPersistence.js
var expectedEntityFields = (live, next) => ({ ...live || {}, ...next || {} });
var replaceEntityFieldsIfUnchanged = async ({ nextFields }) => nextFields;
var deleteEntityIfUnchanged = async () => true;

// testtree/src/components/masterInventory/inventoryPersistence.js
var createInventoryRecordWithRecovery = async ({ data }) => ({ record: { id: "stub-new", ...data } });
var findInventoryPartReferences = async () => ({ count: 0, names: [] });
var findInventoryEstimateUsage = async () => ({ estimates: 0, products: 0, estimateIds: [] });

// testtree/src/components/masterInventory/inventoryNormalization.js
var STRICT_SIGNED_DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
var STRICT_UNSIGNED_EXPONENT = /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
var strictNumber = (value, { unsignedExponent = false } = {}) => {
  if (typeof value !== "number" && (typeof value !== "string" || !(unsignedExponent ? STRICT_UNSIGNED_EXPONENT : STRICT_SIGNED_DECIMAL).test(value.trim()))) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
var inventoryNonnegativeNumber = (value) => {
  const number = strictNumber(value);
  return number !== null && number >= 0 ? number : null;
};
var inventoryNumberInput = (value) => String(value).trim() === "" ? null : Number.isFinite(Number(value)) ? Number(value) : value;
var inventorySupplierKey = (value) => {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase().replace(/[\s\-_.]+/g, "_");
  return key === "" ? null : key;
};
var groupInventoryBySupplier = (rows, getSupplier) => {
  const read = typeof getSupplier === "function" ? getSupplier : (row) => row?.supplier;
  const groups = /* @__PURE__ */ new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const authored = read(row);
    const label = typeof authored === "string" && authored.trim() !== "" ? authored.trim() : null;
    const key = inventorySupplierKey(label);
    if (!groups.has(key)) groups.set(key, { key, label, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === null) return 1;
    if (b.key === null) return -1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
};

// testtree/stubs/base44Client.js
var entityStub = () => ({
  get: async () => null,
  list: async () => [],
  filter: async () => [],
  create: async (d) => ({ id: "stub", ...d }),
  update: async (_id, d) => d,
  delete: async () => ({})
});
var base44 = {
  entities: new Proxy({}, { get: () => entityStub() }),
  asServiceRole: { entities: new Proxy({}, { get: () => entityStub() }) },
  auth: { me: async () => ({ role: "admin" }) }
};

// testtree/src/components/masterInventory/InventoryTable.jsx
import { jsx, jsxs } from "react/jsx-runtime";
function UsageBadge({ itemId }) {
  const [usage, setUsage] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [names, setNames] = useState(null);
  useEffect(() => {
    let active = true;
    findInventoryEstimateUsage(itemId).then((u) => {
      if (active && u?.estimates > 0) setUsage(u);
    }).catch(() => {
    });
    return () => {
      active = false;
    };
  }, [itemId]);
  useEffect(() => {
    if (!expanded || names !== null || !usage?.estimateIds?.length) return;
    let active = true;
    (async () => {
      const out = [];
      for (const id of usage.estimateIds) {
        const row = await base44.entities.AllInOneEstimate.get(id).catch(() => null);
        out.push(row?.estimate_name || row?.name || row?.project_name || id);
      }
      if (active) setNames(out);
    })();
    return () => {
      active = false;
    };
  }, [expanded, names, usage]);
  if (!usage) return null;
  return /* @__PURE__ */ jsxs("span", { className: "relative inline-block", children: [
    /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        onClick: () => setExpanded(!expanded),
        className: "ml-1.5 inline-flex items-center rounded bg-sky-100 px-1 py-0.5 text-[9px] font-semibold text-sky-800 align-middle hover:bg-sky-200",
        title: `Used in ${usage.estimates} estimate${usage.estimates === 1 ? "" : "s"} across ${usage.products} product${usage.products === 1 ? "" : "s"} \u2014 click to list`,
        children: [
          usage.estimates,
          " est"
        ]
      }
    ),
    expanded && /* @__PURE__ */ jsxs("span", { className: "absolute left-0 top-full z-20 mt-1 block w-52 rounded border border-slate-200 bg-white p-2 text-[10px] text-slate-700 shadow-lg normal-case", children: [
      /* @__PURE__ */ jsx("span", { className: "block font-semibold mb-1", children: "Estimates using this item:" }),
      names === null ? /* @__PURE__ */ jsx("span", { className: "text-slate-400", children: "Resolving\u2026" }) : /* @__PURE__ */ jsx("span", { className: "block space-y-0.5", children: names.map((n, i) => /* @__PURE__ */ jsxs("span", { className: "block truncate", children: [
        "\u2022 ",
        n
      ] }, i)) })
    ] })
  ] });
}
var formatCell = (val, field) => {
  if (val === null || val === void 0 || val === "") return "\u2014";
  if (field.type === "number") {
    const n = parseFloat(val);
    if (Number.isNaN(n)) return "\u2014";
    if (field.label.includes("$") || field.name.includes("cost")) {
      return `$${n.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return n.toLocaleString();
  }
  if (field.type === "boolean") return val ? "Yes" : "No";
  return String(val).replace(/_/g, " ");
};
function InventoryTable({ source, items, canEdit, onEdit, onDelete, onInlineToggle, bulkField = null, onBulkMove }) {
  const tableFields = source.fields.filter((f) => f.table);
  const toggleRef = useRef(/* @__PURE__ */ new Set());
  const [sort, setSort] = useState(null);
  const [selectedIds, setSelectedIds] = useState(/* @__PURE__ */ new Set());
  const [bulkValue, setBulkValue] = useState("");
  const toggleSelect = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toggleSort = (name) => {
    setSort((prev) => {
      if (!prev || prev.name !== name) return { name, dir: "asc" };
      if (prev.dir === "asc") return { name, dir: "desc" };
      return null;
    });
  };
  const sortedItems = !sort ? items : [...items].sort((a, b) => {
    const field = tableFields.find((f) => f.name === sort.name);
    const av = a[sort.name], bv = b[sort.name];
    if (field?.type === "number") {
      const an = parseFloat(av), bn = parseFloat(bv);
      if (Number.isNaN(an) && Number.isNaN(bn)) return 0;
      if (Number.isNaN(an)) return 1;
      if (Number.isNaN(bn)) return -1;
      return sort.dir === "asc" ? an - bn : bn - an;
    }
    const as = av === null || av === void 0 ? "" : String(av);
    const bs = bv === null || bv === void 0 ? "" : String(bv);
    const cmp = as.localeCompare(bs, void 0, { numeric: true, sensitivity: "base" });
    return sort.dir === "asc" ? cmp : -cmp;
  });
  const allVisibleSelected = sortedItems.length > 0 && sortedItems.every((it) => selectedIds.has(it.id));
  const toggleSelectAll = () => setSelectedIds((prev) => {
    if (allVisibleSelected) return /* @__PURE__ */ new Set();
    const next = new Set(prev);
    sortedItems.forEach((it) => next.add(it.id));
    return next;
  });
  const tableSupplier2 = (row) => row?.supplier || row?.vendor_name || row?.service_name;
  const handleToggle = async (item, field, next) => {
    const lockKey = `${item.id}:${field.name}`;
    if (!canEdit || toggleRef.current.has(lockKey)) return;
    toggleRef.current.add(lockKey);
    try {
      const entity = item._entity || source.entity;
      if (!entity) {
        console.warn("No entity available for inline toggle on", item);
        return;
      }
      const live = await entity.get(item.id);
      if (live?.[field.name] !== item[field.name]) {
        onInlineToggle?.(item.id, field.name, live?.[field.name]);
        alert("This inventory toggle changed in another session. The latest value has been restored; review it before changing again.");
        return;
      }
      const togglePatch = { [field.name]: next };
      const saved = await replaceEntityFieldsIfUnchanged({
        entity,
        id: item.id,
        expectedFields: expectedEntityFields(live, togglePatch),
        nextFields: togglePatch,
        label: `Inventory ${field.label || field.name} toggle`
      });
      onInlineToggle?.(item.id, field.name, saved?.[field.name] ?? next);
    } catch (e) {
      console.error("Toggle failed:", e);
      alert("Failed to update toggle.");
    } finally {
      toggleRef.current.delete(lockKey);
    }
  };
  if (!items.length) {
    return /* @__PURE__ */ jsxs("div", { className: "text-center py-16 text-slate-500", children: [
      /* @__PURE__ */ jsx(Package, { className: "w-12 h-12 mx-auto mb-4 text-slate-300" }),
      /* @__PURE__ */ jsx("p", { className: "font-medium", children: "No items found" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm", children: canEdit ? 'Click "Add Item" to create your first one.' : "Ask an admin to add items here." })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: "w-full", children: [
    bulkField && canEdit && /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2 border-b bg-slate-50 px-2 py-1.5 text-xs", children: [
      /* @__PURE__ */ jsxs("span", { className: "font-semibold text-slate-600", children: [
        selectedIds.size,
        " selected"
      ] }),
      /* @__PURE__ */ jsxs(
        "select",
        {
          value: bulkValue,
          onChange: (e) => setBulkValue(e.target.value),
          className: "h-7 rounded border border-slate-300 bg-white px-1.5 text-xs",
          children: [
            /* @__PURE__ */ jsxs("option", { value: "", children: [
              "Move ",
              bulkField.label || bulkField.name,
              " to\u2026"
            ] }),
            (bulkField.options || []).map((opt) => /* @__PURE__ */ jsx("option", { value: typeof opt === "object" ? opt.value : opt, children: typeof opt === "object" ? opt.label || opt.value : String(opt).replace(/_/g, " ") }, typeof opt === "object" ? opt.value : opt))
          ]
        }
      ),
      /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          disabled: !selectedIds.size || !bulkValue,
          onClick: () => {
            onBulkMove?.([...selectedIds], bulkField.name, bulkValue);
            setSelectedIds(/* @__PURE__ */ new Set());
          },
          className: "h-7 rounded bg-sky-600 px-2.5 font-semibold text-white hover:bg-sky-700 disabled:opacity-40",
          children: [
            "Move ",
            selectedIds.size > 0 ? `${selectedIds.size} ` : "",
            "selected"
          ]
        }
      ),
      selectedIds.size > 0 && /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setSelectedIds(/* @__PURE__ */ new Set()), className: "text-slate-500 underline", children: "Clear" })
    ] }),
    /* @__PURE__ */ jsxs("table", { className: "w-full text-sm table-fixed", children: [
      /* @__PURE__ */ jsx("thead", { className: "border-b bg-slate-50", children: /* @__PURE__ */ jsxs("tr", { className: "text-left", children: [
        bulkField && canEdit && /* @__PURE__ */ jsx("th", { className: "w-8 px-2 py-3", children: /* @__PURE__ */ jsx(
          "input",
          {
            type: "checkbox",
            checked: allVisibleSelected,
            onChange: toggleSelectAll,
            title: allVisibleSelected ? "Deselect all visible" : "Select all visible"
          }
        ) }),
        tableFields.map((f) => /* @__PURE__ */ jsx("th", { className: "px-2 py-3 font-medium text-slate-600 text-xs", children: /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => toggleSort(f.name), className: "inline-flex items-center gap-1 hover:text-slate-900", title: `Sort by ${f.label}`, children: [
          f.label,
          sort?.name === f.name ? sort.dir === "asc" ? /* @__PURE__ */ jsx(ArrowUp, { className: "w-3 h-3" }) : /* @__PURE__ */ jsx(ArrowDown, { className: "w-3 h-3" }) : /* @__PURE__ */ jsx(ArrowUpDown, { className: "w-3 h-3 opacity-40" })
        ] }) }, f.name)),
        canEdit && /* @__PURE__ */ jsx("th", { className: "px-2 py-3 font-medium text-slate-600 text-right text-xs w-20", children: "Actions" })
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { className: "divide-y", children: groupInventoryBySupplier(sortedItems, tableSupplier2).map((group) => (
        // CMP-A08 tail: explicit supply grouping — a supplier header row
        // sections the table by canonical supplier key; unrecorded
        // suppliers stay visible last, never merged.
        /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("tr", { className: "bg-slate-50/80", children: /* @__PURE__ */ jsxs("td", { colSpan: tableFields.length + (canEdit ? 1 : 0) + (bulkField && canEdit ? 1 : 0), className: "px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500", children: [
            "Supplier: ",
            /* @__PURE__ */ jsx("span", { className: "text-slate-700 normal-case", children: group.label || "\u2014 not recorded" }),
            /* @__PURE__ */ jsxs("span", { className: "ml-2 font-normal normal-case text-slate-400", children: [
              "(",
              group.rows.length,
              ")"
            ] })
          ] }) }),
          group.rows.map((item) => /* @__PURE__ */ jsxs("tr", { className: "hover:bg-slate-50 transition-colors", children: [
            bulkField && canEdit && /* @__PURE__ */ jsx("td", { className: "w-8 px-2 py-3 align-top", children: /* @__PURE__ */ jsx(
              "input",
              {
                type: "checkbox",
                checked: selectedIds.has(item.id),
                onChange: () => toggleSelect(item.id),
                title: "Select for bulk move"
              }
            ) }),
            tableFields.map((f, idx) => /* @__PURE__ */ jsx("td", { className: "px-2 py-3 align-top", children: idx === 0 ? /* @__PURE__ */ jsxs("span", { className: "font-medium text-slate-900", children: [
              formatCell(item[f.name], f),
              /* @__PURE__ */ jsx(UsageBadge, { itemId: item.id })
            ] }) : f.type === "boolean" ? canEdit ? /* @__PURE__ */ jsx(
              Switch,
              {
                checked: !!item[f.name],
                onCheckedChange: (next) => handleToggle(item, f, next)
              }
            ) : /* @__PURE__ */ jsx("span", { className: "text-slate-700", children: formatCell(item[f.name], f) }) : f.type === "select" ? /* @__PURE__ */ jsx(Badge, { variant: "outline", className: "font-normal", children: formatCell(item[f.name], f) }) : /* @__PURE__ */ jsx("span", { className: "text-slate-700", children: formatCell(item[f.name], f) }) }, f.name)),
            canEdit && /* @__PURE__ */ jsxs("td", { className: "px-2 py-3 text-right whitespace-nowrap", children: [
              /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", className: "h-7 w-7", onClick: () => onEdit(item), children: /* @__PURE__ */ jsx(Edit, { className: "w-3.5 h-3.5" }) }),
              /* @__PURE__ */ jsx(
                Button,
                {
                  variant: "ghost",
                  size: "icon",
                  className: "h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50",
                  onClick: () => onDelete(item),
                  children: /* @__PURE__ */ jsx(Trash2, { className: "w-3.5 h-3.5" })
                }
              )
            ] })
          ] }, item.id))
        ] }, group.key ?? "__unassigned__")
      )) })
    ] })
  ] });
}

// testtree/src/remoteBaseline/inventoryPersistence.js
var findInventoryEstimateUsage2 = async () => ({ estimates: 0, products: 0, estimateIds: [] });

// testtree/src/remoteBaseline/InventoryTable.jsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function UsageBadge2({ itemId }) {
  const [usage, setUsage] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [names, setNames] = useState(null);
  useEffect(() => {
    let active = true;
    findInventoryEstimateUsage2(itemId).then((u) => {
      if (active && u?.estimates > 0) setUsage(u);
    }).catch(() => {
    });
    return () => {
      active = false;
    };
  }, [itemId]);
  useEffect(() => {
    if (!expanded || names !== null || !usage?.estimateIds?.length) return;
    let active = true;
    (async () => {
      const out = [];
      for (const id of usage.estimateIds) {
        const row = await base44.entities.AllInOneEstimate.get(id).catch(() => null);
        out.push(row?.estimate_name || row?.name || row?.project_name || id);
      }
      if (active) setNames(out);
    })();
    return () => {
      active = false;
    };
  }, [expanded, names, usage]);
  if (!usage) return null;
  return /* @__PURE__ */ jsxs2("span", { className: "relative inline-block", children: [
    /* @__PURE__ */ jsxs2(
      "button",
      {
        type: "button",
        onClick: () => setExpanded(!expanded),
        className: "ml-1.5 inline-flex items-center rounded bg-sky-100 px-1 py-0.5 text-[9px] font-semibold text-sky-800 align-middle hover:bg-sky-200",
        title: `Used in ${usage.estimates} estimate${usage.estimates === 1 ? "" : "s"} across ${usage.products} product${usage.products === 1 ? "" : "s"} \u2014 click to list`,
        children: [
          usage.estimates,
          " est"
        ]
      }
    ),
    expanded && /* @__PURE__ */ jsxs2("span", { className: "absolute left-0 top-full z-20 mt-1 block w-52 rounded border border-slate-200 bg-white p-2 text-[10px] text-slate-700 shadow-lg normal-case", children: [
      /* @__PURE__ */ jsx2("span", { className: "block font-semibold mb-1", children: "Estimates using this item:" }),
      names === null ? /* @__PURE__ */ jsx2("span", { className: "text-slate-400", children: "Resolving\u2026" }) : /* @__PURE__ */ jsx2("span", { className: "block space-y-0.5", children: names.map((n, i) => /* @__PURE__ */ jsxs2("span", { className: "block truncate", children: [
        "\u2022 ",
        n
      ] }, i)) })
    ] })
  ] });
}
var formatCell2 = (val, field) => {
  if (val === null || val === void 0 || val === "") return "\u2014";
  if (field.type === "number") {
    const n = parseFloat(val);
    if (Number.isNaN(n)) return "\u2014";
    if (field.label.includes("$") || field.name.includes("cost")) {
      return `$${n.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return n.toLocaleString();
  }
  if (field.type === "boolean") return val ? "Yes" : "No";
  return String(val).replace(/_/g, " ");
};
function InventoryTable2({ source, items, canEdit, onEdit, onDelete, onInlineToggle, bulkField = null, onBulkMove }) {
  const tableFields = source.fields.filter((f) => f.table);
  const toggleRef = useRef(/* @__PURE__ */ new Set());
  const [sort, setSort] = useState(null);
  const [selectedIds, setSelectedIds] = useState(/* @__PURE__ */ new Set());
  const [bulkValue, setBulkValue] = useState("");
  const toggleSelect = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const allVisibleSelected = sortedItems.length > 0 && sortedItems.every((it) => selectedIds.has(it.id));
  const toggleSelectAll = () => setSelectedIds((prev) => {
    if (allVisibleSelected) return /* @__PURE__ */ new Set();
    const next = new Set(prev);
    sortedItems.forEach((it) => next.add(it.id));
    return next;
  });
  const toggleSort = (name) => {
    setSort((prev) => {
      if (!prev || prev.name !== name) return { name, dir: "asc" };
      if (prev.dir === "asc") return { name, dir: "desc" };
      return null;
    });
  };
  const sortedItems = !sort ? items : [...items].sort((a, b) => {
    const field = tableFields.find((f) => f.name === sort.name);
    const av = a[sort.name], bv = b[sort.name];
    if (field?.type === "number") {
      const an = parseFloat(av), bn = parseFloat(bv);
      if (Number.isNaN(an) && Number.isNaN(bn)) return 0;
      if (Number.isNaN(an)) return 1;
      if (Number.isNaN(bn)) return -1;
      return sort.dir === "asc" ? an - bn : bn - an;
    }
    const as = av === null || av === void 0 ? "" : String(av);
    const bs = bv === null || bv === void 0 ? "" : String(bv);
    const cmp = as.localeCompare(bs, void 0, { numeric: true, sensitivity: "base" });
    return sort.dir === "asc" ? cmp : -cmp;
  });
  const handleToggle = async (item, field, next) => {
    const lockKey = `${item.id}:${field.name}`;
    if (!canEdit || toggleRef.current.has(lockKey)) return;
    toggleRef.current.add(lockKey);
    try {
      const entity = item._entity || source.entity;
      if (!entity) {
        console.warn("No entity available for inline toggle on", item);
        return;
      }
      const live = await entity.get(item.id);
      if (live?.[field.name] !== item[field.name]) {
        onInlineToggle?.(item.id, field.name, live?.[field.name]);
        alert("This inventory toggle changed in another session. The latest value has been restored; review it before changing again.");
        return;
      }
      const togglePatch = { [field.name]: next };
      const saved = await replaceEntityFieldsIfUnchanged({
        entity,
        id: item.id,
        expectedFields: expectedEntityFields(live, togglePatch),
        nextFields: togglePatch,
        label: `Inventory ${field.label || field.name} toggle`
      });
      onInlineToggle?.(item.id, field.name, saved?.[field.name] ?? next);
    } catch (e) {
      console.error("Toggle failed:", e);
      alert("Failed to update toggle.");
    } finally {
      toggleRef.current.delete(lockKey);
    }
  };
  if (!items.length) {
    return /* @__PURE__ */ jsxs2("div", { className: "text-center py-16 text-slate-500", children: [
      /* @__PURE__ */ jsx2(Package, { className: "w-12 h-12 mx-auto mb-4 text-slate-300" }),
      /* @__PURE__ */ jsx2("p", { className: "font-medium", children: "No items found" }),
      /* @__PURE__ */ jsx2("p", { className: "text-sm", children: canEdit ? 'Click "Add Item" to create your first one.' : "Ask an admin to add items here." })
    ] });
  }
  return /* @__PURE__ */ jsxs2("div", { className: "w-full", children: [
    bulkField && canEdit && /* @__PURE__ */ jsxs2("div", { className: "flex flex-wrap items-center gap-2 border-b bg-slate-50 px-2 py-1.5 text-xs", children: [
      /* @__PURE__ */ jsxs2("span", { className: "font-semibold text-slate-600", children: [
        selectedIds.size,
        " selected"
      ] }),
      /* @__PURE__ */ jsxs2(
        "select",
        {
          value: bulkValue,
          onChange: (e) => setBulkValue(e.target.value),
          className: "h-7 rounded border border-slate-300 bg-white px-1.5 text-xs",
          children: [
            /* @__PURE__ */ jsxs2("option", { value: "", children: [
              "Move ",
              bulkField.label || bulkField.name,
              " to\u2026"
            ] }),
            (bulkField.options || []).map((opt) => /* @__PURE__ */ jsx2("option", { value: typeof opt === "object" ? opt.value : opt, children: typeof opt === "object" ? opt.label || opt.value : String(opt).replace(/_/g, " ") }, typeof opt === "object" ? opt.value : opt))
          ]
        }
      ),
      /* @__PURE__ */ jsxs2(
        "button",
        {
          type: "button",
          disabled: !selectedIds.size || !bulkValue,
          onClick: () => {
            onBulkMove?.([...selectedIds], bulkField.name, bulkValue);
            setSelectedIds(/* @__PURE__ */ new Set());
          },
          className: "h-7 rounded bg-sky-600 px-2.5 font-semibold text-white hover:bg-sky-700 disabled:opacity-40",
          children: [
            "Move ",
            selectedIds.size > 0 ? `${selectedIds.size} ` : "",
            "selected"
          ]
        }
      ),
      selectedIds.size > 0 && /* @__PURE__ */ jsx2("button", { type: "button", onClick: () => setSelectedIds(/* @__PURE__ */ new Set()), className: "text-slate-500 underline", children: "Clear" })
    ] }),
    /* @__PURE__ */ jsxs2("table", { className: "w-full text-sm table-fixed", children: [
      /* @__PURE__ */ jsx2("thead", { className: "border-b bg-slate-50", children: /* @__PURE__ */ jsxs2("tr", { className: "text-left", children: [
        bulkField && canEdit && /* @__PURE__ */ jsx2("th", { className: "w-8 px-2 py-3", children: /* @__PURE__ */ jsx2(
          "input",
          {
            type: "checkbox",
            checked: allVisibleSelected,
            onChange: toggleSelectAll,
            title: allVisibleSelected ? "Deselect all visible" : "Select all visible"
          }
        ) }),
        tableFields.map((f) => /* @__PURE__ */ jsx2("th", { className: "px-2 py-3 font-medium text-slate-600 text-xs", children: /* @__PURE__ */ jsxs2("button", { type: "button", onClick: () => toggleSort(f.name), className: "inline-flex items-center gap-1 hover:text-slate-900", title: `Sort by ${f.label}`, children: [
          f.label,
          sort?.name === f.name ? sort.dir === "asc" ? /* @__PURE__ */ jsx2(ArrowUp, { className: "w-3 h-3" }) : /* @__PURE__ */ jsx2(ArrowDown, { className: "w-3 h-3" }) : /* @__PURE__ */ jsx2(ArrowUpDown, { className: "w-3 h-3 opacity-40" })
        ] }) }, f.name)),
        canEdit && /* @__PURE__ */ jsx2("th", { className: "px-2 py-3 font-medium text-slate-600 text-right text-xs w-20", children: "Actions" })
      ] }) }),
      /* @__PURE__ */ jsx2("tbody", { className: "divide-y", children: sortedItems.map((item) => /* @__PURE__ */ jsxs2("tr", { className: "hover:bg-slate-50 transition-colors", children: [
        bulkField && canEdit && /* @__PURE__ */ jsx2("td", { className: "w-8 px-2 py-3 align-top", children: /* @__PURE__ */ jsx2(
          "input",
          {
            type: "checkbox",
            checked: selectedIds.has(item.id),
            onChange: () => toggleSelect(item.id),
            title: "Select for bulk move"
          }
        ) }),
        tableFields.map((f, idx) => /* @__PURE__ */ jsx2("td", { className: "px-2 py-3 align-top", children: idx === 0 ? /* @__PURE__ */ jsxs2("span", { className: "font-medium text-slate-900", children: [
          formatCell2(item[f.name], f),
          /* @__PURE__ */ jsx2(UsageBadge2, { itemId: item.id })
        ] }) : f.type === "boolean" ? canEdit ? /* @__PURE__ */ jsx2(
          Switch,
          {
            checked: !!item[f.name],
            onCheckedChange: (next) => handleToggle(item, f, next)
          }
        ) : /* @__PURE__ */ jsx2("span", { className: "text-slate-700", children: formatCell2(item[f.name], f) }) : f.type === "select" ? /* @__PURE__ */ jsx2(Badge, { variant: "outline", className: "font-normal", children: formatCell2(item[f.name], f) }) : /* @__PURE__ */ jsx2("span", { className: "text-slate-700", children: formatCell2(item[f.name], f) }) }, f.name)),
        canEdit && /* @__PURE__ */ jsxs2("td", { className: "px-2 py-3 text-right whitespace-nowrap", children: [
          /* @__PURE__ */ jsx2(Button, { variant: "ghost", size: "icon", className: "h-7 w-7", onClick: () => onEdit(item), children: /* @__PURE__ */ jsx2(Edit, { className: "w-3.5 h-3.5" }) }),
          /* @__PURE__ */ jsx2(
            Button,
            {
              variant: "ghost",
              size: "icon",
              className: "h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50",
              onClick: () => onDelete(item),
              children: /* @__PURE__ */ jsx2(Trash2, { className: "w-3.5 h-3.5" })
            }
          )
        ] })
      ] }, item.id)) })
    ] })
  ] });
}

// testtree/stubs/loadAllEntityRows.js
var loadAllEntityRows = async () => [];

// testtree/stubs/staffEntities.js
var entityStub2 = () => ({
  get: async () => null,
  list: async () => [],
  filter: async () => [],
  create: async (d) => ({ id: "stub", ...d }),
  update: async (_id, d) => d,
  delete: async () => ({})
});
var staffEntities = new Proxy({}, { get: () => entityStub2() });

// testtree/src/components/masterInventory/equipmentPersistence.js
var replaceRelationshipIdsIfUnchanged = async () => true;
var setExclusiveBooleanSafely = async () => true;

// testtree/src/components/masterInventory/MasterEquipmentTab.jsx
import { Fragment as Fragment2, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var FoundationInventoryEntity = base44.entities.FoundationInventory;
var ChannelLetterInstallEquipmentEntity = staffEntities.ChannelLetterInstallEquipment;
var FOUNDATION_EQUIPMENT_TYPES = ["excavation_equipment", "attachment", "sub_attachment"];
var BOOM_EQUIPMENT_TYPES = ["boom_lift", "boom_truck"];
function MultiSelectDropdown({ label, options, selectedIds, onChange }) {
  const toggle = (id) => onChange(selectedIds.includes(id) ? selectedIds.filter((i) => i !== id) : [...selectedIds, id]);
  return /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
    /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: label }),
    /* @__PURE__ */ jsxs3("div", { className: "border rounded-md p-2 space-y-1 max-h-40 overflow-y-auto bg-slate-50", children: [
      options.length === 0 && /* @__PURE__ */ jsx3("p", { className: "text-xs text-slate-400 italic", children: "No items available" }),
      options.map((opt) => /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx3(Checkbox, { id: `ms-${opt.id}`, checked: selectedIds.includes(opt.id), onCheckedChange: () => toggle(opt.id) }),
        /* @__PURE__ */ jsx3(Label, { htmlFor: `ms-${opt.id}`, className: "text-xs cursor-pointer", children: opt.material_name })
      ] }, opt.id))
    ] })
  ] });
}
function normalizeRow(row, source) {
  if (source === "channel_letter_equipment") {
    return {
      _source: source,
      id: row.id,
      name: row.equipment_name,
      kind: "equipment",
      // top-level equipment (no attachment tree on this entity)
      equipment_type: row.equipment_type || "",
      ownership: row.ownership || "rented",
      is_primary_owned: row.is_primary_owned ?? false,
      // CMP-A08 tail: rental costs pass through ?? null — an authored explicit
      // 0 stays 0 (a real free rate), an unrecorded cost stays null ("not
      // cataloged") rather than minting a display/stored zero.
      cost_per_day: row.cost_per_day ?? null,
      cost_per_week: row.cost_per_week ?? null,
      cost_per_month: row.cost_per_month ?? null,
      show_in_channel_letters: row.show_in_channel_letters ?? true,
      show_in_foundation: row.show_in_foundation ?? false,
      show_in_sign_maintenance: row.show_in_sign_maintenance ?? false,
      raw: row
    };
  }
  const kind = row.material_type === "attachment" ? "attachment" : row.material_type === "sub_attachment" ? "sub_attachment" : "equipment";
  return {
    _source: "foundation_equipment",
    id: row.id,
    name: row.material_name,
    kind,
    equipment_type: row.equipment_type || "",
    ownership: row.ownership || "rented",
    cost_per_day: row.cost_per_day ?? null,
    cost_per_week: row.cost_per_week ?? null,
    cost_per_month: row.cost_per_month ?? null,
    show_in_channel_letters: row.show_in_channel_letters ?? false,
    show_in_foundation: row.show_in_foundation ?? true,
    show_in_sign_maintenance: row.show_in_sign_maintenance ?? false,
    raw: row
  };
}
function MasterEquipmentTab({ isAdmin }) {
  const [foundationRows, setFoundationRows] = useState([]);
  const [channelRows, setChannelRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ownership, setOwnership] = useState("rented");
  const [activeKind, setActiveKind] = useState("equipment");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [loadError, setLoadError] = useState("");
  const actionRef = useRef(/* @__PURE__ */ new Set());
  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [fnd, chn] = await Promise.all([
        loadAllEntityRows({ entity: FoundationInventoryEntity, sort: "material_name", label: "Foundation equipment inventory" }),
        loadAllEntityRows({ entity: ChannelLetterInstallEquipmentEntity, sort: "sort_order", label: "Channel Letter equipment inventory" })
      ]);
      setFoundationRows(fnd.filter((r) => FOUNDATION_EQUIPMENT_TYPES.includes(r.material_type)));
      setChannelRows(chn);
    } catch (e) {
      console.error(e);
      setLoadError(e?.message || "Equipment inventory could not be verified.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const allNormalized = useMemo(() => {
    const a = foundationRows.map((r) => normalizeRow(r, "foundation_equipment"));
    const b = channelRows.map((r) => normalizeRow(r, "channel_letter_equipment"));
    const list = [...a, ...b].filter((r) => (r.ownership || "rented") === ownership);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (r) => [r.name, r.equipment_type].some((v) => v && String(v).toLowerCase().includes(q))
    );
  }, [foundationRows, channelRows, ownership, search]);
  const isBoom = (r) => BOOM_EQUIPMENT_TYPES.includes(r.equipment_type);
  const equipmentRows = allNormalized.filter((r) => r.kind === "equipment" && !isBoom(r));
  const boomRows = allNormalized.filter((r) => r.kind === "equipment" && isBoom(r));
  const attachmentRows = allNormalized.filter((r) => r.kind === "attachment");
  const subAttachRows = allNormalized.filter((r) => r.kind === "sub_attachment");
  const allFoundationAttachments = foundationRows.filter((r) => r.material_type === "attachment");
  const allFoundationSubAttachments = foundationRows.filter((r) => r.material_type === "sub_attachment");
  const allFoundationEquipment = foundationRows.filter((r) => r.material_type === "excavation_equipment");
  const deleteItem = async (row) => {
    const lockKey = `delete:${row._source}:${row.id}`;
    if (actionRef.current.has(lockKey)) return;
    actionRef.current.add(lockKey);
    if (!window.confirm(`Delete "${row.name}"? This cannot be undone.`)) {
      actionRef.current.delete(lockKey);
      return;
    }
    const entity = row._source === "channel_letter_equipment" ? ChannelLetterInstallEquipmentEntity : FoundationInventoryEntity;
    try {
      const live = await entity.get(row.id);
      if (row.raw?.updated_date && live?.updated_date && row.raw.updated_date !== live.updated_date) {
        alert("This equipment item changed in another session and was not deleted. The latest equipment inventory will be reloaded first.");
        await load();
        return;
      }
      const refs = await findInventoryPartReferences(row.id);
      if (refs.count > 0) {
        alert(`"${row.name}" is used by ${refs.count} estimate Part${refs.count === 1 ? "" : "s"} (${refs.names.join(", ")}${refs.count > 5 ? ", \u2026" : ""}). Detach or remove those Parts before deleting this item.`);
        return;
      }
      await deleteEntityIfUnchanged({
        entity,
        record: live,
        label: `Equipment item \u201C${row.name || "Item"}\u201D`
      });
      await load();
    } catch (error) {
      console.error("Equipment delete failed:", error);
      alert(error?.message || "Equipment could not be deleted.");
      await load();
    } finally {
      actionRef.current.delete(lockKey);
    }
  };
  const toggleVisibility = async (row, field, next) => {
    const lockKey = `toggle:${row._source}:${row.id}:${field}`;
    if (actionRef.current.has(lockKey)) return;
    actionRef.current.add(lockKey);
    const entity = row._source === "channel_letter_equipment" ? ChannelLetterInstallEquipmentEntity : FoundationInventoryEntity;
    try {
      const live = await entity.get(row.id);
      if (live?.[field] !== row.raw?.[field]) {
        alert("This equipment visibility setting changed in another session. The latest equipment inventory will be reloaded first.");
        await load();
        return;
      }
      const togglePatch = { [field]: next };
      await replaceEntityFieldsIfUnchanged({
        entity,
        id: row.id,
        expectedFields: expectedEntityFields(live, togglePatch),
        nextFields: togglePatch,
        label: "Equipment visibility"
      });
      if (row._source === "channel_letter_equipment") {
        setChannelRows((prev) => prev.map((r) => r.id === row.id ? { ...r, [field]: next } : r));
      } else {
        setFoundationRows((prev) => prev.map((r) => r.id === row.id ? { ...r, [field]: next } : r));
      }
    } catch (error) {
      console.error("Equipment toggle failed:", error);
      alert(error?.message || "Equipment visibility could not be updated.");
      await load();
    } finally {
      actionRef.current.delete(lockKey);
    }
  };
  const setPrimaryOwned = async (row, next) => {
    const lockKey = `primary:${row.id}`;
    if (row._source !== "channel_letter_equipment" || actionRef.current.has(lockKey)) return;
    actionRef.current.add(lockKey);
    try {
      await setExclusiveBooleanSafely({
        entity: ChannelLetterInstallEquipmentEntity,
        targetId: row.id,
        field: "is_primary_owned",
        next,
        expectedTargetUpdatedAt: row.raw?.updated_date || "",
        readRows: () => loadAllEntityRows({ entity: ChannelLetterInstallEquipmentEntity, sort: "sort_order", label: "Channel Letter equipment inventory" }),
        label: "Primary owned lift selection"
      });
      await load();
    } catch (error) {
      console.error("Primary owned equipment update failed:", error);
      alert(error?.message || "Primary owned equipment could not be updated.");
      await load();
    } finally {
      actionRef.current.delete(lockKey);
    }
  };
  const openAdd = () => {
    if (activeKind === "boom_lift") {
      setEditItem({
        _new: true,
        kind: "equipment",
        _source: "channel_letter_equipment",
        equipment_type: "boom_lift",
        raw: {
          equipment_name: "",
          equipment_type: "boom_lift",
          pricing_mode: "per_day",
          ownership,
          // CMP-A08 tail: cost fields open null ("not cataloged") rather than
          // minted 0s that would persist a fabricated free rental rate the
          // admin never typed; an explicit 0 typed into the form still saves
          // as a real authored zero.
          cost_per_day: null,
          cost_per_week: null,
          cost_per_month: null,
          delivery_pickup_cost: null,
          show_in_channel_letters: true,
          show_in_foundation: false,
          show_in_sign_maintenance: false
        }
      });
      setShowForm(true);
      return;
    }
    setEditItem({
      _new: true,
      kind: activeKind,
      _source: "foundation_equipment",
      raw: {
        material_type: activeKind === "attachment" ? "attachment" : activeKind === "sub_attachment" ? "sub_attachment" : "excavation_equipment",
        material_name: "",
        cost_per_day: null,
        cost_per_week: null,
        cost_per_month: null,
        pickup_delivery_cost: null,
        ownership,
        compatible_attachment_ids: [],
        compatible_sub_attachment_ids: [],
        show_in_channel_letters: false,
        show_in_foundation: true,
        show_in_sign_maintenance: false,
        sort_order: null
      }
    });
    setShowForm(true);
  };
  const openEdit = (row) => {
    setEditItem({ ...row });
    setShowForm(true);
  };
  return /* @__PURE__ */ jsxs3(Card, { className: "bg-white border-0 shadow-sm", children: [
    /* @__PURE__ */ jsxs3(CardHeader, { className: "border-b flex flex-row items-center justify-between gap-3 flex-wrap", children: [
      /* @__PURE__ */ jsxs3(CardTitle, { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx3(Truck, { className: "w-5 h-5 text-cyan-600" }),
        "Equipment",
        /* @__PURE__ */ jsxs3(Badge, { variant: "outline", className: "ml-2 font-normal", children: [
          allNormalized.length,
          " items"
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsx3(Input, { placeholder: "Search\u2026", value: search, onChange: (e) => setSearch(e.target.value), className: "h-9 w-56" }),
        /* @__PURE__ */ jsx3(Tabs, { value: ownership, onValueChange: setOwnership, children: /* @__PURE__ */ jsxs3(TabsList, { children: [
          /* @__PURE__ */ jsx3(TabsTrigger, { value: "rented", children: "Rental" }),
          /* @__PURE__ */ jsx3(TabsTrigger, { value: "owned", children: "Owned" })
        ] }) }),
        isAdmin && /* @__PURE__ */ jsxs3(Button, { size: "sm", onClick: openAdd, disabled: !!loadError, className: "bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50", children: [
          /* @__PURE__ */ jsx3(Plus, { className: "w-4 h-4 mr-1" }),
          " Add ",
          activeKind === "equipment" ? "Construction Equipment" : activeKind === "boom_lift" ? "Boom Lift" : activeKind === "attachment" ? "Attachment" : "Sub-Attachment"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx3(CardContent, { className: "pt-4", children: /* @__PURE__ */ jsxs3(Tabs, { value: activeKind, onValueChange: setActiveKind, children: [
      /* @__PURE__ */ jsxs3(TabsList, { className: "mb-4", children: [
        /* @__PURE__ */ jsxs3(TabsTrigger, { value: "equipment", children: [
          /* @__PURE__ */ jsx3(Wrench, { className: "w-3.5 h-3.5 mr-1" }),
          " Construction Equipment (",
          equipmentRows.length,
          ")"
        ] }),
        /* @__PURE__ */ jsxs3(TabsTrigger, { value: "boom_lift", children: [
          /* @__PURE__ */ jsx3(ArrowUpFromLine, { className: "w-3.5 h-3.5 mr-1" }),
          " Boom Lifts (",
          boomRows.length,
          ")"
        ] }),
        /* @__PURE__ */ jsxs3(TabsTrigger, { value: "attachment", children: [
          /* @__PURE__ */ jsx3(Link2, { className: "w-3.5 h-3.5 mr-1" }),
          " Attachments (",
          attachmentRows.length,
          ")"
        ] }),
        /* @__PURE__ */ jsxs3(TabsTrigger, { value: "sub_attachment", children: [
          /* @__PURE__ */ jsx3(Settings2, { className: "w-3.5 h-3.5 mr-1" }),
          " Sub-Attachments (",
          subAttachRows.length,
          ")"
        ] })
      ] }),
      /* @__PURE__ */ jsx3(TabsContent, { value: "equipment", children: /* @__PURE__ */ jsx3(
        EquipmentList,
        {
          rows: equipmentRows,
          attachments: allFoundationAttachments,
          equipment: allFoundationEquipment,
          loading,
          loadError,
          isAdmin,
          onEdit: openEdit,
          onDelete: deleteItem,
          onToggle: toggleVisibility
        }
      ) }),
      /* @__PURE__ */ jsx3(TabsContent, { value: "boom_lift", children: /* @__PURE__ */ jsx3(
        EquipmentList,
        {
          rows: boomRows,
          attachments: allFoundationAttachments,
          equipment: allFoundationEquipment,
          loading,
          loadError,
          isAdmin,
          isBoomList: true,
          onEdit: openEdit,
          onDelete: deleteItem,
          onToggle: toggleVisibility,
          onSetPrimary: setPrimaryOwned
        }
      ) }),
      /* @__PURE__ */ jsx3(TabsContent, { value: "attachment", children: /* @__PURE__ */ jsx3(
        EquipmentList,
        {
          rows: attachmentRows,
          attachments: allFoundationAttachments,
          subAttachments: allFoundationSubAttachments,
          equipment: allFoundationEquipment,
          isAttachment: true,
          loading,
          loadError,
          isAdmin,
          onEdit: openEdit,
          onDelete: deleteItem,
          onToggle: toggleVisibility
        }
      ) }),
      /* @__PURE__ */ jsx3(TabsContent, { value: "sub_attachment", children: /* @__PURE__ */ jsx3(
        EquipmentList,
        {
          rows: subAttachRows,
          attachments: allFoundationAttachments,
          isSubAttachment: true,
          loading,
          loadError,
          isAdmin,
          onEdit: openEdit,
          onDelete: deleteItem,
          onToggle: toggleVisibility
        }
      ) })
    ] }) }),
    /* @__PURE__ */ jsx3(Dialog, { open: showForm, onOpenChange: setShowForm, children: /* @__PURE__ */ jsxs3(DialogContent, { className: "max-w-lg max-h-[90vh] overflow-y-auto", children: [
      /* @__PURE__ */ jsx3(DialogHeader, { children: /* @__PURE__ */ jsxs3(DialogTitle, { children: [
        editItem?._new ? "Add" : "Edit",
        " ",
        activeKind === "equipment" ? "Construction Equipment" : activeKind === "boom_lift" ? "Boom Lift" : activeKind === "attachment" ? "Attachment" : "Sub-Attachment"
      ] }) }),
      editItem && /* @__PURE__ */ jsx3(
        EquipmentForm,
        {
          normalized: editItem,
          ownership,
          allFoundationEquipment,
          allFoundationAttachments,
          allFoundationSubAttachments,
          allChannelEquipment: channelRows,
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
function EquipmentList({ rows, attachments = [], subAttachments = [], equipment = [], isAttachment, isSubAttachment, isBoomList, loading, loadError, isAdmin, onEdit, onDelete, onToggle, onSetPrimary }) {
  if (loading) return /* @__PURE__ */ jsx3("div", { className: "text-center text-slate-400 py-8", children: "Loading\u2026" });
  if (loadError) return /* @__PURE__ */ jsxs3("div", { className: "text-center text-red-700 py-8 bg-red-50 border border-red-200 rounded", children: [
    /* @__PURE__ */ jsx3("div", { className: "font-semibold", children: "Equipment inventory could not be verified." }),
    /* @__PURE__ */ jsx3("div", { className: "text-xs mt-1", children: loadError })
  ] });
  if (rows.length === 0) return /* @__PURE__ */ jsx3("div", { className: "text-center py-8 text-slate-400 text-sm italic border rounded bg-slate-50", children: "No items in this category." });
  return /* @__PURE__ */ jsx3("div", { className: "space-y-3", children: rows.map((row) => /* @__PURE__ */ jsxs3(Card, { className: "hover:shadow-sm", children: [
    /* @__PURE__ */ jsxs3(CardHeader, { className: "py-3 px-4 flex flex-row items-start justify-between", children: [
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsxs3(CardTitle, { className: "text-sm flex items-center gap-2", children: [
          row.name,
          /* @__PURE__ */ jsx3(Badge, { variant: "outline", className: "text-[10px] font-normal", children: row._source === "channel_letter_equipment" ? "Channel Letter Equip." : "Foundation" }),
          isBoomList && row.ownership === "owned" && row.is_primary_owned && /* @__PURE__ */ jsxs3(Badge, { className: "text-[10px] font-medium bg-amber-100 text-amber-800 border-amber-200 gap-1", children: [
            /* @__PURE__ */ jsx3(Star, { className: "w-3 h-3 fill-amber-500 text-amber-500" }),
            " Primary"
          ] })
        ] }),
        /* @__PURE__ */ jsx3("div", { className: "flex gap-4 text-xs text-slate-600 mt-1", children: row.ownership === "owned" ? /* @__PURE__ */ jsx3("span", { className: "text-emerald-700 font-medium", children: "Owned \u2014 no rental cost" }) : /* @__PURE__ */ jsxs3(Fragment2, { children: [
          /* @__PURE__ */ jsxs3("span", { children: [
            "Day: ",
            /* @__PURE__ */ jsx3("strong", { children: Number.isFinite(parseFloat(row.cost_per_day)) ? `$${row.cost_per_day}` : row.cost_per_day ?? "Not priced" })
          ] }),
          /* @__PURE__ */ jsxs3("span", { children: [
            "Wk: ",
            /* @__PURE__ */ jsx3("strong", { children: Number.isFinite(parseFloat(row.cost_per_week)) ? `$${row.cost_per_week}` : row.cost_per_week ?? "Not priced" })
          ] }),
          /* @__PURE__ */ jsxs3("span", { children: [
            "Mo: ",
            /* @__PURE__ */ jsx3("strong", { children: Number.isFinite(parseFloat(row.cost_per_month)) ? `$${row.cost_per_month}` : row.cost_per_month ?? "Not priced" })
          ] })
        ] }) })
      ] }),
      isAdmin && /* @__PURE__ */ jsxs3("div", { className: "flex gap-1", children: [
        isBoomList && row.ownership === "owned" && /* @__PURE__ */ jsx3(
          Button,
          {
            size: "icon",
            variant: "ghost",
            onClick: () => onSetPrimary?.(row, !row.is_primary_owned),
            className: `h-7 w-7 ${row.is_primary_owned ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`,
            title: row.is_primary_owned ? "Primary owned lift \u2014 the suggester's go-to pick. Click to unset." : "Set as Primary owned lift (suggester's go-to pick)",
            children: /* @__PURE__ */ jsx3(Star, { className: `w-4 h-4 ${row.is_primary_owned ? "fill-amber-500" : ""}` })
          }
        ),
        /* @__PURE__ */ jsx3(Button, { size: "icon", variant: "ghost", onClick: () => onEdit(row), className: "h-7 w-7", children: /* @__PURE__ */ jsx3(Edit, { className: "w-3.5 h-3.5" }) }),
        /* @__PURE__ */ jsx3(Button, { size: "icon", variant: "ghost", onClick: () => onDelete(row), className: "h-7 w-7 text-red-500", children: /* @__PURE__ */ jsx3(Trash2, { className: "w-3.5 h-3.5" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxs3(CardContent, { className: "px-4 pb-3 pt-0 space-y-2", children: [
      !isAttachment && !isSubAttachment && /* @__PURE__ */ jsxs3("div", { className: "flex flex-wrap gap-4 pt-1 border-t mt-1", children: [
        /* @__PURE__ */ jsx3(ToggleRow, { label: "Channel & Dimensional", checked: row.show_in_channel_letters, onChange: (v) => onToggle(row, "show_in_channel_letters", v), disabled: !isAdmin }),
        /* @__PURE__ */ jsx3(ToggleRow, { label: "Concrete | Masonry", checked: row.show_in_foundation, onChange: (v) => onToggle(row, "show_in_foundation", v), disabled: !isAdmin }),
        /* @__PURE__ */ jsx3(ToggleRow, { label: "Sign Maintenance", checked: row.show_in_sign_maintenance, onChange: (v) => onToggle(row, "show_in_sign_maintenance", v), disabled: !isAdmin })
      ] }),
      !isAttachment && !isSubAttachment && row._source === "foundation_equipment" && /* @__PURE__ */ jsxs3("div", { className: "text-xs text-slate-500 pt-1", children: [
        /* @__PURE__ */ jsx3("strong", { children: "Linked Attachments:" }),
        " ",
        row.raw.compatible_attachment_ids?.length ? attachments.filter((a) => row.raw.compatible_attachment_ids.includes(a.id)).map((a) => a.material_name).join(", ") : "None"
      ] }),
      isAttachment && /* @__PURE__ */ jsxs3("div", { className: "text-xs text-slate-500 space-y-1 pt-1", children: [
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3("strong", { children: "Compatible Equipment:" }),
          " ",
          equipment.filter((e) => e.compatible_attachment_ids?.includes(row.id)).map((e) => e.material_name).join(", ") || "None"
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3("strong", { children: "Linked Sub-Attachments:" }),
          " ",
          row.raw.compatible_sub_attachment_ids?.length ? subAttachments.filter((s) => row.raw.compatible_sub_attachment_ids.includes(s.id)).map((s) => s.material_name).join(", ") : "None"
        ] })
      ] }),
      isSubAttachment && /* @__PURE__ */ jsxs3("div", { className: "text-xs text-slate-500 pt-1", children: [
        /* @__PURE__ */ jsx3("strong", { children: "Compatible Attachments:" }),
        " ",
        attachments.filter((a) => a.compatible_sub_attachment_ids?.includes(row.id)).map((a) => a.material_name).join(", ") || "None"
      ] })
    ] })
  ] }, `${row._source}-${row.id}`)) });
}
function ToggleRow({ label, checked, onChange, disabled }) {
  return /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2", children: [
    /* @__PURE__ */ jsx3(Switch, { checked: !!checked, onCheckedChange: onChange, disabled }),
    /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: label })
  ] });
}
function EquipmentForm({ normalized, ownership, allFoundationEquipment, allFoundationAttachments, allFoundationSubAttachments, allChannelEquipment, onCancel, onSaved }) {
  const isNew = !!normalized._new;
  const source = normalized._source;
  const kind = normalized.kind;
  const initial = useMemo(() => {
    if (source === "channel_letter_equipment") {
      const r2 = normalized.raw || {};
      return {
        // channel letter equipment fields
        equipment_name: r2.equipment_name || "",
        equipment_type: r2.equipment_type || "boom_lift",
        pricing_mode: r2.pricing_mode || "per_day",
        ownership: r2.ownership || ownership,
        cost_per_day: r2.cost_per_day ?? null,
        cost_per_week: r2.cost_per_week ?? null,
        cost_per_month: r2.cost_per_month ?? null,
        cost_flat: r2.cost_flat ?? null,
        delivery_pickup_cost: r2.delivery_pickup_cost ?? null,
        max_height_feet: r2.max_height_feet ?? null,
        vertical_reach_safety_margin_feet: r2.vertical_reach_safety_margin_feet ?? 2,
        is_default_for_height: !!r2.is_default_for_height,
        default_height_min_feet: r2.default_height_min_feet ?? null,
        default_height_max_feet: r2.default_height_max_feet ?? null,
        is_primary_owned: !!r2.is_primary_owned,
        mpg: r2.mpg ?? null,
        fuel_type: r2.fuel_type || "na",
        idle_running_cost_per_hour: r2.idle_running_cost_per_hour ?? null,
        rental_company: r2.rental_company || "",
        notes: r2.notes || "",
        show_in_channel_letters: r2.show_in_channel_letters ?? true,
        show_in_foundation: r2.show_in_foundation ?? false,
        show_in_sign_maintenance: r2.show_in_sign_maintenance ?? false
      };
    }
    const r = normalized.raw || {};
    return {
      material_name: r.material_name || "",
      material_type: r.material_type || (kind === "attachment" ? "attachment" : kind === "sub_attachment" ? "sub_attachment" : "excavation_equipment"),
      equipment_type: r.equipment_type || "",
      supports_attachments: r.supports_attachments ?? true,
      ownership: r.ownership || ownership,
      cost_per_day: r.cost_per_day ?? null,
      cost_per_week: r.cost_per_week ?? null,
      cost_per_month: r.cost_per_month ?? null,
      pickup_delivery_cost: r.pickup_delivery_cost ?? null,
      rental_company: r.rental_company || "",
      mpg: r.mpg ?? null,
      fuel_type: r.fuel_type || "na",
      idle_running_cost_per_hour: r.idle_running_cost_per_hour ?? null,
      compatible_attachment_ids: r.compatible_attachment_ids || [],
      compatible_sub_attachment_ids: r.compatible_sub_attachment_ids || [],
      allow_multiple: !!r.allow_multiple,
      is_pillar_excavation: !!r.is_pillar_excavation,
      is_spread_foot_excavation: !!r.is_spread_foot_excavation,
      is_non_excavation_equipment: !!r.is_non_excavation_equipment,
      is_miscellaneous_attachment: !!r.is_miscellaneous_attachment,
      notes: r.notes || "",
      show_in_channel_letters: r.show_in_channel_letters ?? false,
      show_in_foundation: r.show_in_foundation ?? true,
      show_in_sign_maintenance: r.show_in_sign_maintenance ?? false
    };
  }, [normalized, source, kind, ownership]);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const saveRef = useRef(false);
  const [linkedEquipmentIds, setLinkedEquipmentIds] = useState(
    kind === "attachment" ? allFoundationEquipment.filter((e) => e.compatible_attachment_ids?.includes(normalized.id)).map((e) => e.id) : []
  );
  const [linkedAttachmentIdsForSub, setLinkedAttachmentIdsForSub] = useState(
    kind === "sub_attachment" ? allFoundationAttachments.filter((a) => a.compatible_sub_attachment_ids?.includes(normalized.id)).map((a) => a.id) : []
  );
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const nameField = source === "channel_letter_equipment" ? "equipment_name" : "material_name";
  const isValid = !!form[nameField];
  const handleSave = async () => {
    if (saveRef.current) return;
    saveRef.current = true;
    setSaving(true);
    let wroteAnything = false;
    try {
      let savedId = normalized.id;
      const cleanForOwnership2 = (p) => {
        if ((p.ownership || ownership) === "owned") {
          p.rental_company = "";
          if ("pricing_mode" in p) p.pricing_mode = "owned_flat";
        } else if ("pricing_mode" in p) {
          if (!/^per_(day|week|month)$/.test(p.pricing_mode || "")) p.pricing_mode = "per_day";
        }
        return p;
      };
      const sameIds = (a = [], b = []) => {
        const left = [...a].map(String).sort();
        const right = [...b].map(String).sort();
        return left.length === right.length && left.every((value, index) => value === right[index]);
      };
      const assertFreshRow = (loaded, live, label) => {
        if (!live) throw new Error(`${label} no longer exists. Reload Equipment before saving.`);
        if (loaded?.updated_date && live.updated_date && loaded.updated_date !== live.updated_date) {
          throw new Error(`${label} changed in another session. Reload Equipment, review the latest record, and apply your changes again.`);
        }
      };
      const payload = cleanForOwnership2({ ...form });
      const targetEntity = source === "channel_letter_equipment" ? ChannelLetterInstallEquipmentEntity : FoundationInventoryEntity;
      let verifiedTarget = null;
      if (!isNew) {
        verifiedTarget = await targetEntity.get(normalized.id);
        assertFreshRow(normalized.raw, verifiedTarget, normalized.name || "This equipment item");
      }
      let liveChannelRows = [];
      let primaryExpectedVersions = null;
      let equipmentRelationshipRows = [];
      let attachmentRelationshipRows = [];
      if (source === "channel_letter_equipment" && payload.is_primary_owned) {
        liveChannelRows = await loadAllEntityRows({ entity: ChannelLetterInstallEquipmentEntity, sort: "sort_order", label: "Channel Letter equipment inventory" });
        primaryExpectedVersions = Object.fromEntries(liveChannelRows.map((row) => [row.id, row.updated_date || ""]));
        const loadedById = new Map((allChannelEquipment || []).map((row) => [row.id, row]));
        const primaryConflicts = liveChannelRows.filter((live) => {
          if (live.id === normalized.id) return false;
          const loaded = loadedById.get(live.id);
          if (!loaded) return !!live.is_primary_owned;
          return !!live.is_primary_owned !== !!loaded.is_primary_owned;
        });
        if (primaryConflicts.length) {
          throw new Error("The Primary owned lift selection changed in another session. Reload Equipment before saving this boom lift.");
        }
      }
      if (source === "foundation_equipment" && payload.material_type === "attachment") {
        const rowsToChange = (allFoundationEquipment || []).filter((eq2) => {
          const selected = linkedEquipmentIds.includes(eq2.id);
          const has = !isNew && (eq2.compatible_attachment_ids || []).includes(normalized.id);
          return isNew ? selected : selected !== has;
        });
        equipmentRelationshipRows = await Promise.all(rowsToChange.map(async (loaded) => {
          const live = await FoundationInventoryEntity.get(loaded.id);
          if (!live || !sameIds(loaded.compatible_attachment_ids || [], live.compatible_attachment_ids || [])) {
            throw new Error(`Compatibility links for ${loaded.material_name || "equipment"} changed in another session. Reload Equipment before saving.`);
          }
          return { loaded, live };
        }));
      } else if (source === "foundation_equipment" && payload.material_type === "sub_attachment") {
        const rowsToChange = (allFoundationAttachments || []).filter((att) => {
          const selected = linkedAttachmentIdsForSub.includes(att.id);
          const has = !isNew && (att.compatible_sub_attachment_ids || []).includes(normalized.id);
          return isNew ? selected : selected !== has;
        });
        attachmentRelationshipRows = await Promise.all(rowsToChange.map(async (loaded) => {
          const live = await FoundationInventoryEntity.get(loaded.id);
          if (!live || !sameIds(loaded.compatible_sub_attachment_ids || [], live.compatible_sub_attachment_ids || [])) {
            throw new Error(`Sub-attachment links for ${loaded.material_name || "attachment"} changed in another session. Reload Equipment before saving.`);
          }
          return { loaded, live };
        }));
      }
      if (source === "channel_letter_equipment") {
        let savedTarget;
        if (isNew) {
          const createResult = await createInventoryRecordWithRecovery({
            entity: ChannelLetterInstallEquipmentEntity,
            data: payload,
            nameField: "equipment_name",
            label: "Channel Letter equipment"
          });
          savedTarget = createResult.record;
          wroteAnything = true;
          savedId = savedTarget.id;
        } else {
          savedTarget = await replaceEntityFieldsIfUnchanged({
            entity: ChannelLetterInstallEquipmentEntity,
            id: normalized.id,
            expectedUpdatedAt: verifiedTarget?.updated_date || "",
            expectedFields: expectedEntityFields(verifiedTarget || normalized.raw || {}, payload),
            nextFields: payload,
            label: "Channel Letter equipment save"
          });
          wroteAnything = true;
        }
        if (payload.is_primary_owned) {
          await setExclusiveBooleanSafely({
            entity: ChannelLetterInstallEquipmentEntity,
            targetId: savedId,
            field: "is_primary_owned",
            next: true,
            expectedTargetUpdatedAt: savedTarget?.updated_date || "",
            expectedRowVersions: primaryExpectedVersions,
            readRows: () => loadAllEntityRows({ entity: ChannelLetterInstallEquipmentEntity, sort: "sort_order", label: "Channel Letter equipment inventory" }),
            label: "Primary owned lift selection"
          });
          wroteAnything = true;
        }
      } else {
        if (isNew) {
          const createResult = await createInventoryRecordWithRecovery({
            entity: FoundationInventoryEntity,
            data: payload,
            nameField: "material_name",
            label: "Foundation equipment"
          });
          wroteAnything = true;
          savedId = createResult.record.id;
        } else {
          await replaceEntityFieldsIfUnchanged({
            entity: FoundationInventoryEntity,
            id: normalized.id,
            expectedUpdatedAt: verifiedTarget?.updated_date || "",
            expectedFields: expectedEntityFields(verifiedTarget || normalized.raw || {}, payload),
            nextFields: payload,
            label: "Foundation equipment save"
          });
          wroteAnything = true;
        }
        const relationshipTotal = equipmentRelationshipRows.length + attachmentRelationshipRows.length;
        let relationshipConfirmed = 0;
        for (const { live } of equipmentRelationshipRows) {
          const selected = linkedEquipmentIds.includes(live.id);
          const arr = live.compatible_attachment_ids || [];
          const next = selected ? [...arr.filter((id) => id !== savedId), savedId] : arr.filter((id) => id !== savedId);
          try {
            await replaceRelationshipIdsIfUnchanged({
              entity: FoundationInventoryEntity,
              row: live,
              field: "compatible_attachment_ids",
              nextIds: next,
              label: `Equipment compatibility for ${live.material_name || "equipment"}`
            });
            relationshipConfirmed += 1;
            wroteAnything = true;
          } catch (error) {
            throw new Error(`Equipment compatibility updates stopped after ${relationshipConfirmed} of ${relationshipTotal} relationship changes were confirmed. Reload before retrying; remaining links were not skipped automatically. ${error?.message || ""}`.trim());
          }
        }
        for (const { live } of attachmentRelationshipRows) {
          const selected = linkedAttachmentIdsForSub.includes(live.id);
          const arr = live.compatible_sub_attachment_ids || [];
          const next = selected ? [...arr.filter((id) => id !== savedId), savedId] : arr.filter((id) => id !== savedId);
          try {
            await replaceRelationshipIdsIfUnchanged({
              entity: FoundationInventoryEntity,
              row: live,
              field: "compatible_sub_attachment_ids",
              nextIds: next,
              label: `Sub-attachment compatibility for ${live.material_name || "attachment"}`
            });
            relationshipConfirmed += 1;
            wroteAnything = true;
          } catch (error) {
            throw new Error(`Equipment compatibility updates stopped after ${relationshipConfirmed} of ${relationshipTotal} relationship changes were confirmed. Reload before retrying; remaining links were not skipped automatically. ${error?.message || ""}`.trim());
          }
        }
        for (const { live } of equipmentRelationshipRows) {
          const current = await FoundationInventoryEntity.get(live.id);
          const shouldContain = linkedEquipmentIds.includes(live.id);
          const contains = !!current?.compatible_attachment_ids?.includes(savedId);
          if (!current || contains !== shouldContain) {
            throw new Error(`Final verification failed for compatibility links on ${live.material_name || "equipment"}. Reload Equipment before retrying.`);
          }
        }
        for (const { live } of attachmentRelationshipRows) {
          const current = await FoundationInventoryEntity.get(live.id);
          const shouldContain = linkedAttachmentIdsForSub.includes(live.id);
          const contains = !!current?.compatible_sub_attachment_ids?.includes(savedId);
          if (!current || contains !== shouldContain) {
            throw new Error(`Final verification failed for sub-attachment links on ${live.material_name || "attachment"}. Reload Equipment before retrying.`);
          }
        }
      }
      onSaved?.();
    } catch (error) {
      console.error("Equipment save failed:", error);
      alert(error?.message || "Equipment could not be saved.");
      if (wroteAnything) onSaved?.();
    } finally {
      saveRef.current = false;
      setSaving(false);
    }
  };
  const currentOwnership = form.ownership || ownership;
  const isRented = currentOwnership === "rented";
  const isOwned = currentOwnership === "owned";
  const EQUIPMENT_TYPES = [
    "ladder",
    "scissor_lift",
    "boom_lift",
    "boom_truck",
    "scaffold",
    "truck",
    "car",
    "van",
    "flatbed",
    "hand_tool",
    "power_tool",
    "safety",
    "other"
  ];
  const titleCase = (s) => String(s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const FUEL_TYPES = /* @__PURE__ */ new Set([
    "scissor_lift",
    "boom_lift",
    "boom_truck",
    "truck",
    "car",
    "van",
    "flatbed"
  ]);
  const equipmentType = source === "channel_letter_equipment" ? form.equipment_type : form.equipment_type;
  const hasFuel = FUEL_TYPES.has(equipmentType);
  const supportsAttachments = source === "foundation_equipment";
  const switchSupportsAttachments = (yes) => {
    const next = yes ? "foundation_equipment" : "channel_letter_equipment";
    if (next === source) return;
    normalized._source = next;
    const carry = {
      ownership: form.ownership || ownership,
      cost_per_day: form.cost_per_day ?? null,
      cost_per_week: form.cost_per_week ?? null,
      cost_per_month: form.cost_per_month ?? null,
      notes: form.notes || "",
      mpg: form.mpg ?? null,
      fuel_type: form.fuel_type || "na",
      idle_running_cost_per_hour: form.idle_running_cost_per_hour ?? null,
      show_in_channel_letters: form.show_in_channel_letters,
      show_in_foundation: form.show_in_foundation,
      show_in_sign_maintenance: form.show_in_sign_maintenance
    };
    const name = form[nameField] || "";
    setForm(
      next === "channel_letter_equipment" ? {
        equipment_name: name,
        equipment_type: equipmentType || "boom_lift",
        pricing_mode: "per_day",
        cost_flat: null,
        delivery_pickup_cost: form.pickup_delivery_cost ?? null,
        max_height_feet: null,
        rental_company: "",
        ...carry
      } : {
        material_name: name,
        material_type: "excavation_equipment",
        equipment_type: equipmentType || "boom_lift",
        supports_attachments: true,
        pickup_delivery_cost: form.delivery_pickup_cost ?? null,
        compatible_attachment_ids: [],
        compatible_sub_attachment_ids: [],
        allow_multiple: false,
        is_pillar_excavation: false,
        is_spread_foot_excavation: false,
        is_non_excavation_equipment: false,
        is_miscellaneous_attachment: false,
        ...carry
      }
    );
  };
  return /* @__PURE__ */ jsxs3("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxs3("div", { children: [
      /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Name *" }),
      /* @__PURE__ */ jsx3(Input, { className: "h-8", value: form[nameField] || "", onChange: (e) => set(nameField, e.target.value) })
    ] }),
    /* @__PURE__ */ jsxs3("div", { children: [
      /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Ownership" }),
      /* @__PURE__ */ jsxs3(Select, { value: currentOwnership, onValueChange: (v) => set("ownership", v), children: [
        /* @__PURE__ */ jsx3(SelectTrigger, { className: "h-8", children: /* @__PURE__ */ jsx3(SelectValue, {}) }),
        /* @__PURE__ */ jsxs3(SelectContent, { children: [
          /* @__PURE__ */ jsx3(SelectItem, { value: "rented", children: "Rented" }),
          /* @__PURE__ */ jsx3(SelectItem, { value: "owned", children: "Owned" })
        ] })
      ] })
    ] }),
    isNew && kind === "equipment" && /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between rounded-md border p-2.5 bg-slate-50", children: [
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx3(Label, { className: "text-xs font-semibold", children: "Supports Attachments?" }),
        /* @__PURE__ */ jsx3("p", { className: "text-[11px] text-slate-500", children: "Turn on for equipment that uses attachments / sub-attachments (e.g. excavators, augers)." })
      ] }),
      /* @__PURE__ */ jsx3(Switch, { checked: supportsAttachments, onCheckedChange: switchSupportsAttachments })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-2 gap-3", children: [
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Equipment Type" }),
        /* @__PURE__ */ jsxs3(
          Select,
          {
            value: equipmentType || "",
            onValueChange: (v) => set("equipment_type", v),
            children: [
              /* @__PURE__ */ jsx3(SelectTrigger, { className: "h-8", children: /* @__PURE__ */ jsx3(SelectValue, { placeholder: "Select type" }) }),
              /* @__PURE__ */ jsx3(SelectContent, { children: EQUIPMENT_TYPES.map((t) => /* @__PURE__ */ jsx3(SelectItem, { value: t, children: titleCase(t) }, t)) })
            ]
          }
        )
      ] }),
      source === "channel_letter_equipment" && /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Max Height (ft)" }),
        /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.max_height_feet ?? "", onChange: (e) => set("max_height_feet", inventoryNumberInput(e.target.value)) })
      ] })
    ] }),
    source === "channel_letter_equipment" && ["boom_lift", "boom_truck"].includes(equipmentType) && /* @__PURE__ */ jsxs3("div", { className: "rounded-lg border bg-sky-50/60 border-sky-200 p-3 space-y-3", children: [
      /* @__PURE__ */ jsx3("p", { className: "text-xs font-semibold text-sky-900", children: "Boom Reach & Auto-Select" }),
      /* @__PURE__ */ jsx3("div", { className: "grid grid-cols-2 gap-3", children: /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Safety Margin (ft)" }),
        /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.vertical_reach_safety_margin_feet ?? 2, onChange: (e) => set("vertical_reach_safety_margin_feet", inventoryNumberInput(e.target.value)) })
      ] }) }),
      isOwned && /* @__PURE__ */ jsx3(
        Toggle,
        {
          label: "Primary owned lift (suggester's go-to pick)",
          checked: form.is_primary_owned,
          onChange: (v) => set("is_primary_owned", v)
        }
      ),
      /* @__PURE__ */ jsx3(
        Toggle,
        {
          label: "Default for a height range",
          checked: form.is_default_for_height,
          onChange: (v) => set("is_default_for_height", v)
        }
      ),
      form.is_default_for_height && /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-2 gap-3 pl-1", children: [
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Min Height (ft)" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.default_height_min_feet ?? "", onChange: (e) => set("default_height_min_feet", inventoryNumberInput(e.target.value)) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Max Height (ft)" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.default_height_max_feet ?? "", onChange: (e) => set("default_height_max_feet", inventoryNumberInput(e.target.value)) })
        ] })
      ] })
    ] }),
    isRented && /* @__PURE__ */ jsxs3("div", { className: "rounded-lg border bg-slate-50 p-3 space-y-3", children: [
      /* @__PURE__ */ jsx3("p", { className: "text-xs font-semibold text-slate-700", children: "Rental Pricing (per day / week / month)" }),
      /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-3 gap-3", children: [
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Cost/Day" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.cost_per_day ?? "", onChange: (e) => set("cost_per_day", inventoryNumberInput(e.target.value)) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Cost/Week" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.cost_per_week ?? "", onChange: (e) => set("cost_per_week", inventoryNumberInput(e.target.value)) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Cost/Month" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.cost_per_month ?? "", onChange: (e) => set("cost_per_month", inventoryNumberInput(e.target.value)) })
        ] })
      ] }),
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Rental Company" }),
        /* @__PURE__ */ jsx3(
          Input,
          {
            className: "h-8",
            value: source === "channel_letter_equipment" ? form.rental_company || "" : form.rental_company || "",
            onChange: (e) => set("rental_company", e.target.value)
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("div", { children: [
      /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Delivery / Pickup ($)" }),
      /* @__PURE__ */ jsx3(
        Input,
        {
          type: "number",
          className: "h-8",
          value: source === "channel_letter_equipment" ? form.delivery_pickup_cost ?? "" : form.pickup_delivery_cost ?? "",
          onChange: (e) => {
            const v = inventoryNumberInput(e.target.value);
            if (source === "channel_letter_equipment") set("delivery_pickup_cost", v);
            else set("pickup_delivery_cost", v);
          }
        }
      )
    ] }),
    hasFuel && /* @__PURE__ */ jsxs3("div", { className: "rounded-lg border bg-amber-50/60 border-amber-200 p-3 space-y-3", children: [
      /* @__PURE__ */ jsx3("p", { className: "text-xs font-semibold text-amber-900", children: "Fuel Costs" }),
      /* @__PURE__ */ jsx3("p", { className: "text-[11px] text-amber-800", children: "Driving fuel cost uses MPG \xD7 route miles \xD7 $/gal. Idle cost charges per hour the unit is running on-site (e.g. boom holding position)." }),
      /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-3 gap-3", children: [
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "MPG (driving)" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.mpg ?? "", onChange: (e) => set("mpg", inventoryNumberInput(e.target.value)) })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Fuel Type" }),
          /* @__PURE__ */ jsxs3(Select, { value: form.fuel_type || "na", onValueChange: (v) => set("fuel_type", v), children: [
            /* @__PURE__ */ jsx3(SelectTrigger, { className: "h-8", children: /* @__PURE__ */ jsx3(SelectValue, {}) }),
            /* @__PURE__ */ jsxs3(SelectContent, { children: [
              /* @__PURE__ */ jsx3(SelectItem, { value: "na", children: "N/A" }),
              /* @__PURE__ */ jsx3(SelectItem, { value: "gasoline", children: "Gasoline" }),
              /* @__PURE__ */ jsx3(SelectItem, { value: "diesel", children: "Diesel" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { children: [
          /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Idle Cost ($/hr)" }),
          /* @__PURE__ */ jsx3(Input, { type: "number", className: "h-8", value: form.idle_running_cost_per_hour ?? "", onChange: (e) => set("idle_running_cost_per_hour", inventoryNumberInput(e.target.value)) })
        ] })
      ] })
    ] }),
    source === "foundation_equipment" && /* @__PURE__ */ jsxs3(Fragment2, { children: [
      kind === "equipment" && /* @__PURE__ */ jsxs3(Fragment2, { children: [
        /* @__PURE__ */ jsxs3("div", { className: "space-y-2 pt-1", children: [
          /* @__PURE__ */ jsx3(Toggle, { label: "Used for Pillar Excavation", checked: form.is_pillar_excavation, onChange: (v) => set("is_pillar_excavation", v) }),
          /* @__PURE__ */ jsx3(Toggle, { label: "Used for Spread Foot Excavation", checked: form.is_spread_foot_excavation, onChange: (v) => set("is_spread_foot_excavation", v) }),
          /* @__PURE__ */ jsx3(Toggle, { label: "Is Non-Excavation Equipment", checked: form.is_non_excavation_equipment, onChange: (v) => set("is_non_excavation_equipment", v) })
        ] }),
        /* @__PURE__ */ jsx3(MultiSelectDropdown, { label: "Compatible Attachments", options: allFoundationAttachments, selectedIds: form.compatible_attachment_ids || [], onChange: (v) => set("compatible_attachment_ids", v) })
      ] }),
      kind === "attachment" && /* @__PURE__ */ jsxs3(Fragment2, { children: [
        /* @__PURE__ */ jsxs3("div", { className: "space-y-2 pt-1", children: [
          /* @__PURE__ */ jsx3(Toggle, { label: "Is Miscellaneous Attachment", checked: form.is_miscellaneous_attachment, onChange: (v) => set("is_miscellaneous_attachment", v) }),
          /* @__PURE__ */ jsx3(Toggle, { label: "Allow user to select multiple instances", checked: form.allow_multiple, onChange: (v) => set("allow_multiple", v) })
        ] }),
        /* @__PURE__ */ jsx3(MultiSelectDropdown, { label: "Belongs to Equipment (reverse link)", options: allFoundationEquipment, selectedIds: linkedEquipmentIds, onChange: setLinkedEquipmentIds }),
        /* @__PURE__ */ jsx3(MultiSelectDropdown, { label: "Compatible Sub-Attachments", options: allFoundationSubAttachments, selectedIds: form.compatible_sub_attachment_ids || [], onChange: (v) => set("compatible_sub_attachment_ids", v) })
      ] }),
      kind === "sub_attachment" && /* @__PURE__ */ jsxs3(Fragment2, { children: [
        /* @__PURE__ */ jsx3(Toggle, { label: "Allow user to select multiple instances", checked: form.allow_multiple, onChange: (v) => set("allow_multiple", v) }),
        /* @__PURE__ */ jsx3(MultiSelectDropdown, { label: "Belongs to Attachments (reverse link)", options: allFoundationAttachments, selectedIds: linkedAttachmentIdsForSub, onChange: setLinkedAttachmentIdsForSub })
      ] })
    ] }),
    kind === "equipment" && /* @__PURE__ */ jsxs3("div", { className: "rounded-lg border bg-slate-50 p-3 space-y-2", children: [
      /* @__PURE__ */ jsx3("p", { className: "text-xs font-semibold text-slate-700", children: "Show in which estimator(s)?" }),
      /* @__PURE__ */ jsx3(Toggle, { label: "Channel & Dimensional Letters", checked: form.show_in_channel_letters, onChange: (v) => set("show_in_channel_letters", v) }),
      /* @__PURE__ */ jsx3(Toggle, { label: "Concrete | Masonry | Poles", checked: form.show_in_foundation, onChange: (v) => set("show_in_foundation", v) }),
      /* @__PURE__ */ jsx3(Toggle, { label: "Sign Maintenance", checked: form.show_in_sign_maintenance, onChange: (v) => set("show_in_sign_maintenance", v) })
    ] }),
    /* @__PURE__ */ jsxs3("div", { children: [
      /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: "Notes" }),
      /* @__PURE__ */ jsx3(Input, { className: "h-8", value: form.notes || "", onChange: (e) => set("notes", e.target.value) })
    ] }),
    /* @__PURE__ */ jsxs3("div", { className: "flex justify-end gap-2 pt-2", children: [
      /* @__PURE__ */ jsx3(Button, { variant: "outline", size: "sm", onClick: onCancel, children: "Cancel" }),
      /* @__PURE__ */ jsx3(Button, { size: "sm", onClick: handleSave, disabled: !isValid || saving, children: saving ? "Saving\u2026" : "Save" })
    ] })
  ] });
}
function Toggle({ label, checked, onChange }) {
  return /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-2", children: [
    /* @__PURE__ */ jsx3(Switch, { checked: !!checked, onCheckedChange: onChange }),
    /* @__PURE__ */ jsx3(Label, { className: "text-xs", children: label })
  ] });
}

// testtree/stubs/reactRouterDom.jsx
var Link = ({ to, children, ...props }) => react_shim_default.createElement("a", { href: to, ...props }, children);

// testtree/src/components/masterInventory/foundationFieldSchema.js
var MATERIAL_TYPES = [
  { value: "concrete_service", label: "Ready-Mix Concrete" },
  { value: "bagged_concrete", label: "Bagged Concrete" },
  { value: "rebar", label: "Rebar" },
  // O-021 / CMP-B07: rebar supports (chairs / stands / bolsters) sit next to
  // rebar in every type picker — same reinforcement family, own catalog type.
  { value: "rebar_support", label: "Rebar Support" },
  { value: "forming_material", label: "Forming Material" },
  { value: "excavation_equipment", label: "Excavation Equipment" },
  { value: "pole", label: "Pole" },
  { value: "brick_stone", label: "Brick / Stone" },
  { value: "wall_material", label: "Wall Material" },
  { value: "wall_cap", label: "Wall Cap" },
  { value: "fill_material", label: "Fill Material" }
];
var typeLabel = (type) => MATERIAL_TYPES.find((t) => t.value === type)?.label || type;

// testtree/src/components/masterInventory/FoundationMaterialDialog.jsx
function FoundationMaterialDialog() {
  return null;
}

// testtree/src/pages/FoundationCatalog.jsx
import { Fragment as Fragment3, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function FoundationCatalog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState(() => new URLSearchParams(window.location.search).get("type") || "concrete_service");
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
  const writeParam = (key, value, defaultValue = "") => {
    try {
      const next = new URLSearchParams(window.location.search);
      if (value && value !== defaultValue) next.set(key, value);
      else next.delete(key);
      window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
    } catch {
    }
  };
  const [editing, setEditing] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const deleteRef = useRef(/* @__PURE__ */ new Set());
  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await loadAllEntityRows({ entity: staffEntities.FoundationInventory, sort: "-created_date", label: "Foundation Catalog inventory" });
      setRows(res || []);
    } catch (error) {
      console.error("Foundation catalog load failed:", error);
      setLoadError(error?.message || "Foundation Catalog could not be verified.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const q = search.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (r.material_type !== activeType) return false;
    if (!q) return true;
    return [r.material_name, r.material_description, r.supplier, r.unit].filter(Boolean).join(" ").toLowerCase().includes(q);
  });
  const ROW_PAGE = 60;
  const [visibleCount, setVisibleCount] = useState(ROW_PAGE);
  useEffect(() => {
    setVisibleCount(ROW_PAGE);
  }, [activeType, q]);
  const catalogSections = (() => {
    let budget = visibleCount;
    const out = [];
    for (const group of groupInventoryBySupplier(visible)) {
      if (budget <= 0) break;
      const groupRows = group.rows.slice(0, budget);
      budget -= groupRows.length;
      out.push({ ...group, rows: groupRows });
    }
    return out;
  })();
  const handleDelete = async (row) => {
    if (!row?.id || loadError || deleteRef.current.has(row.id)) return;
    deleteRef.current.add(row.id);
    if (!window.confirm(`Delete "${row.material_name || "this material"}"? This cannot be undone.`)) {
      deleteRef.current.delete(row.id);
      return;
    }
    try {
      const live = await staffEntities.FoundationInventory.get(row.id);
      if (row.updated_date && live?.updated_date && row.updated_date !== live.updated_date) {
        alert("This Foundation Catalog item changed in another session and was not deleted. The latest catalog will be reloaded first.");
        await load();
        return;
      }
      await deleteEntityIfUnchanged({
        entity: staffEntities.FoundationInventory,
        record: live,
        label: `Foundation Catalog item "${live.material_name || row.material_name || "Material"}"`
      });
      await load();
    } catch (error) {
      console.error("Foundation catalog delete failed:", error);
      alert(error?.message || "Foundation Catalog item could not be deleted.");
      await load();
    } finally {
      deleteRef.current.delete(row.id);
    }
  };
  return /* @__PURE__ */ jsxs4("div", { className: "clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50", children: [
    /* @__PURE__ */ jsxs4("div", { className: "max-w-5xl mx-auto p-4 sm:p-6", children: [
      /* @__PURE__ */ jsxs4("div", { className: "flex items-center justify-between gap-3 mb-4", children: [
        /* @__PURE__ */ jsxs4(Link, { to: "/Estimator", className: "flex items-center gap-1 text-sm text-gray-600 hover:text-red-600", children: [
          /* @__PURE__ */ jsx4(ArrowLeft, { className: "w-4 h-4", "aria-hidden": "true" }),
          " Estimator"
        ] }),
        /* @__PURE__ */ jsxs4("div", { className: "relative flex-1 max-w-xs", children: [
          /* @__PURE__ */ jsx4(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400", "aria-hidden": "true" }),
          /* @__PURE__ */ jsx4(
            Input,
            {
              placeholder: "Search name, description, supplier\u2026",
              "aria-label": "Search catalog materials",
              value: search,
              onChange: (e) => {
                const v = e.target.value;
                setSearch(v);
                writeParam("q", v);
              },
              className: "pl-9 h-9"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs4(
          Button,
          {
            disabled: !!loadError,
            onClick: () => {
              setEditing(null);
              setDialogOpen(true);
            },
            className: "bg-red-600 hover:bg-red-700 text-white disabled:opacity-50",
            children: [
              /* @__PURE__ */ jsx4(Plus, { className: "w-4 h-4", "aria-hidden": "true" }),
              " New Material"
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsx4("h1", { className: "text-2xl font-bold text-gray-900 mb-1", children: "Foundation Catalog" }),
      /* @__PURE__ */ jsx4("p", { className: "text-sm text-gray-500 mb-4", children: "Materials, poles, walls and equipment used by the Concrete | Masonry | Poles estimator." }),
      /* @__PURE__ */ jsx4(
        "div",
        {
          className: "flex gap-2 overflow-x-auto pb-2 mb-4",
          role: "tablist",
          "aria-label": "Material type filter",
          onKeyDown: (e) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
            const tabs = [...e.currentTarget.querySelectorAll('button[role="tab"]')];
            const i = tabs.indexOf(document.activeElement);
            if (i < 0) return;
            e.preventDefault();
            const next = e.key === "Home" ? tabs[0] : e.key === "End" ? tabs[tabs.length - 1] : tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
            next?.focus();
          },
          children: MATERIAL_TYPES.map((t) => /* @__PURE__ */ jsxs4(
            "button",
            {
              type: "button",
              role: "tab",
              "aria-selected": activeType === t.value,
              onClick: () => {
                const v = t.value;
                setActiveType(v);
                writeParam("type", v, "concrete_service");
              },
              className: `px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border ${activeType === t.value ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-600 border-gray-200 hover:border-red-300"}`,
              children: [
                t.label,
                " (",
                rows.filter((r) => r.material_type === t.value).length,
                ")"
              ]
            },
            t.value
          ))
        }
      ),
      loading ? /* @__PURE__ */ jsx4(ListSkeleton, { rows: 6 }) : loadError ? /* @__PURE__ */ jsxs4("div", { role: "alert", className: "py-8 text-center bg-red-50 rounded-xl border border-red-200 text-red-700", children: [
        /* @__PURE__ */ jsx4("div", { className: "font-semibold", children: "Foundation Catalog could not be verified." }),
        /* @__PURE__ */ jsx4("div", { className: "text-xs mt-1", children: loadError }),
        /* @__PURE__ */ jsx4(Button, { variant: "outline", size: "sm", className: "mt-3", onClick: load, children: "Retry" })
      ] }) : visible.length === 0 ? /* @__PURE__ */ jsxs4("div", { className: "py-12 text-center bg-white rounded-xl border border-dashed border-gray-300 text-gray-500", children: [
        "No ",
        typeLabel(activeType),
        " entries yet."
      ] }) : /* @__PURE__ */ jsxs4("div", { className: "space-y-4", children: [
        catalogSections.map((group) => /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx4("div", { className: "text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200 pb-1", children: group.label ? /* @__PURE__ */ jsxs4(Fragment3, { children: [
            "Supplier: ",
            /* @__PURE__ */ jsx4("span", { className: "text-slate-700 normal-case", children: group.label })
          ] }) : "No supplier recorded" }),
          group.rows.map((row) => /* @__PURE__ */ jsxs4(
            "div",
            {
              className: "bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between gap-3",
              children: [
                /* @__PURE__ */ jsxs4("div", { className: "min-w-0", children: [
                  /* @__PURE__ */ jsx4("div", { className: "font-medium text-gray-900 truncate", children: row.material_name }),
                  /* @__PURE__ */ jsx4("div", { className: "text-xs text-gray-500 truncate", children: row.material_description || row.supplier || "\u2014" })
                ] }),
                /* @__PURE__ */ jsxs4("div", { className: "flex items-center gap-3 flex-shrink-0", children: [
                  /* @__PURE__ */ jsxs4("div", { className: "text-sm font-semibold text-gray-800", children: [
                    "$",
                    Number(row.cost_per_unit || row.cost_per_day || row.pole_stock_price || 0).toFixed(2),
                    /* @__PURE__ */ jsx4("span", { className: "text-xs text-gray-400 font-normal", children: row.unit ? ` / ${row.unit}` : "" })
                  ] }),
                  /* @__PURE__ */ jsx4(
                    "button",
                    {
                      type: "button",
                      disabled: !!loadError,
                      onClick: () => {
                        setEditing(row);
                        setDialogOpen(true);
                      },
                      title: `Edit ${row.material_name || "material"}`,
                      "aria-label": `Edit ${row.material_name || "material"}`,
                      className: "min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-gray-400 hover:text-red-600",
                      children: /* @__PURE__ */ jsx4(Pencil, { className: "w-4 h-4", "aria-hidden": "true" })
                    }
                  ),
                  /* @__PURE__ */ jsx4("button", { type: "button", onClick: () => handleDelete(row), title: `Delete ${row.material_name || "material"}`, "aria-label": `Delete ${row.material_name || "material"}`, className: "min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-gray-400 hover:text-red-600", children: /* @__PURE__ */ jsx4(Trash2, { className: "w-4 h-4", "aria-hidden": "true" }) })
                ] })
              ]
            },
            row.id
          ))
        ] }, group.key ?? "__unassigned__")),
        visible.length > visibleCount && /* @__PURE__ */ jsxs4(
          "button",
          {
            type: "button",
            onClick: () => setVisibleCount((c) => c + ROW_PAGE),
            className: "w-full h-[30px] rounded-lg border border-gray-300 bg-white text-[11px] font-bold text-gray-600 hover:bg-gray-50",
            children: [
              "Show ",
              Math.min(ROW_PAGE, visible.length - visibleCount),
              " more (",
              visible.length - visibleCount,
              " remaining)"
            ]
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsx4(
      FoundationMaterialDialog,
      {
        open: dialogOpen,
        record: editing,
        defaultType: activeType,
        onClose: () => setDialogOpen(false),
        onSaved: () => {
          setDialogOpen(false);
          load();
        }
      }
    )
  ] });
}

// test-o008u-remaining.jsx
var HERE = path.dirname(fileURLToPath(import.meta.url));
var CAND = (p) => fs.readFileSync(path.join(HERE, "..", "candidates", p), "utf8");
var passed = 0;
var failures = [];
var ok = (name, cond, extra = "") => {
  if (cond) passed += 1;
  else failures.push(`${name}${extra ? ` \u2014 ${extra}` : ""}`);
};
var eq = (name, actual, expected) => ok(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
var section = (t) => console.log(`
=== ${t}`);
var slice = (src, startMarker, endMarker, label) => {
  const i = src.indexOf(startMarker);
  const j = i < 0 ? -1 : src.indexOf(endMarker, i + startMarker.length);
  if (i < 0 || j < 0) throw new Error(`extract failed: ${label}`);
  return src.slice(i, j + endMarker.length);
};
var fnFromDecl = (decl, params) => new Function(...params, `"use strict";
${decl}
  return ${decl.match(/(?:const|function)\s+([A-Za-z_$][\w$]*)/)[1]};`);
section("M1 boundary: inventoryNumberInput / inventoryNonnegativeNumber / supplier key+group");
{
  eq("numInput absent-blank", inventoryNumberInput(""), null);
  eq("numInput spaces", inventoryNumberInput("   "), null);
  eq("numInput '0'", inventoryNumberInput("0"), 0);
  eq("numInput 0", inventoryNumberInput(0), 0);
  eq("numInput '12.5'", inventoryNumberInput("12.5"), 12.5);
  eq("numInput '-3'", inventoryNumberInput("-3"), -3);
  eq("numInput 'abc' verbatim", inventoryNumberInput("abc"), "abc");
  eq("numInput '12abc' verbatim", inventoryNumberInput("12abc"), "12abc");
  eq("nonneg 0", inventoryNonnegativeNumber(0), 0);
  eq("nonneg '0'", inventoryNonnegativeNumber("0"), 0);
  eq("nonneg 155", inventoryNonnegativeNumber(155), 155);
  eq("nonneg absent", inventoryNonnegativeNumber(void 0), null);
  eq("nonneg blank", inventoryNonnegativeNumber(""), null);
  eq("nonneg '-3'", inventoryNonnegativeNumber("-3"), null);
  eq("nonneg 'abc'", inventoryNonnegativeNumber("abc"), null);
  eq("nonneg NaN", inventoryNonnegativeNumber(NaN), null);
  eq("key 'Citywide'", inventorySupplierKey("Citywide"), "citywide");
  eq("key ' citywide '", inventorySupplierKey(" citywide "), "citywide");
  eq("key 'CITY WIDE'", inventorySupplierKey("CITY WIDE"), "city_wide");
  eq("key 'Ernst-Ent.'", inventorySupplierKey("Ernst-Ent."), "ernst_ent_");
  eq("key ''", inventorySupplierKey(""), null);
  eq("key '   '", inventorySupplierKey("   "), null);
  eq("key null", inventorySupplierKey(null), null);
  eq("key number", inventorySupplierKey(42), null);
  const groups = groupInventoryBySupplier([
    { id: 1, supplier: "ZZZ" },
    { id: 2, supplier: "aaa" },
    { id: 3 },
    { id: 4, supplier: "AAA " },
    { id: 5, supplier: "" }
  ]);
  eq("group count", groups.length, 3);
  eq("first group key", groups[0].key, "aaa");
  eq("second group key", groups[1].key, "zzz");
  eq("unassigned last", groups[2].key, null);
  eq("first-seen label kept", groups[0].label, "aaa");
  eq("variant merge", groups[0].rows.map((r) => r.id).join(","), "2,4");
  eq("unassigned rows", groups[2].rows.map((r) => r.id).join(","), "3,5");
}
section("M2 MasterEquipmentTab: normalizeRow / openAdd / initial / swap / save coercions");
var MET = CAND("src/components/masterInventory/MasterEquipmentTab.jsx");
var normalizeRowSrc = MET.slice(
  MET.indexOf("function normalizeRow(row, source) {"),
  MET.indexOf("export default function MasterEquipmentTab")
).trimEnd();
var normalizeRow2 = new Function(`"use strict";
${normalizeRowSrc}
return normalizeRow;`)();
{
  const absent = normalizeRow2({ id: "e1", material_name: "Ex", material_type: "excavation_equipment" }, "foundation_equipment");
  eq("fnd absent day\u2192null", absent.cost_per_day, null);
  eq("fnd absent wk\u2192null", absent.cost_per_week, null);
  eq("fnd absent mo\u2192null", absent.cost_per_month, null);
  const zero = normalizeRow2({ id: "e2", cost_per_day: 0, cost_per_week: 0, cost_per_month: 0 }, "foundation_equipment");
  eq("fnd authored 0 day", zero.cost_per_day, 0);
  const chan = normalizeRow2({ id: "c1", equipment_name: "B", ownership: "rented" }, "channel_letter_equipment");
  eq("chn absent day\u2192null", chan.cost_per_day, null);
  const priced = normalizeRow2({ id: "e3", cost_per_day: 45, cost_per_week: "12.5" }, "foundation_equipment");
  eq("authored 45", priced.cost_per_day, 45);
  eq("authored '12.5' verbatim", priced.cost_per_week, "12.5");
}
var makeOpenAdd = fnFromDecl(
  slice(MET, "const openAdd = () => {", "\n  };", "openAdd"),
  ["activeKind", "ownership", "setEditItem", "setShowForm"]
);
var capture = (kind) => {
  let item = null;
  makeOpenAdd(kind, "rented", (v) => {
    item = v;
  }, () => {
  })();
  return item;
};
{
  const boom = capture("boom_lift");
  eq("openAdd boom chn source", boom._source, "channel_letter_equipment");
  eq("boom cost_per_day null", boom.raw.cost_per_day, null);
  eq("boom cost_per_week null", boom.raw.cost_per_week, null);
  eq("boom cost_per_month null", boom.raw.cost_per_month, null);
  eq("boom delivery_pickup null", boom.raw.delivery_pickup_cost, null);
  eq("boom non-numeric default kept", boom.raw.pricing_mode, "per_day");
  const fnd = capture("attachment");
  eq("openAdd fnd source", fnd._source, "foundation_equipment");
  eq("fnd material_type", fnd.raw.material_type, "attachment");
  eq("fnd cost_per_day null", fnd.raw.cost_per_day, null);
  eq("fnd pickup_delivery null", fnd.raw.pickup_delivery_cost, null);
  eq("fnd sort_order null", fnd.raw.sort_order, null);
  eq("fnd flags kept", fnd.raw.show_in_foundation, true);
}
var initialDecl = slice(MET, "const initial = useMemo(() => {", "}, [normalized, source, kind, ownership]);", "initial");
var buildInitial = (normalized, ownership = "rented") => new Function("useMemo", "normalized", "source", "kind", "ownership", `"use strict";
${initialDecl}
  return initial;`)(
  (fn) => fn(),
  normalized,
  normalized._source,
  normalized.kind,
  ownership
);
{
  const fndNew = buildInitial({ _new: true, kind: "equipment", _source: "foundation_equipment", raw: {} });
  for (const k of ["cost_per_day", "cost_per_week", "cost_per_month", "pickup_delivery_cost", "mpg", "idle_running_cost_per_hour"])
    eq(`fnd init ${k} absent\u2192null`, fndNew[k], null);
  const fndZero = buildInitial({ kind: "attachment", _source: "foundation_equipment", raw: { cost_per_day: 0, cost_per_week: 45, pickup_delivery_cost: "abc", mpg: 0, idle_running_cost_per_hour: 2.5 } });
  eq("fnd init authored 0", fndZero.cost_per_day, 0);
  eq("fnd init authored 45", fndZero.cost_per_week, 45);
  eq("fnd init 'abc' verbatim", fndZero.pickup_delivery_cost, "abc");
  eq("fnd init mpg 0", fndZero.mpg, 0);
  eq("fnd init idle 2.5", fndZero.idle_running_cost_per_hour, 2.5);
  const chnNew = buildInitial({ _new: true, kind: "equipment", _source: "channel_letter_equipment", raw: {} });
  for (const k of ["cost_per_day", "cost_per_week", "cost_per_month", "cost_flat", "delivery_pickup_cost", "max_height_feet", "default_height_min_feet", "default_height_max_feet", "mpg", "idle_running_cost_per_hour"])
    eq(`chn init ${k} absent\u2192null`, chnNew[k], null);
  eq("chn safety margin default kept", chnNew.vertical_reach_safety_margin_feet, 2);
  const chnZero = buildInitial({ kind: "equipment", _source: "channel_letter_equipment", raw: { cost_per_day: 0, cost_flat: 0, delivery_pickup_cost: 0, max_height_feet: 0, default_height_min_feet: 0, default_height_max_feet: 0, mpg: 0, idle_running_cost_per_hour: 0, vertical_reach_safety_margin_feet: 0 } });
  for (const k of ["cost_per_day", "cost_flat", "delivery_pickup_cost", "max_height_feet", "default_height_min_feet", "default_height_max_feet", "mpg", "idle_running_cost_per_hour", "vertical_reach_safety_margin_feet"])
    eq(`chn init authored 0 ${k}`, chnZero[k], 0);
}
var swapDecl = slice(MET, "const switchSupportsAttachments = (yes) => {", "\n  };", "switchSupportsAttachments");
var makeSwap = fnFromDecl(swapDecl, ["source", "normalized", "setForm", "form", "ownership", "equipmentType", "nameField"]);
var runSwap = ({ form, source, yes, nameField = "material_name", equipmentType = "boom_lift", ownership = "rented" }) => {
  const normalized = { _source: source };
  let nextForm = null;
  makeSwap(source, normalized, (v) => {
    nextForm = v;
  }, form, ownership, equipmentType, nameField)(yes);
  return nextForm;
};
{
  const toChn = runSwap({
    source: "foundation_equipment",
    yes: false,
    form: { material_name: "Ex", cost_per_day: 0, cost_per_week: null, cost_per_month: void 0, pickup_delivery_cost: 30, mpg: 0, idle_running_cost_per_hour: null, notes: "n", fuel_type: "diesel" }
  });
  eq("swap\u2192chn authored 0 kept", toChn.cost_per_day, 0);
  eq("swap\u2192chn null kept", toChn.cost_per_week, null);
  eq("swap\u2192chn absent\u2192null", toChn.cost_per_month, null);
  eq("swap\u2192chn pickup\u2192delivery map", toChn.delivery_pickup_cost, 30);
  eq("swap\u2192chn cost_flat null", toChn.cost_flat, null);
  eq("swap\u2192chn max_height null", toChn.max_height_feet, null);
  eq("swap\u2192chn mpg 0 kept", toChn.mpg, 0);
  eq("swap\u2192chn idle null", toChn.idle_running_cost_per_hour, null);
  const toFnd = runSwap({
    source: "channel_letter_equipment",
    yes: true,
    form: { equipment_name: "Boom", cost_per_day: 100, delivery_pickup_cost: 0, mpg: 8, idle_running_cost_per_hour: 1.5 }
  });
  eq("swap\u2192fnd delivery\u2192pickup map", toFnd.pickup_delivery_cost, 0);
  eq("swap\u2192fnd authored 100 kept", toFnd.cost_per_day, 100);
  eq("swap\u2192fnd mpg 8", toFnd.mpg, 8);
  const noCarry = runSwap({ source: "foundation_equipment", yes: false, form: {} });
  eq("swap empty form day null", noCarry.cost_per_day, null);
  eq("swap empty form mpg null", noCarry.mpg, null);
}
var cleanDecl = slice(MET, "const cleanForOwnership = (p) => {", "\n      };", "cleanForOwnership");
var cleanForOwnership = fnFromDecl(cleanDecl, ["ownership"]);
{
  const draftToField = (v) => inventoryNumberInput(v);
  const payload = (form, ownership = "rented") => cleanForOwnership(ownership)({ ...form });
  eq("save blank\u2192null persists", payload({ cost_per_day: draftToField("") }).cost_per_day, null);
  eq("save '0'\u21920 authored", payload({ cost_per_day: draftToField("0") }).cost_per_day, 0);
  eq("save '12.5'\u219212.5", payload({ cost_per_day: draftToField("12.5") }).cost_per_day, 12.5);
  eq("save 'abc' verbatim", payload({ cost_per_day: draftToField("abc") }).cost_per_day, "abc");
  eq("save untouched null stays null", payload({ cost_per_day: null }).cost_per_day, null);
  const owned = payload({ cost_per_day: 25, rental_company: "Sunbelt", pricing_mode: "per_day", ownership: "owned" }, "rented");
  eq("owned blanks rental_company", owned.rental_company, "");
  eq("owned pricing_mode\u2192owned_flat", owned.pricing_mode, "owned_flat");
  eq("owned cost field untouched", owned.cost_per_day, 25);
  const rentedBadMode = payload({ pricing_mode: "weird", ownership: "rented" });
  eq("rented bad mode\u2192per_day", rentedBadMode.pricing_mode, "per_day");
}
section("M3 InventoryTable tableSupplier + FoundationCatalog catalogSections");
var IT = CAND("src/components/masterInventory/InventoryTable.jsx");
var FC = CAND("src/pages/FoundationCatalog.jsx");
var tableSupplier = fnFromDecl(slice(IT, "const tableSupplier = (row) =>", ";", "tableSupplier"), [])();
{
  eq("supplier field wins", tableSupplier({ supplier: "Acme", vendor_name: "Other" }), "Acme");
  eq("vendor fallback", tableSupplier({ vendor_name: "Citywide" }), "Citywide");
  eq("service_name fallback", tableSupplier({ service_name: "Permit Exp" }), "Permit Exp");
  eq("blank vendor \u2192 service", tableSupplier({ vendor_name: "", service_name: "S" }), "S");
  eq("absent all \u2192 falsy", tableSupplier({}), void 0);
}
var catSectionsDecl = slice(FC, "const catalogSections = (() => {", "})();", "catalogSections");
var buildSections = (visible, visibleCount) => new Function("groupInventoryBySupplier", "visible", "visibleCount", `"use strict";
${catSectionsDecl}
  return catalogSections;`)(
  groupInventoryBySupplier,
  visible,
  visibleCount
);
{
  const mk = (id, supplier) => ({ id, material_type: "rebar", material_name: id, supplier });
  const vis = [mk("r1", "AAA"), mk("r2", "aaa"), mk("r3", "ZZZ"), mk("r4"), mk("r5", "")];
  const full = buildSections(vis, 60);
  eq("sections count", full.length, 3);
  eq("sections order", full.map((g) => g.key).join(","), "aaa,zzz,");
  eq("unassigned last rows", full[2].rows.length, 2);
  const win = buildSections(vis, 2);
  eq("window caps rows", win.length, 1);
  eq("window rows only", win[0].rows.length, 2);
  const win3 = buildSections(vis, 3);
  eq("window splits group boundary", win3.length, 2);
  eq("window part2 rows", win3[1].rows.length, 1);
  const win0 = buildSections(vis, 0);
  eq("window 0 \u2192 no sections", win0.length, 0);
}
section("R1 InventoryTable renderToStaticMarkup \u2014 grouped headers, ordering, colSpan");
var laborSource = {
  key: "labor_services",
  label: "Labor & Services",
  nameField: "service_name",
  fields: [
    { name: "service_name", label: "Name", type: "text", required: true, table: true },
    { name: "service_category", label: "Category", type: "select", options: ["concrete_service", "other"], table: true },
    { name: "pricing_mode", label: "Pricing", type: "select", options: ["per_cy", "flat"], table: true },
    { name: "default_rate", label: "Rate", type: "number", required: true, table: true },
    { name: "vendor_name", label: "Vendor", type: "text", table: true },
    { name: "is_active", label: "Active", type: "boolean", table: true }
  ]
};
var laborItems = [
  { id: "L1", service_name: "Citywide 3500", service_category: "concrete_service", pricing_mode: "per_cy", default_rate: 155, vendor_name: "Citywide" },
  { id: "L2", service_name: "Citywide Small-Load", service_category: "concrete_service", pricing_mode: "flat", default_rate: 0, vendor_name: " citywide " },
  { id: "L3", service_name: "Ernst 4000", service_category: "concrete_service", pricing_mode: "per_cy", default_rate: 160, vendor_name: "Ernst" },
  { id: "L4", service_name: "Permit Expediting", service_category: "permitting", pricing_mode: "flat", default_rate: 350 },
  // No supplier/vendor/service fields at all → the unassigned group (the
  // service_name fallback keeps every NAMED labor row in its own group).
  { id: "L5" }
];
var headerTexts = (html) => [...html.matchAll(/Supplier: <span[^>]*>([^<]*)<\/span>\s*<span[^>]*>\((\d+)\)<\/span>/g)].map((m) => ({ label: m[1], count: Number(m[2]) }));
{
  __seedReactStates(null);
  const html = renderToStaticMarkup(createElement(InventoryTable, { source: laborSource, items: laborItems, canEdit: true }));
  const heads = headerTexts(html);
  eq("header count", heads.length, 4);
  eq("group order alpha", heads.map((x) => x.label).join("|"), "Citywide|Ernst|Permit Expediting|\u2014 not recorded");
  eq("citywide merged count", heads[0].count, 2);
  eq("unassigned count", heads[3].count, 1);
  ok("colSpan spans all cols", html.includes('colSpan="7"'), `colSpan=7 expected: ${html.match(/colSpan="\d+"/)?.[0]}`);
  const i1 = html.indexOf("Citywide 3500"), i2 = html.indexOf("Citywide Small-Load"), i3 = html.indexOf("Ernst 4000");
  ok("input order inside group", i1 > -1 && i2 > i1 && i3 > i2);
  ok("authored 0 rate renders 0", html.includes(">0</span>"));
  ok("unassigned header last", html.indexOf("\u2014 not recorded") > html.lastIndexOf("Permit Expediting"));
  ok("header row class", html.includes('class="bg-slate-50/80"'));
  ok("header uppercase class", /uppercase tracking-wide text-slate-500/.test(html));
}
{
  __seedReactStates(null);
  const html = renderToStaticMarkup(createElement(InventoryTable, {
    source: { ...laborSource, fields: laborSource.fields.slice(0, 5) },
    items: laborItems,
    canEdit: false
  }));
  const heads = headerTexts(html);
  eq("read-only colSpan", html.match(/colSpan="(\d+)"/)?.[1], "5");
  eq("read-only header count", heads.length, 4);
}
{
  let threw = null;
  __seedReactStates(null);
  try {
    renderToStaticMarkup(createElement(InventoryTable2, { source: laborSource, items: laborItems, canEdit: true }));
  } catch (e) {
    threw = e.message;
  }
  ok("remote baseline TDZ throws (fixed in candidate)", /before initialization|undefined/.test(String(threw)), `got: ${threw}`);
}
{
  const subSource = {
    key: "substrates",
    label: "Substrates",
    nameField: "material_name",
    fields: [
      { name: "material_name", label: "Name", type: "text", table: true },
      { name: "supplier", label: "Supplier", type: "text", table: true }
    ]
  };
  __seedReactStates(null);
  const html = renderToStaticMarkup(createElement(InventoryTable, {
    source: subSource,
    canEdit: false,
    items: [{ id: "s1", material_name: "ACM", supplier: "AluCo" }, { id: "s2", material_name: "PVC" }]
  }));
  const heads = headerTexts(html);
  eq("substrates groups", heads.map((x) => x.label).join("|"), "AluCo|\u2014 not recorded");
}
section("R2 FoundationCatalog renderToStaticMarkup \u2014 sections, unrecorded last, row-budget");
var catRows = [
  { id: "r1", material_type: "rebar", material_name: "Rebar #4", supplier: "AAA Rebar", cost_per_unit: 12 },
  { id: "r2", material_type: "rebar", material_name: "Rebar #5", supplier: " aaa rebar ", cost_per_unit: 0 },
  { id: "r3", material_type: "rebar", material_name: "Rebar #6", supplier: "ZZZ Steel", cost_per_unit: 9 },
  { id: "r4", material_type: "rebar", material_name: "Rebar #7", cost_per_unit: 5 },
  { id: "r5", material_type: "rebar", material_name: "Rebar #8", supplier: "", cost_per_unit: 1 }
];
var sectionHeaders = (html) => [...html.matchAll(/uppercase tracking-wide text-slate-500 border-b[^"]*"[^>]*>\s*(?:Supplier: <span[^>]*>([^<]*)<\/span>|(No supplier recorded))/g)].map((m) => m[1] || m[2]);
{
  __seedReactStates([catRows, false, "rebar", "", null, false, "", 60]);
  const html = renderToStaticMarkup(createElement(FoundationCatalog));
  const heads = sectionHeaders(html);
  eq("catalog section count", heads.length, 3);
  eq("catalog order + unrecorded last", heads.join("|"), "AAA Rebar|ZZZ Steel|No supplier recorded");
  ok("all 5 rows render", ["Rebar #4", "Rebar #5", "Rebar #6", "Rebar #7", "Rebar #8"].every((n) => html.includes(n)));
  ok("authored $0.00 price shows", html.includes("$0.00"));
  ok("no show-more under cap", !html.includes("Show "));
  ok("header precedes rows", html.indexOf("AAA Rebar") < html.indexOf("Rebar #4") && html.indexOf("No supplier recorded") > html.indexOf("Rebar #6"));
}
{
  __seedReactStates([catRows, false, "rebar", "", null, false, "", 2]);
  const html = renderToStaticMarkup(createElement(FoundationCatalog));
  const heads = sectionHeaders(html);
  eq("windowed: only first section", heads.length, 1);
  eq("windowed section", heads[0], "AAA Rebar");
  ok("windowed rows capped at 2", html.includes("Rebar #4") && html.includes("Rebar #5") && !html.includes("Rebar #6"));
  ok("show-more renders remaining", html.includes("Show 3 more (3 remaining)"));
}
section("R3 MasterEquipmentTab renderToStaticMarkup \u2014 list prices, blank-vs-0 form");
var fndRows = [
  { id: "e1", material_name: "Mini Excavator", material_type: "excavation_equipment", ownership: "rented", cost_per_day: 0, cost_per_week: null, compatible_attachment_ids: ["a1"], updated_date: "t0" },
  { id: "a1", material_name: "Auger Bit", material_type: "attachment", ownership: "rented", cost_per_day: 12 },
  { id: "u1", material_name: "Unpriced Tool", material_type: "attachment", ownership: "rented" }
];
var chnRows = [{ id: "c1", equipment_name: "Boom 60ft", equipment_type: "boom_lift", ownership: "rented", cost_per_day: 250 }];
{
  __seedReactStates([fndRows, chnRows, false, "rented", "equipment", "", false, null, ""]);
  const html = renderToStaticMarkup(createElement(MasterEquipmentTab, { isAdmin: true }));
  ok("authored $0 day shows", html.includes("Day: <strong>$0</strong>"));
  ok("null week shows Not priced", html.includes("Wk: <strong>Not priced</strong>"));
  ok("absent month shows Not priced", html.includes("Mo: <strong>Not priced</strong>"));
  ok("boom $250 shows", html.includes("Day: <strong>$250</strong>"));
  ok("attachment renders", html.includes("Auger Bit"));
  ok("no $null minted display", !html.includes("$null") && !html.includes("$NaN"));
}
{
  const editNew = { _new: true, kind: "equipment", _source: "foundation_equipment", raw: {
    material_type: "excavation_equipment",
    material_name: "",
    cost_per_day: null,
    cost_per_week: null,
    cost_per_month: null,
    pickup_delivery_cost: null,
    ownership: "rented",
    compatible_attachment_ids: [],
    compatible_sub_attachment_ids: [],
    show_in_channel_letters: false,
    show_in_foundation: true,
    show_in_sign_maintenance: false,
    sort_order: null
  } };
  __seedReactStates([fndRows, chnRows, false, "rented", "equipment", "", true, editNew, ""]);
  const html = renderToStaticMarkup(createElement(MasterEquipmentTab, { isAdmin: true }));
  ok('blank drafts render value="" (no minted 0)', !/value="0"/.test(html), `found value="0" at ${html.indexOf('value="0"')}`);
  const blankInputs = (html.match(/value=""/g) || []).length;
  ok("\u22654 blank numeric inputs", blankInputs >= 4, `got ${blankInputs}`);
  ok("form mounted", html.includes("Supports Attachments") || html.includes("Delivery / Pickup"));
}
{
  const editZero = { kind: "equipment", _source: "channel_letter_equipment", id: "c1", name: "Boom 60ft", raw: {
    id: "c1",
    equipment_name: "Boom 60ft",
    equipment_type: "boom_lift",
    ownership: "rented",
    cost_per_day: 0,
    cost_per_week: 0,
    cost_per_month: 0,
    cost_flat: 0,
    delivery_pickup_cost: 0,
    max_height_feet: 0,
    vertical_reach_safety_margin_feet: 2,
    is_default_for_height: true,
    default_height_min_feet: 0,
    default_height_max_feet: 0,
    mpg: 0,
    idle_running_cost_per_hour: 0,
    rental_company: "Sunbelt",
    updated_date: "t1"
  } };
  __seedReactStates([fndRows, chnRows, false, "rented", "equipment", "", true, editZero, ""]);
  const html = renderToStaticMarkup(createElement(MasterEquipmentTab, { isAdmin: true }));
  const zeros = (html.match(/value="0"/g) || []).length;
  ok('authored 0s initialize value="0" (\u22655)', zeros >= 5, `got ${zeros}`);
  ok("safety margin authored 2 shows", html.includes('value="2"'));
}
section("S source assertions");
{
  ok("MET no `|| 0` remains", !/\|\|\s*0/.test(MET));
  ok("MET no parseFloat||0 draft", !/parseFloat\(e\.target\.value\)\s*\|\|\s*0/.test(MET));
  eq("MET ?? null numeric init count", (MET.match(/\?\? null/g) || []).length >= 22, true);
  eq("MET inventoryNumberInput onChanges", (MET.match(/inventoryNumberInput\(e\.target\.value\)/g) || []).length, 10);
  ok("MET openAdd nulls", /cost_per_day: null, cost_per_week: null, cost_per_month: null, delivery_pickup_cost: null/.test(MET) && /cost_per_day: null, cost_per_week: null, cost_per_month: null, pickup_delivery_cost: null/.test(MET) && /sort_order: null/.test(MET));
  ok("IT imports groupInventoryBySupplier", /import \{ groupInventoryBySupplier \} from "\.\/inventoryNormalization"/.test(IT));
  ok("IT Fragment import", /Fragment/.test(IT));
  ok("IT groups sortedItems", /groupInventoryBySupplier\(sortedItems, tableSupplier\)/.test(IT));
  ok("IT header markup per landed", /className="bg-slate-50\/80"/.test(IT) && /— not recorded/.test(IT));
  ok("IT colSpan formula", /colSpan=\{tableFields\.length \+ \(canEdit \? 1 : 0\) \+ \(bulkField && canEdit \? 1 : 0\)\}/.test(IT));
  ok("IT sortedItems declared before use", IT.indexOf("const sortedItems") < IT.indexOf("const allVisibleSelected"));
  ok("FC imports grouping", /import \{ groupInventoryBySupplier \} from "@\/components\/masterInventory\/inventoryNormalization"/.test(FC));
  ok("FC sections render", /catalogSections\.map/.test(FC));
  ok("FC header markup per landed", /No supplier recorded/.test(FC) && /Supplier: <span/.test(FC));
  ok("FC window keeps row cap", /group\.rows\.slice\(0, budget\)/.test(FC));
}
console.log(`
${failures.length === 0 ? "PASS" : "FAIL"} o008u-remaining \u2014 ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  FAIL: ${f}`);
  process.exit(1);
}
