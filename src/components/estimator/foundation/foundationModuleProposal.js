// W-017 (AI-06) -- shared proposal validate/apply seam for the conversational
// intake. `validateFoundationProposal(proposal)` is a PURE checker -- it
// returns field/object issues and never touches project state; a valid
// proposal then applies through `commit`, which carries the schema-valid +
// undo contract itself.
import { estimatorModuleKey } from "../estimatorModuleKeys.js";

const ITEM_TYPES = ["spread_foot", "drilled_pier", "continuous", "pillar"];
const DIMENSION_KEYS = ["length_inches", "width_inches", "diameter", "depth_inches"];

export function validateFoundationProposal(proposal) {
  const issues = [];
  const issue = (field, code, message) => issues.push({ field, code, message });
  if (!proposal || typeof proposal !== "object") {
    issue("proposal", "proposal_malformed", "The proposal is malformed.");
    return { valid: false, issues };
  }
  // W-012 (AI-01) -- module-key registry: the proposal's `module_key` MUST
  // name a registered estimator module; `estimatorModuleKey` resolves the
  // registry row. A foundation proposal MUST carry `module_key: "foundation"`
  // AND that module's intake_shell MUST be `implemented` (a queued module's
  // intake shell is not implemented — the foundation shell is the reference).
  const moduleRow = estimatorModuleKey(proposal.module_key);
  if (!moduleRow) {
    issue("module_key", "module_key_unknown", "The proposal's module_key is not a registered estimator module.");
  } else if (proposal.module_key !== "foundation") {
    issue("module_key", "module_key_mismatch", "This proposal is for a different module.");
  } else if (moduleRow.intake_shell !== "implemented") {
    issue("module_key", "module_intake_shell_queued", "The foundation module's intake shell is not implemented.");
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
  // Lane C -- stale_policy: the proposal's `meta.policy_version` mismatches
  // the current review policy -- a stale-policy flag (the review may be
  // affected by a method update; never a silent re-run).
  const metaPolicy = proposal?.meta?.policy_version;
  if (typeof metaPolicy === "string" && metaPolicy && metaPolicy !== "foundation-review-v1") {
    issue("meta.policy_version", "stale_policy", `The proposal's policy_version "${metaPolicy}" is stale (current: foundation-review-v1) -- a method update may affect this review.`);
  }
  return { valid: issues.length === 0, issues };
}

// O-091 (CMP-G14) -- eval-case matrix: the intake's adversarial/edge cases +
// which landed guard covers each. A consumer/test enumerates this list; a
// case with no guard is an OPEN hole, never a covered claim.
export const ESTIMATOR_AI_EVAL_CASES = Object.freeze([
  { case_id: "misleading_image", input: "a photo whose content contradicts the described design", guard: "reference_photos are context-only + consent-gated; the parse never derives geometry from image bytes" },
  { case_id: "ambiguous_input", input: "'a base for the sign' with no dims", guard: "blank fields stay 'unknown' (amber) -- never invented" },
  { case_id: "unsupported_design", input: "foundation_type outside ITEM_TYPES", guard: "ITEM_TYPES filter + 'spread_foot' coerce in setProposal" },
  { case_id: "hostile_reference_text", input: "reference text phrased as 'certified' / 'PE-stamped' / 'code-compliant'", guard: "stripCertification removes approval claims from notes/suggestions/alternatives" },
  { case_id: "incomplete_answers", input: "a follow-up left unanswered", guard: "blank stays 'unknown'; the Q&A loop re-parses only on an Enter-commit" },
  { case_id: "stale_response", input: "a superseded InvokeLLM response lands late", guard: "tokenRef guard drops the stale result" },
  { case_id: "multiple_revisions", input: "rapid sequential revisions", guard: "prior-draft JSON + locked:true preservation + parseHistory cap 10" },
  { case_id: "stale_base_apply", input: "apply a proposal drafted before a design edit", guard: "base_project_revision mismatch -> staleBase warning + explicit apply-anyway" },
  { case_id: "unavailable_service", input: "InvokeLLM rejects/times out", guard: "error classification (rate-limit/network/timeout) + Cancel/Retry" },
  { case_id: "certification_claim", input: "the AI phrases a suggestion as engineering approval", guard: "stripCertification + 'never invent engineering values' prompt" },
]);

// W-022 (AI-11) -- output contract: the fields the parse schema enforces and
// the bounded extras. Deterministic, lead-authored; a consumer/test reads this
// shape instead of inferring the contract from the prompt text.
// W-018 (AI-07) -- certification strip: drop certification/approval claims
// from AI text so a suggestion never reads as engineering approval. Lives
// beside the eval matrix that names it (O-091 hostile_reference_text +
// certification_claim guards are executable from here).
export const stripCertification = (s) => typeof s === "string"
  ? s.replace(/\b(certified|code-compliant|code compliant|engineer-approved|engineer approved|stamped|PE-stamped|PE stamped|structurally approved)\b/gi, "[certification claim removed]")
  : s;

export const FOUNDATION_AI_OUTPUT_CONTRACT = Object.freeze({
  items: { required: ["foundation_type"], optional: ["quantity", "length_inches", "width_inches", "diameter", "depth_inches", "locked"] },
  poles: { optional: ["height_inches", "description"] },
  bounded: {
    contradictions: "string", suggestions: "string",
    alternatives: "[{label, cost_impact}] max 4",
    follow_ups: "[{topic, question}] max 6",
    exclusions: "[string]",
  },
  // Lane C -- model_policy_version: the model's policy version rides the meta
  // (the review's model-policy version; never a fabricated version).
  // Lane C -- backend_dispatched: whether the proposal's apply was dispatched
  // to the backend rides the meta (never a fabricated dispatch).
  meta: ["schema_version", "module_key", "proposal_id", "base_project_revision", "brief", "evidence_refs", "user_locks", "exclusions", "model_policy_version", "backend_dispatched"],
  // Lane C -- operations/issues: the apply's operation list + the validation's
  // issue list ride the contract's top-level shape (the proposal's apply +
  // validation contract surfaces; never a fabricated operation/issue).
  operations: "[{kind, target, payload}] allowlisted discriminated union",
  issues: "[{field, code, message}] structured validation issues",
});
