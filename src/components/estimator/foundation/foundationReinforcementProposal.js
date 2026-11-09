import { calcItem } from "./foundationCalc";
import { foundationItemInputIssues } from "./foundationInputValidation";
import { foundationItemCatalogIssues } from "./foundationCatalogIntegrity";
import { prepareFoundationReinforcementDraft } from "./foundationReinforcementDraft";
import { calculateFoundationReinforcementItemProjection } from "./foundationReinforcementItemProjection";
import { encodeFoundationReinforcementBasis } from "./foundationReinforcementBasisKey";

const isRecord = value => value !== null && typeof value === "object"
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const identifier = value => typeof value === "string" && Boolean(value.trim()) && value.trim() === value && value.length <= 256;
const finite = value => typeof value === "number" && Number.isFinite(value);
const amount = (item, key) => finite(item?.[key]) ? item[key] : null;
const version = item => item.reinforcement_calculation_version == null ? 1 : item.reinforcement_calculation_version;
const DERIVED_ITEM_FIELDS = new Set([
  "concrete_volume_cy", "excavation_volume_cy", "concrete_bags", "rebar_feet", "rebar_weight_lbs",
  "concrete_cost", "concrete_rate", "rebar_cost", "rebar_rate", "excavation_cost", "excavation_hours",
  "forming_cost", "forming_qty", "pouring_cost", "finishing_cost", "finishing_hours", "item_total_cost",
  "rebar_material_cost", "rebar_labor_cost", "rebar_labor_hours", "rebar_geometry_feet",
  "rebar_geometry_weight_lbs", "rebar_connection_count", "reinforcement_cost_snapshot", "reinforcement_proposal",
  "support_count", "support_purchased_units", "support_packs", "support_material_cost",
  "support_labor_cost", "support_labor_hours", "support_cost",
]);
const DERIVED_PROJECT_FIELDS = new Set([
  "grand_total", "total_concrete_cost", "total_rebar_cost", "total_excavation_cost", "total_labor_cost",
  "total_equipment_cost", "total_forming_materials_cost", "total_pole_cost", "total_pole_painting_cost",
  "total_brick_cost", "total_fill_cost", "total_wall_cost", "total_wall_cap_cost",
  "total_signage_cabinet_cost", "total_landscape_cost", "concrete_delivery_snapshot", "builder_calculation",
]);
const rawProject = project => Object.fromEntries(Object.entries(project)
  .filter(([key]) => !DERIVED_PROJECT_FIELDS.has(key))
  .map(([key, value]) => [key, key === "items"
    ? value.map(item => Object.fromEntries(Object.entries(item).filter(([field]) => !DERIVED_ITEM_FIELDS.has(field))))
    : value]));
const compare = (before, proposed) => {
  const delta = before === null || proposed === null ? null : proposed - before;
  return { before, proposed, delta: finite(delta) ? delta : null };
};

