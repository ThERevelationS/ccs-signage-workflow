// src/components/estimator/estimatorModuleKeys.js
var ESTIMATOR_MODULE_KEYS = [
  { module_key: "foundation", label: "Concrete | Masonry | Pole", intake_shell: "implemented", reference: "FoundationAiIntake" },
  { module_key: "channel_letters", label: "Channel Letters", intake_shell: "queued", reference: null },
  { module_key: "maintenance", label: "Maintenance", intake_shell: "queued", reference: null },
  { module_key: "painting", label: "Painting", intake_shell: "queued", reference: null },
  { module_key: "laser", label: "Laser", intake_shell: "queued", reference: null },
  { module_key: "cnc", label: "CNC", intake_shell: "queued", reference: null },
  { module_key: "neon", label: "Neon", intake_shell: "queued", reference: null },
  { module_key: "vinyl", label: "Vinyl", intake_shell: "queued", reference: null }
];
var ESTIMATOR_MODULE_KEY_SET = new Set(ESTIMATOR_MODULE_KEYS.map((m) => m.module_key));
var INTAKE_SHELL_CONTRACT = {
  schema_version: 1,
  required_fields: ["schema_version", "module_key", "proposal_id", "base_project_revision", "brief", "operations", "assumptions", "questions", "issues", "evidence_refs"],
  operations_kind: "allowlisted discriminated union \u2014 never arbitrary entity writes, executable code or tool instructions",
  apply_contract: "schema-valid commit-merge via the module's apply path \u2014 never a silent apply",
  manual_paths: ["Use a template", "Build manually"],
  ai_path: "Start with AI",
  contract_version: "1.0.0"
};

// src/components/channelLetterInstall/channelIntakeShell.js
var CHANNEL_INTAKE_VERSION = 1;
var CHANNEL_MODULE_KEY = "channel_letters";
var CHANNEL_INTAKE_OPS = /* @__PURE__ */ new Set([
  "set_field",
  // {op, field, value} — a module field on the draft
  "add_item",
  // {op, item} — a line item for the estimate draft
  "flag_assumption",
  // {op, field, reason} — unverified fact needing review
  "add_question"
  // {op, question, field} — a follow-up the operator answers
]);
var setField = (field, value) => ({ op: "set_field", field, value });
var channelIntakeProposal = ({ interview = {}, brief = null, scope = null, projectRevision = null, proposal_id = null } = {}) => {
  const operations = [];
  for (const [k, v] of Object.entries(interview)) {
    if (v !== null && v !== void 0 && k !== "unverified_assumptions") {
      operations.push(setField(k, v));
    }
  }
  if (scope?.scope?.mode) operations.push(setField("fabrication_mode", scope.scope.mode));
  for (const s of scope?.scope?.optional_scopes || []) {
    operations.push(setField(`include_${s.key}`, true));
  }
  for (const a of [...brief?.assumptions || [], ...(interview.unverified_assumptions || []).map((u) => ({ field: u.field || u, reason: u.reason || "unverified" }))]) {
    operations.push({ op: "flag_assumption", field: a.field, reason: a.reason || "unverified" });
  }
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
    assumptions: [...brief?.assumptions || []],
    questions,
    issues: [...brief?.conflicts || [], ...scope?.issues || []],
    evidence_refs: brief?.facts ? Object.entries(brief.facts).flatMap(([field, rec]) => (rec.values || []).map((v) => ({ field, origin: v.origin, confidence: v.confidence ?? null }))) : [],
    ready: brief?.ready === true && (scope ? scope.resolvable === true : true),
    contract_version: CHANNEL_INTAKE_VERSION
  };
};
var validateChannelIntakeProposal = (p) => {
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
export {
  CHANNEL_INTAKE_OPS,
  CHANNEL_INTAKE_VERSION,
  CHANNEL_MODULE_KEY,
  channelIntakeProposal,
  validateChannelIntakeProposal
};
