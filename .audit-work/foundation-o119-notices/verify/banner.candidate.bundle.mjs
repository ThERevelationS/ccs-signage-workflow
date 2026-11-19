// .audit-work/foundation-o119-notices/candidates/src/components/estimator/foundation/FoundationSectionBanner.jsx
import { useState as useState2 } from "react";

// stub:lucide-react
var ChevronUp = () => null;
var ChevronDown = () => null;
var Info = () => null;
var AlertTriangle = () => null;
var X = () => null;

// .audit-work/foundation-o119-notices/candidates/src/components/estimator/foundation/foundationPreliminaryNotice.js
import { createElement, useState } from "react";
var PRELIMINARY_NOTICE_TEXT = "Preliminary estimating only - final engineering required";
function PreliminaryNotice({ text = PRELIMINARY_NOTICE_TEXT, dismissible = false, className = "" }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return createElement(
    "div",
    {
      role: "status",
      className: `flex items-center gap-2 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 ${className}`.trim()
    },
    createElement(AlertTriangle, { className: "w-4 h-4 text-amber-600 flex-shrink-0", "aria-hidden": true }),
    createElement("span", { className: "flex-1 font-medium" }, text),
    dismissible ? createElement(
      "button",
      {
        type: "button",
        onClick: () => setDismissed(true),
        "aria-label": "Dismiss preliminary notice",
        className: "h-[22px] px-1.5 rounded-sm text-amber-700 hover:bg-amber-100"
      },
      createElement(X, { className: "w-3.5 h-3.5", "aria-hidden": true })
    ) : null
  );
}

// .audit-work/foundation-o119-notices/candidates/src/components/estimator/foundation/FoundationSectionBanner.jsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function FoundationSectionBanner({ sectionName }) {
  const [open, setOpen] = useState2(true);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "bg-violet-100 border border-violet-300 rounded-sm px-3 py-2 mb-3 flex items-center gap-2", children: [
      /* @__PURE__ */ jsx(Info, { className: "w-4 h-4 text-violet-600 flex-shrink-0", "aria-hidden": "true" }),
      /* @__PURE__ */ jsx("span", { className: "text-[12px] text-violet-900 flex-1", children: open ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("b", { children: "All-In-One section:" }),
        " ",
        sectionName || "Untitled",
        " \u2014 ",
        /* @__PURE__ */ jsx("b", { children: "Concrete | Masonry | Poles" }),
        " \u2014 save here and the total flows into the combined estimate automatically."
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("b", { children: "All-In-One section:" }),
        " ",
        sectionName || "Untitled"
      ] }) }),
      /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          onClick: () => setOpen((v) => !v),
          className: "h-[24px] px-2 flex items-center gap-1 rounded-sm bg-white border border-violet-300 text-[11px] font-medium text-violet-800",
          children: [
            open ? /* @__PURE__ */ jsx(ChevronUp, { className: "w-3 h-3", "aria-hidden": "true" }) : /* @__PURE__ */ jsx(ChevronDown, { className: "w-3 h-3", "aria-hidden": "true" }),
            open ? "Collapse Section" : "Expand Section"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsx(PreliminaryNotice, { className: "-mt-2 mb-3" })
  ] });
}
export {
  FoundationSectionBanner as default
};