// Local preview only. Parent supplies its non-undoable acknowledged source/context.
// Fingerprint equality is stale-result protection, never server authorization.
export function createFoundationReinforcementProposal({
  project, savedProject, inventory = [], settings = {}, context, componentId, rawDraft, proposalId,
  acknowledgments = {},
} = {}) {
  const issues = [];
  const issue = (code, message) => issues.push({ code, message, severity: "error", scope: "proposal" });
  const unavailable = () => ({
    version: 1, id: proposalId, componentId, basisKey: null, canAccept: false,
    engineeringApproved: false, issues, projection: null, comparisons: null,
  });
  if (!isRecord(project) || !Array.isArray(project.items) || project.items.some(item => !isRecord(item))
    || !isRecord(savedProject) || !Array.isArray(savedProject.items) || savedProject.items.some(item => !isRecord(item))) {
    issue("reinforcement_proposal_source_required", "Current raw design and acknowledged saved source are required.");
    return unavailable();
  }
  if (!isRecord(context) || context.loaded !== true || !identifier(context.ownerId) || !identifier(context.sourceId)
    || context.sourceId !== project.id || savedProject.id !== project.id
    || !identifier(context.sourceUpdatedAt) || savedProject.updated_date !== context.sourceUpdatedAt
    || !Number.isSafeInteger(context.generation) || context.generation < 0
    || !Number.isSafeInteger(context.editRevision) || context.editRevision < 0
    || !(context.estimateId === null || identifier(context.estimateId))
    || (context.estimateId !== null && !identifier(context.estimateUpdatedAt))) {
    issue("reinforcement_proposal_context_unavailable", "Reload or resolve the current owner, source acknowledgment and linked estimate revision before previewing.");
    return unavailable();
  }
  if (!identifier(componentId) || !identifier(proposalId)) {
    issue("reinforcement_proposal_identity_required", "Stable component and opaque proposal identities are required.");
    return unavailable();
  }
  const matches = project.items.filter(item => item.component_id === componentId);
  if (matches.length !== 1) {
    issue("reinforcement_proposal_component_ambiguous", "The target component is missing or has a duplicate ID.");
    return unavailable();
  }
  const item = matches[0], savedMatches = savedProject.items.filter(record => record.component_id === componentId);
  const savedItem = savedMatches.length === 1 ? savedMatches[0] : null;
  if (![1, 2].includes(version(item))) {
    issue("reinforcement_proposal_version_unsupported", "An unsupported active calculation version cannot be silently replaced.");
    return unavailable();
  }
  const preparation = prepareFoundationReinforcementDraft(rawDraft);
  issues.push(...preparation.issues);
  if (!preparation.prepared || preparation.issues.some(value => value.severity === "error")) return unavailable();
  const prepared = preparation.prepared;
  const calculate = (source, design, material, quantityOverride, rateOverride) =>
    calculateFoundationReinforcementItemProjection({ item: source, design, material, inventory, settings,
      excavationMethod: project.excavation_method, quantityOverride, rateOverride });
  const projection = calculate(item, prepared.design, prepared.material, prepared.overrides.quantity_ft, prepared.overrides.cost_per_ft);
  issues.push(...projection.issues);
  let current, currentProvenance;
  if (version(item) === 2) {
    const active = calculate(item, item.reinforcement_design, item.reinforcement_material, item.custom_rebar_qty, item.custom_rebar_cost_per_ft);
    current = active.canApplyToEstimate ? active.itemCost : null;
    currentProvenance = current ? "Current version-2 calculation" : "Acknowledged saved amount";
    current ??= savedItem;
  } else {
    const blocked = !isRecord(settings) || !Array.isArray(inventory) || inventory.some(row => !isRecord(row))
      || foundationItemInputIssues(item).length || foundationItemCatalogIssues(item, inventory).length;
    current = blocked ? savedItem : calcItem(item, project, inventory, settings, savedItem);
    currentProvenance = blocked ? "Acknowledged saved amount" : "Current legacy calculation";
  }
  const comparisons = {
    steel: compare(amount(current, "rebar_cost"), amount(projection.itemCost, "rebar_cost")),
    supports: compare(amount(current, "support_cost"), amount(projection.itemCost, "support_cost")),
    item: compare(amount(current, "item_total_cost"), amount(projection.itemCost, "item_total_cost")),
    savedSteel: amount(savedItem, "rebar_cost"), savedItem: amount(savedItem, "item_total_cost"),
    currentProvenance, savedProvenance: "Acknowledged saved source; not a customer selling price",
  };
  if (comparisons.steel.delta === null || comparisons.item.delta === null) {
    issue("reinforcement_proposal_delta_unavailable", "Both current steel and full item cost deltas must be known before replacement.");
  }
  const warningCodes = [...new Set(projection.issues.filter(value => value.severity === "warning").map(value => value.code))].sort();
  const warningAcknowledgments = Array.isArray(acknowledgments?.warningCodes) ? acknowledgments.warningCodes : [];
  if (acknowledgments?.preliminary !== true || warningCodes.some(code => !warningAcknowledgments.includes(code))) {
    issue("reinforcement_proposal_acknowledgment_required", "Explicitly acknowledge the preliminary-only status and every current warning before acceptance.");
  }
  let basisKey;
  try {
    basisKey = encodeFoundationReinforcementBasis({
      protocolRevision: 1, calculationRevision: "foundation-v2-proposal-1",
      context, componentId, project: rawProject(project), savedProject, inventory, settings,
      rawDraft, prepared, acknowledgments, proposedItemCost: projection.itemCost,
      comparisons,
    });
  } catch (error) {
    issue("reinforcement_proposal_basis_unavailable", error.message);
    basisKey = null;
  }
  return {
    version: 1, id: proposalId, componentId, basisKey, prepared, projection, comparisons, warningCodes, issues,
    engineeringApproved: false,
    canAccept: Boolean(basisKey && projection.canApplyToEstimate && !issues.some(value => value.severity === "error")),
  };
}

