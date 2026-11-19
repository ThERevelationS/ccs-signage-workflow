// .audit-work/foundation-o119-notices/candidates/src/components/estimator/foundation/foundationPreliminaryNotice.js
import { createElement, useState } from "react";

// stub:lucide-react
var AlertTriangle = () => null;
var X = () => null;

// .audit-work/foundation-o119-notices/candidates/src/components/estimator/foundation/foundationPreliminaryNotice.js
var PRELIMINARY_NOTICE_TEXT = "Preliminary estimating only - final engineering required";
function hasPreliminaryNotice(text) {
  return typeof text === "string" && text.includes(PRELIMINARY_NOTICE_TEXT);
}
function ensurePreliminaryNotice(notes) {
  if (notes === null || notes === void 0) return PRELIMINARY_NOTICE_TEXT;
  if (typeof notes !== "string") {
    throw new Error("Preliminary notice can only be applied to string notes.");
  }
  if (notes.trim() === "") return PRELIMINARY_NOTICE_TEXT;
  if (hasPreliminaryNotice(notes)) return notes;
  return `${PRELIMINARY_NOTICE_TEXT}

${notes}`;
}
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
var foundationPreliminaryNotice_default = PreliminaryNotice;
export {
  PRELIMINARY_NOTICE_TEXT,
  PreliminaryNotice,
  foundationPreliminaryNotice_default as default,
  ensurePreliminaryNotice,
  hasPreliminaryNotice
};
