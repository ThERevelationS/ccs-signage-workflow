import { calcProject } from "./foundationCalc";
import { createFoundationReinforcementDraft } from "./foundationReinforcementDraft";
import { createFoundationReinforcementProposal, acceptFoundationReinforcementProposal } from "./foundationReinforcementProposal";

const plain = value => value !== null && typeof value === "object" && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const finite = value => typeof value === "number" && Number.isFinite(value);
const money = value => finite(value)
  ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Unavailable";
const quantity = value => finite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "Not recorded";
const emptyAcknowledgments = () => ({ preliminary: false, warningCodes: [] });
const sameAnchors = (before, after) => before && before.project === after.project
  && before.savedProject === after.savedProject && before.inventory === after.inventory && before.settings === after.settings
  && before.contextKey === JSON.stringify(after.context);
const anchors = input => ({ ...input, contextKey: JSON.stringify(input.context) });

// Mirrors the page's own sectionTotal exactly: grand_total plus the held-aware
// cabinet and landscape totals. When recorded extras cannot be repriced the
// calc keeps the acknowledged project totals (or null) — never a silently
// guessed amount — so the proposal's before/after section rows report the same
// number the toolbar and estimate handoff see.
function section(input, project) {
  const calculation = calcProject(project, input.inventory, input.settings, { savedProject: input.savedProject });
  const base = calculation.totals.grand_total;
  const cabinetCost = calculation.totals.total_signage_cabinet_cost;
  const landscapeCost = calculation.totals.total_landscape_cost;
  const total = finite(base) && finite(cabinetCost) && finite(landscapeCost) ? base + cabinetCost + landscapeCost : null;
  return { calculation, total };
}

function proposalView(proposal, input, componentId) {
  const issues = [...proposal.issues], comparisons = proposal.comparisons;
  const proposedCost = proposal.projection?.itemCost;
  let before, after, sectionDelta = null;
  if (proposal.prepared && proposedCost) {
    try {
      const prepared = proposal.prepared;
      const project = { ...input.project, items: input.project.items.map(item => item.component_id === componentId ? {
        ...item, reinforcement_calculation_version: 2, reinforcement_design: prepared.design,
        reinforcement_material: prepared.material, custom_rebar_qty: prepared.overrides.quantity_ft,
        custom_rebar_cost_per_ft: prepared.overrides.cost_per_ft,
      } : item) };
      before = section(input, input.project);
      after = section(input, project);
      if (finite(before.total) && finite(after.total)) sectionDelta = after.total - before.total;
      if (after.calculation.catalogIssues.length || after.calculation.inputIssues.length) sectionDelta = null;
    } catch {
      sectionDelta = null;
    }
  }
  if (!finite(sectionDelta)) issues.push({
    code: "reinforcement_section_delta_unavailable", severity: "error",
    message: "The full Concrete section delta is unavailable. Resolve other design or catalog issues and refresh before accepting.",
  });
  const currentItem = before?.calculation.items.find(item => item.component_id === componentId);
  const currentProvenance = comparisons?.currentProvenance || "Current amount unavailable";
  const sectionProvenance = before?.calculation.catalogIssues.length || before?.calculation.inputIssues.length
    ? "Current section with acknowledged fallback amounts where unavailable" : "Current full Concrete section calculation";
  const row = (label, value, provenance) => ({ label, value: money(value), provenance });
  return {
    id: proposal.id, canAccept: proposal.canAccept && finite(sectionDelta), stale: false,
    warningCodes: [...(proposal.warningCodes || [])], issues,
    quantities: [
      { label: "Physical steel (ft)", before: quantity(currentItem?.rebar_geometry_feet), after: quantity(proposedCost?.rebar_geometry_feet) },
      { label: "Priced steel (ft)", before: quantity(currentItem?.rebar_feet), after: quantity(proposedCost?.rebar_feet) },
      { label: "Reinforcement labor (hr)", before: quantity(currentItem?.rebar_labor_hours), after: quantity(proposedCost?.rebar_labor_hours) },
    ],
    costs: [
      row("Current steel", comparisons?.steel.before, currentProvenance),
      row("Proposed steel", comparisons?.steel.proposed, "Fresh preliminary internal steel cost"),
      row("Steel delta", comparisons?.steel.delta, "Proposed minus current"),
      row("Current foundation", comparisons?.item.before, currentProvenance),
      row("Proposed foundation", comparisons?.item.proposed, "Fresh full foundation cost"),
      row("Foundation delta", comparisons?.item.delta, "Proposed minus current"),
      row("Current section", before?.total, sectionProvenance),
      row("Proposed section", after?.total, "Full Concrete section including signage and landscape"),
      row("Section delta", sectionDelta, "Proposed minus current; not a customer selling price"),
      row("Saved steel", comparisons?.savedSteel, "Acknowledged saved source"),
      row("Saved foundation", comparisons?.savedItem, "Acknowledged saved source"),
    ],
  };
}

