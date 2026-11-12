// W-012 + P-02/P-03/P-08 (WS-P): channel_letters is the first module
// implementing the shared intake-shell contract. `channelIntakeProposal`
// wraps the interview/brief/alternatives pipeline into the
// INTAKE_SHELL_CONTRACT shape; `validateChannelIntakeProposal` is the
// schema-valid gate the apply path requires before commit-merge — operations
// are an allowlisted discriminated union, never arbitrary writes.
import { INTAKE_SHELL_CONTRACT } from "../estimator/estimatorModuleKeys.js";

export const CHANNEL_INTAKE_VERSION = 1;
export const CHANNEL_MODULE_KEY = "channel_letters";

// The only operations a channel-letters intake proposal may carry.
export const CHANNEL_INTAKE_OPS = new Set([
  "set_field",        // {op, field, value} — a module field on the draft
  "add_item",         // {op, item} — a line item for the estimate draft
  "flag_assumption",  // {op, field, reason} — unverified fact needing review
  "add_question",     // {op, question, field} — a follow-up the operator answers
]);

const setField = (field, value) => ({ op: "set_field", field, value });

// Compose the contract-shaped proposal from pipeline outputs.
// inputs: {interview (sanitized), brief (channelBriefProposal result),
//          scope (resolveChannelScope result), projectRevision, proposal_id}
export const channelIntakeProposal = ({ interview = {}, brief = null, scope = null, projectRevision = null, proposal_id = null } = {}) => {
  const operations = [];
  // Answered interview facts become set_field ops (absent facts emit none).
  for (const [k, v] of Object.entries(interview)) {
    if (v !== null && v !== undefined && k !== "unverified_assumptions") {
      operations.push(setField(k, v));
    }
  }
  // Scope-mode selection -> a set_field op naming the fabrication mode.
  if (scope?.scope?.mode) operations.push(setField("fabrication_mode", scope.scope.mode));
  for (const s of scope?.scope?.optional_scopes || []) {
    operations.push(setField(`include_${s.key}`, true));
  }
  // Unverified facts -> explicit flag_assumption ops.
  for (const a of [...(brief?.assumptions || []), ...((interview.unverified_assumptions || []).map((u) => ({ field: u.field || u, reason: u.reason || "unverified" })))]) {
    operations.push({ op: "flag_assumption", field: a.field, reason: a.reason || "unverified" });
  }
  // Missing required facts -> follow-up questions.
  const questions = [];
  for (const i of brief?.conflicts || []) {
    questions.push({ field: i.field, question: `Resolve conflicting ${i.field} across sources.`, kind: "conflict" });
    operations.push({ op: "add_question", question: `Resolve conflicting ${i.field} across sources.`, field: i.field });
  }

  return {
    schema_version: INTAKE_SHELL_CONTRACT.schema_version,
    module_key: CHANNEL_MODULE_KEY,
    proposal_id: proposal_id || `cip_${Date.now().toString(36)}`,
    base_project_revision: projectRevision,
    brief: { facts: brief?.facts || {}, scale: brief?.scale || null, ready: brief?.ready === true },
    operations,
    assumptions: [...(brief?.assumptions || [])],
    questions,
    issues: [...(brief?.conflicts || []), ...(scope?.issues || [])],
    evidence_refs: (brief?.facts ? Object.entries(brief.facts).flatMap(([field, rec]) =>
      (rec.values || []).map((v) => ({ field, origin: v.origin, confidence: v.confidence ?? null }))) : []),
    ready: brief?.ready === true && (scope ? scope.resolvable === true : true),
    contract_version: CHANNEL_INTAKE_VERSION,
  };
};

// Schema gate — the apply path calls this before commit-merge. Every
// required field must exist, module_key must be channel_letters, and every
// operation must be one of the allowlisted kinds.
export const validateChannelIntakeProposal = (p) => {
  const issues = [];
  if (!p || typeof p !== "object") return { valid: false, issues: [{ kind: "schema", message: "not an object" }] };
  for (const f of INTAKE_SHELL_CONTRACT.required_fields) {
    if (!(f in p)) issues.push({ kind: "schema", field: f, message: `missing required field '${f}'` });
  }
  if (p.module_key !== CHANNEL_MODULE_KEY) issues.push({ kind: "schema", field: "module_key", message: `module_key '${p.module_key}' != '${CHANNEL_MODULE_KEY}'` });
  for (const [i, op] of (p.operations || []).entries()) {
    if (!op || !CHANNEL_INTAKE_OPS.has(op.op)) issues.push({ kind: "operation", index: i, message: `operation '${op?.op}' is not in the channel allowlist` });
  }
  return { valid: issues.length === 0, issues };
};
