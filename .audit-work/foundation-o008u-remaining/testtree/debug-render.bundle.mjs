// testtree/stubs/react-shim.mjs
import { createRequire } from "node:module";
var require2 = createRequire(import.meta.url);
var React = require2("react");
var realUseState = React.useState;
var seedQueue = null;
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

// debug-render.jsx
import { renderToStaticMarkup } from "react-dom/server";

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
var Label = passthrough("label");
var Select = passthrough("div");
var SelectContent = passthrough("div");
var SelectTrigger = passthrough("div");
var SelectValue = passthrough("span");

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

// testtree/src/components/masterInventory/inventoryPersistence.js
var findInventoryEstimateUsage = async () => ({ estimates: 0, products: 0, estimateIds: [] });

// testtree/src/components/masterInventory/inventoryNormalization.js
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
  const tableSupplier = (row) => row?.supplier || row?.vendor_name || row?.service_name;
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
      /* @__PURE__ */ jsx("tbody", { className: "divide-y", children: groupInventoryBySupplier(sortedItems, tableSupplier).map((group) => (
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

// debug-render.jsx
var laborSource = {
  key: "labor_services",
  label: "Labor & Services",
  nameField: "service_name",
  fields: [
    { name: "service_name", label: "Name", type: "text", required: true, table: true },
    { name: "default_rate", label: "Rate", type: "number", required: true, table: true },
    { name: "vendor_name", label: "Vendor", type: "text", table: true }
  ]
};
var html = renderToStaticMarkup(createElement(InventoryTable, {
  source: laborSource,
  canEdit: true,
  items: [
    { id: "L1", service_name: "Citywide 3500", default_rate: 155, vendor_name: "Citywide" },
    { id: "L2", service_name: "Citywide SL", default_rate: 0, vendor_name: " citywide " }
  ]
}));
console.log(html);
