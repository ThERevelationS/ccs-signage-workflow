// W-017 (AI-06) -- shared proposal validate/apply seam for the conversational
// intake. `validateFoundationProposal(proposal)` is a PURE checker -- it
// returns field/object issues and never touches project state; a valid
// proposal then applies through `commit`, which carries the schema-valid +
// undo contract itself.
const ITEM_TYPES = ["spread_foot", "drilled_pier", "continuous", "pillar"];
const DIMENSION_KEYS = ["length_inches", "width_inches", "diameter", "depth_inches"];

export function validateFoundationProposal(proposal) {
  const issues = [];
  const issue = (field, code, message) => issues.push({ field, code, message });
  if (!proposal || typeof proposal !== "object") {
    issue("proposal", "proposal_malformed", "The proposal is malformed.");
    return { valid: false, issues };
  }
  if (proposal.module_key !== "foundation") {
    issue("module_key", "module_key_mismatch", "This proposal is for a different module.");
  }
  if (!Number.isInteger(proposal.schema_version) || proposal.schema_version < 1) {
    issue("schema_version", "schema_version_invalid", "A supported schema_version is required.");
  }
  const items = Array.isArray(proposal.items) ? proposal.items : [];
  const poles = Array.isArray(proposal.poles) ? proposal.poles : [];
  items.forEach((it, i) => {
    if (!it || typeof it !== "object") { issue(`items[${i}]`, "item_malformed", "Item is malformed."); return; }
    if (it.foundation_type != null && !ITEM_TYPES.includes(it.foundation_type)) {
      issue(`items[${i}].foundation_type`, "foundation_type_invalid", "A supported foundation type is required.");
    }
    DIMENSION_KEYS.forEach((k) => {
      const v = it[k];
      if (v != null && v !== "" && !(Number.isFinite(Number(v)) && Number(v) > 0)) {
        issue(`items[${i}].${k}`, "dimension_invalid", "Use a finite positive number.");
      }
    });
    if (!DIMENSION_KEYS.some((k) => Number.isFinite(Number(it[k])) && Number(it[k]) > 0)) {
      issue(`items[${i}]`, "item_dimensionless", "A foundation needs at least one positive dimension.");
    }
  });
  poles.forEach((p, i) => {
    if (!p || typeof p !== "object") { issue(`poles[${i}]`, "pole_malformed", "Pole is malformed."); return; }
    const h = p.height_inches;
    if (h == null || h === "" || !(Number.isFinite(Number(h)) && Number(h) > 0)) {
      issue(`poles[${i}].height_inches`, "pole_height_invalid", "A finite positive pole height is required.");
    }
  });
  if (!items.length && !poles.length) {
    issue("proposal", "proposal_empty", "The proposal has no foundations or poles to apply.");
  }
  return { valid: issues.length === 0, issues };
}
