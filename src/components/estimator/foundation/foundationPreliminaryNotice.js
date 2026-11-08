// O-119 (CMP-I18) — the canonical "preliminary estimating" notice shared by
// every foundation concept surface.
//
// One wording, two persistence mechanisms:
//   * Data — ensurePreliminaryNotice() prepends the sentence to authored or
//     template-carried note text so the disclaimer persists in the record
//     itself. FoundationProject.notes is a plain string carried verbatim by
//     save payloads, save-as-copy, browser drafts, and template snapshots, so
//     a stamped note survives every one of those paths and stays available to
//     client-estimate-notes and handoff surfaces downstream.
//   * View — <PreliminaryNotice/> renders the same sentence as a standing
//     role="status" bar. role="status" is deliberate: this is persistent
//     context about the concept, not a time-sensitive alert — never
//     role="alert".
//
// "Dismissible-per-view but persistent per concept": a surface may opt into
// per-view dismissal via the `dismissible` prop (component-local state, reset
// on remount); the record-level text stamps are what keep the notice attached
// to the concept itself. The estimator's own concept banner mounts the notice
// non-dismissible.
//
// Deferred mounts (owned by other units — one line each adopts this):
//   * src/pages/FoundationEstimator.jsx — page notes mount:
//       <PreliminaryNotice /> beside any future notes entry surface
//   * src/components/estimator/foundation/FoundationBOM.jsx — print/handoff:
//       <PreliminaryNotice /> at the top of the BOM/print export block
//   * handoff/export text builders — append PRELIMINARY_NOTICE_TEXT (or run
//     authored description text through ensurePreliminaryNotice).
import { createElement, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

// Verbatim acceptance wording — ESTIMATOR_MASTERPLAN.md `O-119` (CMP-I18):
// 'Make "Preliminary estimating only - final engineering required" persistent
// on generated structural concepts, client estimate notes as appropriate, and
// handoff exports.' Keep byte-identical so every surface shows one sentence.
export const PRELIMINARY_NOTICE_TEXT =
  "Preliminary estimating only - final engineering required";

export function hasPreliminaryNotice(text) {
  return typeof text === "string" && text.includes(PRELIMINARY_NOTICE_TEXT);
}

// Returns note text guaranteed to lead with the canonical notice. Empty or
// blank input becomes the notice alone; a note already carrying the sentence
// is returned verbatim so repeated snapshot/apply passes never double-stamp.
// Non-string input fails closed — callers stamping record fields must not
// silently coerce malformed data into a "note".
export function ensurePreliminaryNotice(notes) {
  if (notes === null || notes === undefined) return PRELIMINARY_NOTICE_TEXT;
  if (typeof notes !== "string") {
    throw new Error("Preliminary notice can only be applied to string notes.");
  }
  if (notes.trim() === "") return PRELIMINARY_NOTICE_TEXT;
  if (hasPreliminaryNotice(notes)) return notes;
  return `${PRELIMINARY_NOTICE_TEXT}\n\n${notes}`;
}

// Standing per-concept notice bar. `dismissible` opts a VIEW into per-view
// dismissal (internal state only — remount restores it, and record-level
// stamps are what keep the notice persistent per concept).
export function PreliminaryNotice({ text = PRELIMINARY_NOTICE_TEXT, dismissible = false, className = "" }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return createElement(
    "div",
    {
      role: "status",
      className: `flex items-center gap-2 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 ${className}`.trim(),
    },
    createElement(AlertTriangle, { className: "w-4 h-4 text-amber-600 flex-shrink-0", "aria-hidden": true }),
    createElement("span", { className: "flex-1 font-medium" }, text),
    dismissible
      ? createElement(
          "button",
          {
            type: "button",
            onClick: () => setDismissed(true),
            "aria-label": "Dismiss preliminary notice",
            className: "h-[22px] px-1.5 rounded-sm text-amber-700 hover:bg-amber-100",
          },
          createElement(X, { className: "w-3.5 h-3.5", "aria-hidden": true })
        )
      : null
  );
}

export default PreliminaryNotice;