// Parent owns the raw draft, acknowledged source, history and saves. This session
// owns only disposable previews/acknowledgments; acceptance is one parent commit.
export function createFoundationReinforcementEditorSession({ getCurrent, commit, createId, now, onChange = () => {} }) {
  const entries = new Map();
  let scope;
  const current = () => {
    const input = getCurrent();
    const nextScope = JSON.stringify([input.context?.ownerId, input.context?.sourceId,
      input.context?.estimateId, input.context?.generation]);
    if (scope !== nextScope) { entries.clear(); scope = nextScope; }
    return input;
  };
  const entryFor = id => {
    if (!entries.has(id)) entries.set(id, { acknowledgments: emptyAcknowledgments(), proposal: null, view: null, activeId: null, error: "" });
    return entries.get(id);
  };
  const findItem = (input, id) => {
    const matches = input.project?.items?.filter(item => item.component_id === id) || [];
    return matches.length === 1 ? matches[0] : null;
  };
  const allowed = (input, id) => input.context?.loaded === true && !input.blocked && Boolean(findItem(input, id));
  const report = (entry, message) => { entry.error = message; onChange(); return false; };
  const reset = entry => Object.assign(entry, { acknowledgments: emptyAcknowledgments(), proposal: null, view: null, activeId: null, error: "" });
  const edit = (id, update) => {
    const input = current(), entry = entryFor(id);
    if (!allowed(input, id)) return report(entry, "The editor context is unavailable or busy; no proposal was changed.");
    const item = findItem(input, id);
    const nextItem = update(item);
    const ok = commit(previous => ({ items: previous.items.map(record => record.component_id === id ? nextItem : record) }));
    if (ok !== true) return report(entry, "The proposal edit could not be committed in the current editor.");
    reset(entry); onChange(); return true;
  };
  return {
    read(id) {
      const input = current(), entry = entryFor(id), item = findItem(input, id);
      return {
        draft: item?.reinforcement_proposal ?? null,
        preview: entry.view ? { ...entry.view, stale: entry.activeId !== entry.proposal?.id || !sameAnchors(entry.anchors, input) } : null,
        acknowledgments: structuredClone(entry.acknowledgments), error: entry.error,
        disabled: !allowed(input, id),
      };
    },
    start(id) {
      return edit(id, item => ({ ...item, reinforcement_proposal: createFoundationReinforcementDraft(item) }));
    },
    changeDraft(id, draft) {
      if (!plain(draft)) return false;
      return edit(id, item => ({ ...item, reinforcement_proposal: structuredClone(draft) }));
    },
    discard(id) {
      return edit(id, item => { const next = { ...item }; delete next.reinforcement_proposal; return next; });
    },
    acknowledge(id, value) {
      const input = current(), entry = entryFor(id);
      if (!allowed(input, id) || !plain(value) || typeof value.preliminary !== "boolean"
        || !Array.isArray(value.warningCodes) || value.warningCodes.some(code => typeof code !== "string" || !code.trim())) return false;
      entry.acknowledgments = { preliminary: value.preliminary, warningCodes: [...new Set(value.warningCodes)] };
      entry.activeId = null; entry.error = ""; onChange(); return true;
    },
    preview(id) {
      const input = current(), entry = entryFor(id), item = findItem(input, id);
      if (!allowed(input, id) || !item?.reinforcement_proposal) return report(entry, "Start a proposal in the current editor before previewing.");
      try {
        const proposal = createFoundationReinforcementProposal({
          ...input, rawDraft: item.reinforcement_proposal, componentId: id, proposalId: createId(),
          acknowledgments: entry.acknowledgments,
        });
        entry.proposal = proposal; entry.view = proposalView(proposal, input, id);
        entry.activeId = proposal.id; entry.anchors = anchors(input); entry.error = "";
        onChange(); return true;
      } catch (error) { entry.activeId = null; return report(entry, error.message || "The proposal could not be calculated."); }
    },
    accept(id, requestedId) {
      const input = current(), entry = entryFor(id), item = findItem(input, id);
      if (!allowed(input, id) || !entry.view?.canAccept || !entry.activeId || requestedId !== entry.activeId
        || !sameAnchors(entry.anchors, input)) return report(entry, "Refresh and review the current proposal before accepting.");
      const activeProposalId = entry.activeId;
      entry.activeId = null;
      const result = acceptFoundationReinforcementProposal({
        ...input, rawDraft: item.reinforcement_proposal, acknowledgments: entry.acknowledgments,
        proposal: entry.proposal, requestedId, activeProposalId, acceptedAt: now(),
      });
      if (!result.ok) return report(entry, result.message);
      if (commit(() => result.project) !== true) return report(entry, "Acceptance could not be committed; refresh the proposal.");
      reset(entry); onChange(); return true;
    },
  };
}