// Return one immutable parent commit; no history pushes, saves, or Builder writes.
export function acceptFoundationReinforcementProposal({ proposal, requestedId, activeProposalId, acceptedAt, ...currentInputs } = {}) {
  const reject = (code, message) => ({ ok: false, code, message, project: null });
  if (proposal?.version !== 1 || proposal.canAccept !== true || !identifier(requestedId)
    || requestedId !== activeProposalId || requestedId !== proposal.id
    || !identifier(proposal.componentId) || typeof proposal.basisKey !== "string" || !proposal.basisKey) {
    return reject("reinforcement_proposal_not_acceptable", "Use the exact currently eligible proposal; no design or price was changed.");
  }
  if (typeof acceptedAt !== "string" || !Number.isFinite(Date.parse(acceptedAt))) {
    return reject("reinforcement_acceptance_time_required", "An explicit acceptance timestamp is required.");
  }
  const fresh = createFoundationReinforcementProposal({ ...currentInputs, componentId: proposal.componentId, proposalId: requestedId });
  if (!fresh.basisKey || fresh.basisKey !== proposal.basisKey) {
    return reject("reinforcement_proposal_stale", "Inputs, context, source, settings or catalog changed. Refresh and review the full delta again.");
  }
  if (!fresh.canAccept) return reject("reinforcement_proposal_not_ready", "The fresh calculation is not eligible for replacement.");
  const { prepared, projection } = fresh;
  const nextItems = currentInputs.project.items.map(item => {
    if (item.component_id !== proposal.componentId) return item;
    const next = { ...item, ...projection.itemCost,
      reinforcement_calculation_version: 2,
      reinforcement_design: structuredClone(prepared.design),
      reinforcement_material: structuredClone(prepared.material),
      custom_rebar_qty: prepared.overrides.quantity_ft,
      custom_rebar_cost_per_ft: prepared.overrides.cost_per_ft,
      reinforcement_cost_snapshot: {
        version: 1, calculation_version: 2, engineering_approved: false,
        amounts: structuredClone(projection.reinforcement.steel.amounts),
        material: structuredClone(projection.reinforcement.materialSnapshot),
        basis: structuredClone(projection.reinforcement.basis),
        rate_sources: structuredClone(projection.reinforcement.rateSources),
        supports: structuredClone(projection.reinforcement.supports),
        cut_schedule: structuredClone(projection.reinforcement.cutSchedule),
      },
      reinforcement_acceptance: {
        version: 1, proposal_id: requestedId, accepted_at: acceptedAt,
        owner_id: currentInputs.context.ownerId, source_id: currentInputs.context.sourceId,
        component_id: proposal.componentId,
        source_updated_at: currentInputs.context.sourceUpdatedAt,
        acknowledged_warning_codes: [...fresh.warningCodes], engineering_approved: false,
      },
    };
    delete next.reinforcement_proposal;
    return next;
  });
  return { ok: true, code: "reinforcement_proposal_accepted_locally", project: { ...currentInputs.project, items: nextItems }, proposal: fresh };
}