// Hard due date badge + toggle patch model (B-08).
//
// A product flagged hard_due_date has a locked product_due_date: the due-date
// engine never moves it (held_by_hard_date — see base44/shared/dueDateEngine.ts
// holdResult) and assertDueDateMutable blocks auto-recalc writes in EITHER
// direction. This module is the display + toggle half of the rule:
//
//   HARD_DUE_BADGE    — {text, tone} for kit StatusChip
//                       (<StatusChip tone={badge.tone}>{badge.text}</StatusChip>)
//   setHardDuePatch() — products[] patch that turns the flag on/off and stamps
//                       provenance on enable / clears it on disable
//   hardDueDisplay()  — {is_hard, badge|null, tooltip} for rows/panels
//
// Pure and IO-free: esbuild-bundled + unit-tested under Node by
// scripts/test-hard-due.mjs.
//
// Field notes: hard_due_date is declared on WorkOrder.products[]
// (WorkOrder.jsonc — boolean, default false). The provenance stamps
// hard_due_set_by / hard_due_set_at are NOT declared there yet — same
// convention as manual_stage_override (productStageModel.js): writers land
// them on the products[] row and readers treat them as optional strings.

import { isHardDue } from "../../../base44/shared/dueDateEngine.ts";

export const HARD_DUE_BADGE = Object.freeze({ text: "Hard due date", tone: "red" });
export const HARD_DUE_TOOLTIP = "Due date is locked — recalculation will not move it.";

const clean = (v) => String(v ?? "").trim();

// `now` may be a Date, ISO string, or epoch ms — normalize to an ISO stamp;
// unparseable values keep their raw string so nothing is silently dropped.
const toIso = (now) => {
  if (now === undefined || now === null || now === "") return new Date().toISOString();
  const d = now instanceof Date ? now : new Date(now);
  return Number.isNaN(d.getTime()) ? String(now) : d.toISOString();
};

// Build the products[] patch for toggling the flag. Enabling always stamps
// who/when (empty strings when the caller has no actor); disabling clears the
// stamps so a re-enabled product never carries stale provenance. Only field
// keys are returned — the patch is spread straight onto a products[] row, so
// anything extra would leak into stored data; callers diff via isHardDue().
//   setHardDuePatch(product, { hard: true,  actor: "brett@shop.com", now }) ->
//     { hard_due_date: true,  hard_due_set_by: "brett@shop.com", hard_due_set_at: "<iso>" }
//   setHardDuePatch(product, { hard: false }) ->
//     { hard_due_date: false, hard_due_set_by: "",               hard_due_set_at: "" }
export function setHardDuePatch(product, { hard = true, actor = "", now } = {}) {
  const enable = Boolean(hard);
  return {
    hard_due_date: enable,
    hard_due_set_by: enable ? clean(actor) : "",
    hard_due_set_at: enable ? toIso(now) : "",
  };
}

// Display model for a products[] row: hard rows get the red chip + lock
// tooltip; when provenance stamps are present the tooltip names who set it.
export function hardDueDisplay(product) {
  if (!isHardDue(product)) {
    return { is_hard: false, badge: null, tooltip: "" };
  }
  let tooltip = HARD_DUE_TOOLTIP;
  const by = clean(product?.hard_due_set_by);
  const at = clean(product?.hard_due_set_at).slice(0, 10);
  if (by || at) {
    const stamp = [by ? `set by ${by}` : "", at ? `on ${at}` : ""].filter(Boolean).join(" ");
    tooltip = `${HARD_DUE_TOOLTIP} (${stamp})`;
  }
  return { is_hard: true, badge: { ...HARD_DUE_BADGE }, tooltip };
}
