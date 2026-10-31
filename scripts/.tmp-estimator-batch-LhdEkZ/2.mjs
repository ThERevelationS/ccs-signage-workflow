// src/components/estimator/aio/EstimateProductsList.jsx
import { useEffect, useRef, useState } from "react";

// src/components/estimator/estimateCreationService.js
function estimateLineSelectionKey(line, index) {
  return line?.line_id || line?.builder_product_id || line?.project_id || `i${index}`;
}

// node_modules/lucide-react/dist/esm/createLucideIcon.js
import { forwardRef as forwardRef2, createElement as createElement2 } from "react";

// node_modules/lucide-react/dist/esm/shared/src/utils.js
var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();

// node_modules/lucide-react/dist/esm/Icon.js
import { forwardRef, createElement } from "react";

// node_modules/lucide-react/dist/esm/defaultAttributes.js
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

// node_modules/lucide-react/dist/esm/Icon.js
var Icon = forwardRef(
  ({
    color = "currentColor",
    size = 24,
    strokeWidth = 2,
    absoluteStrokeWidth,
    className = "",
    children,
    iconNode,
    ...rest
  }, ref) => {
    return createElement(
      "svg",
      {
        ref,
        ...defaultAttributes,
        width: size,
        height: size,
        stroke: color,
        strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
        className: mergeClasses("lucide", className),
        ...rest
      },
      [
        ...iconNode.map(([tag, attrs]) => createElement(tag, attrs)),
        ...Array.isArray(children) ? children : [children]
      ]
    );
  }
);

// node_modules/lucide-react/dist/esm/createLucideIcon.js
var createLucideIcon = (iconName, iconNode) => {
  const Component = forwardRef2(
    ({ className, ...props }, ref) => createElement2(Icon, {
      ref,
      iconNode,
      className: mergeClasses(`lucide-${toKebabCase(iconName)}`, className),
      ...props
    })
  );
  Component.displayName = `${iconName}`;
  return Component;
};

// node_modules/lucide-react/dist/esm/icons/search.js
var __iconNode = [
  ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }],
  ["path", { d: "m21 21-4.3-4.3", key: "1qie3q" }]
];
var Search = createLucideIcon("Search", __iconNode);

// synthetic:./ProductRow
function ProductRow() {
  return null;
}

// synthetic:@/components/estimator/moduleRegistry
var ESTIMATOR_MODULES = [];
var getModuleLabel = () => "Custom";

// synthetic:@/components/estimator/customerPricing
var acceptedCustomerUnitPrice = () => 10;

// synthetic:@/components/estimator/aioPricing
var money = (value) => String(value);

// synthetic:@/components/estimator/productionProductTypes
var loadProductionProductTypes = async () => [];

// src/components/estimator/aio/EstimateProductsList.jsx
import { jsx, jsxs } from "react/jsx-runtime";
function EstimateProductsList({ lines = [], rawTotal = 0, onChange, onRemove, onEdit, onUpdatePrice, onProductRefresh, onClone, onSaveNotes, onCreateQuickProduct, onPersistSettings, onSplit, readOnly = false }) {
  const [query, setQuery] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [splitIds, setSplitIds] = useState(() => /* @__PURE__ */ new Set());
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState("");
  const splittingRef = useRef(false);
  const selectionSnapshot = JSON.stringify(lines);
  useEffect(() => {
    setSplitIds(/* @__PURE__ */ new Set());
    setSplitError("");
  }, [selectionSnapshot, readOnly]);
  const submitSplit = async () => {
    if (splittingRef.current || readOnly || !splitIds.size) return;
    splittingRef.current = true;
    setSplitting(true);
    setSplitError("");
    try {
      const success = await onSplit([...splitIds]);
      if (success === false) return;
      setSplitMode(false);
      setSplitIds(/* @__PURE__ */ new Set());
    } catch (error) {
      setSplitError(error?.message || "The selected products could not be copied. Try again.");
    } finally {
      splittingRef.current = false;
      setSplitting(false);
    }
  };
  const toggleSplitId = (id) => setSplitIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const [moduleFilter, setModuleFilter] = useState("all");
  const [productionProductTypes, setProductionProductTypes] = useState([]);
  useEffect(() => {
    let active = true;
    loadProductionProductTypes().then((items) => active && setProductionProductTypes(items));
    return () => {
      active = false;
    };
  }, []);
  const complete = lines.filter((l) => l.section_status === "complete").length;
  const visible = lines.map((line, index) => ({ line, index })).filter(({ line }) => {
    if (moduleFilter !== "all" && line.module_key !== moduleFilter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (line.project_name || "").toLowerCase().includes(q) || (line.client_product_name || "").toLowerCase().includes(q) || (line.builder_name || "").toLowerCase().includes(q) || (line.product_category || "").toLowerCase().includes(q) || (line.production_product_type || "").toLowerCase().includes(q) || getModuleLabel(line.module_key).toLowerCase().includes(q);
  });
  const visibleSubtotal = visible.reduce((sum, { line }) => {
    const quantity = Math.max(0, Number(line.customer_quantity ?? 1) || 0);
    return sum + acceptedCustomerUnitPrice(line) * quantity * (1 + Number(line.adjustment_percent || 0) / 100);
  }, 0);
  return /* @__PURE__ */ jsxs("div", { className: "bg-white border border-gray-200 rounded-md", children: [
    /* @__PURE__ */ jsxs("div", { className: "px-4 py-2 border-b border-gray-200 flex items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsxs("span", { className: "text-[11px] font-bold tracking-wider text-red-600", children: [
        "ESTIMATE PRODUCTS (",
        lines.length,
        ")"
      ] }),
      /* @__PURE__ */ jsx("span", { className: "text-[10px] px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-100", children: "\u21C4 Live-synced with source estimators" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "px-4 py-2 flex flex-wrap items-center gap-2 border-b border-gray-100", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex-1 relative", children: [
        /* @__PURE__ */ jsx(Search, { className: "w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            value: query,
            onChange: (e) => setQuery(e.target.value),
            placeholder: "Search products...",
            className: "w-full h-[30px] pl-7 pr-2 border border-gray-200 rounded text-[12px]"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs(
        "select",
        {
          value: moduleFilter,
          onChange: (e) => setModuleFilter(e.target.value),
          className: "h-[30px] px-2 border border-gray-200 rounded text-[12px] text-gray-600 bg-white",
          children: [
            /* @__PURE__ */ jsx("option", { value: "all", children: "All product types" }),
            /* @__PURE__ */ jsx("option", { value: "custom", children: "Custom Products" }),
            ESTIMATOR_MODULES.map((m) => /* @__PURE__ */ jsx("option", { value: m.key, children: m.label }, m.key))
          ]
        }
      ),
      /* @__PURE__ */ jsxs("span", { className: "text-[10px] text-gray-400 whitespace-nowrap", children: [
        complete,
        "/",
        lines.length,
        " products complete"
      ] }),
      typeof onSplit === "function" && !readOnly && (splitMode ? /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsx("button", { type: "button", onClick: submitSplit, disabled: splitting || splitIds.size === 0, "aria-busy": splitting, className: "h-[30px] px-2 rounded bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700 disabled:opacity-40", children: splitting ? "Creating draft..." : `Copy ${splitIds.size || ""} to new draft` }),
        /* @__PURE__ */ jsx("button", { type: "button", disabled: splitting, onClick: () => {
          setSplitMode(false);
          setSplitIds(/* @__PURE__ */ new Set());
          setSplitError("");
        }, className: "h-[30px] px-2 rounded border border-gray-300 bg-white text-[11px] text-gray-600", children: "Cancel" })
      ] }) : /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setSplitMode(true), className: "h-[30px] px-2 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600 hover:border-indigo-300", children: "Split\u2026" }))
    ] }),
    splitMode && !readOnly && /* @__PURE__ */ jsx("p", { className: "px-4 py-2 text-[11px] text-gray-600", role: "status", children: "Select products to copy into a new draft. This estimate stays unchanged." }),
    splitError && /* @__PURE__ */ jsx("p", { className: "px-4 py-2 text-[12px] text-red-700", role: "alert", children: splitError }),
    visible.length === 0 ? /* @__PURE__ */ jsx("div", { className: "py-10 text-center text-[12px] text-gray-400", children: lines.length === 0 ? "No products yet \u2014 add one above to start pricing this estimate." : "No products match this search or filter." }) : /* @__PURE__ */ jsx("div", { className: "p-2 space-y-2 bg-gray-50", children: visible.map(({ line, index }) => {
      const lineId = estimateLineSelectionKey(line, index);
      return /* @__PURE__ */ jsxs("div", { className: "relative", children: [
        splitMode && !readOnly && /* @__PURE__ */ jsx("label", { className: "absolute left-1 top-1 z-10 flex items-center justify-center w-5 h-5 rounded border border-indigo-300 bg-white cursor-pointer", children: /* @__PURE__ */ jsx("input", { type: "checkbox", disabled: splitting, checked: splitIds.has(lineId), onChange: () => toggleSplitId(lineId), className: "w-3.5 h-3.5 accent-indigo-600", "aria-label": `Select ${line.client_product_name || line.project_name || line.description || `product ${index + 1}`} to split` }) }),
        /* @__PURE__ */ jsx(
          ProductRow,
          {
            line,
            index,
            percentOfTotal: rawTotal > 0 ? acceptedCustomerUnitPrice(line) * Math.max(0, Number(line.customer_quantity ?? 1) || 0) / rawTotal * 100 : null,
            onChange,
            onRemove,
            onEdit,
            onUpdatePrice,
            onProductRefresh,
            onClone,
            onSaveNotes,
            onCreateQuickProduct,
            onPersistSettings,
            productionProductTypes,
            readOnly,
            allLines: lines
          },
          lineId
        )
      ] }, lineId);
    }) }),
    visible.length > 0 && /* @__PURE__ */ jsxs("div", { className: "px-4 py-2 border-t border-gray-200 flex items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsx("span", { className: "text-[10px] text-gray-400 whitespace-nowrap", children: visible.length === lines.length ? `${visible.length} products` : `${visible.length} of ${lines.length} products shown` }),
      /* @__PURE__ */ jsxs("span", { className: "text-[11px] font-semibold text-gray-600 whitespace-nowrap", children: [
        "Sections subtotal: ",
        /* @__PURE__ */ jsx("span", { className: "font-bold text-gray-900 tabular-nums", children: money(visibleSubtotal) })
      ] })
    ] })
  ] });
}
export {
  EstimateProductsList as default
};
/*! Bundled license information:

lucide-react/dist/esm/shared/src/utils.js:
lucide-react/dist/esm/defaultAttributes.js:
lucide-react/dist/esm/Icon.js:
lucide-react/dist/esm/createLucideIcon.js:
lucide-react/dist/esm/icons/search.js:
lucide-react/dist/esm/lucide-react.js:
  (**
   * @license lucide-react v0.475.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
