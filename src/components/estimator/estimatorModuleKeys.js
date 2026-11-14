// W-012 (AI-01) — estimator module-key registry.
// The shared intake shell's module registry — every estimator module carries a
// `module_key` + an intake-shell status. The foundation module is the reference
// implementation; the seven OTHER modules are queued (NEEDS-OPERATOR — a
// module-rollout decision is required before their intake shells ship).
//
// The registry is the canonical `module_key` list — a proposal's `module_key`
// MUST be one of these values; `foundationModuleProposal` validates the
// foundation module's key (`module_key !== "foundation"` fails the proposal).
// A queued module's `intake_shell` is `queued` — its intake shell is not
// implemented; the foundation shell is the reference contract the queued
// modules adopt on rollout.

export const ESTIMATOR_MODULE_KEYS = [
  { module_key: "foundation", label: "Concrete | Masonry | Pole", intake_shell: "implemented", reference: "FoundationAiIntake" },
  { module_key: "channel_letters", label: "Channel Letters", intake_shell: "queued", reference: null },
  { module_key: "maintenance", label: "Maintenance", intake_shell: "queued", reference: null },
  { module_key: "painting", label: "Painting", intake_shell: "queued", reference: null },
  { module_key: "laser", label: "Laser", intake_shell: "queued", reference: null },
  { module_key: "cnc", label: "CNC", intake_shell: "queued", reference: null },
  { module_key: "neon", label: "Neon", intake_shell: "queued", reference: null },
  { module_key: "vinyl", label: "Vinyl", intake_shell: "queued", reference: null },
];

export const ESTIMATOR_MODULE_KEY_SET = new Set(ESTIMATOR_MODULE_KEYS.map((m) => m.module_key));

// `estimatorModuleKey(key)` — the registry row for a module key, or null for an
// unknown key. A proposal's `module_key` MUST match a registry row's
// `module_key` — an unknown key is a `module_key_mismatch` on the proposal.
export function estimatorModuleKey(key) {
  return ESTIMATOR_MODULE_KEYS.find((m) => m.module_key === key) || null;
}

// `estimatorIntakeShellStatus(key)` — the module's intake-shell status
// (`implemented` | `queued`). A queued module's intake shell is not
// implemented — the foundation shell is the reference contract.
export function estimatorIntakeShellStatus(key) {
  return estimatorModuleKey(key)?.intake_shell || null;
}

// `INTAKE_SHELL_CONTRACT` — the shared intake shell's contract, the canonical
// reference the queued modules adopt on rollout. The foundation shell
// (`FoundationAiIntake`) is the reference implementation; a queued module's
// intake shell MUST carry the same shape: free-text -> InvokeLLM parse ->
// scene-fed contradiction check -> catalog-fed assembly proposal -> grouped
// follow-ups -> editable proposal -> apply-preview -> schema-valid
// commit-merge -> revision language; the empty-state mode chooser keeps "Use a
// template" + "Build manually" always available alongside "Start with AI".
export const INTAKE_SHELL_CONTRACT = {
  schema_version: 1,
  required_fields: ["schema_version", "module_key", "proposal_id", "base_project_revision", "brief", "operations", "assumptions", "questions", "issues", "evidence_refs"],
  operations_kind: "allowlisted discriminated union — never arbitrary entity writes, executable code or tool instructions",
  apply_contract: "schema-valid commit-merge via the module's apply path — never a silent apply",
  manual_paths: ["Use a template", "Build manually"],
  ai_path: "Start with AI",
  contract_version: "1.0.0",
};

// W-024 (AI-12) — per-module model-pin doc: every estimator module's AI path
// pins the shared flagship `ESTIMATOR_AI_MODEL` (base44/shared/
// estimatorAiModelPolicy.js) — a module NEVER picks its own model. Queued
// modules adopt the same pin on rollout. NOTE: the shared policy's
// `ESTIMATOR_AI_MODULE_KEYS` list (`metal`) and this registry (`neon`/`cnc`)
// disagree on one key — `estimatorAiModelFor("neon")` throws today; the
// module-key gate is the registry, and the drift is documented rather than
// silently harmonized (a wrong key MUST keep throwing).
export const MODULE_MODEL_PINS = Object.freeze(
  Object.fromEntries(ESTIMATOR_MODULE_KEYS.map((m) => [m.module_key, "ESTIMATOR_AI_MODEL (pinned shared flagship)"]))
);

// W-016 (AI-04) — the operations discriminated-union doc + issues field
// schema, named so consumers read the contract at the boundary: a proposal's
// `operations` is an allowlisted discriminated union `[{kind, target, payload}]`
// — never arbitrary entity writes, executable code, or tool instructions; the
// validation's `issues` is `[{field, code, message}]` — a structured list,
// never a prose error string.
export const MODULE_OPERATIONS_UNION_DOC = Object.freeze({
  operations: "allowlisted discriminated union [{kind, target, payload}] — kinds are module-scoped (foundation: set_field/add_item/flag_assumption/add_question), never arbitrary writes/code/tool calls",
  issues: "structured [{field, code, message}] — the field the issue binds, the machine code, the human message; never a prose error string",
});

// W-017 (AI-05) — the apply contract: a proposal applies ONLY via the
// module's apply path — validate (schema + module_key + stale
// base_project_revision check) -> apply-preview (the diff is visible) ->
// explicit operator apply -> schema-valid commit-merge. A proposal NEVER
// silently applies; a stale base_project_revision refuses the apply.
export const MODULE_APPLY_CONTRACT = Object.freeze({
  flow: "validate -> apply-preview -> explicit operator apply -> commit-merge",
  stale_check: "base_project_revision must equal the current project revision or the apply is refused",
  silent_apply: "never possible — apply requires the operator's explicit action",
});

// W-018 (AI-06) — calculators own money: the parse schema carries NO price
// fields (a parsed proposal can name geometry/materials, never a cost), and
// the apply-preview carries NO cost display — the module's calculator is the
// only money surface. A proposal that names a price is discarded, never
// trusted.
export const PARSE_NO_PRICE_DOC = Object.freeze({
  parse_schema: "no price/cost properties — the LLM never proposes money",
  apply_preview: "no cost display — preview shows geometry/scope diffs only",
  owning_surface: "the module's calculator prices; the AI proposes structure",
});

// W-019 (AI-08) — retry doc: parse calls are interval-gated
// (PARSE_MIN_INTERVAL_MS — a retry can't hammer the service), a late response
// is dropped via the stale_response token guard (a superseded parse never
// lands), and apply is idempotent on `apply_receipt_id` (a retried apply is a
// no-op, never a double-write).
export const PARSE_RETRY_DOC = Object.freeze({
  interval_gate: "PARSE_MIN_INTERVAL_MS between parse calls",
  stale_guard: "stale_response token — a superseded response is dropped, never applied",
  apply_idempotency: "apply_receipt_id makes a retried apply a no-op",
});

// W-021 (AI-09) — secure-parsing doc: script execution is NEVER possible —
// proposals are data (JSON), operations are allowlisted kinds, no `eval`/
// `Function`/tool dispatch exists in the apply path. A hostile proposal can
// only ever produce held validation issues, never execute.
export const SECURE_PARSING_DOC = Object.freeze({
  script_execution: "never possible — no eval/Function/tool dispatch in the apply path",
  proposal_shape: "JSON data only; operations are allowlisted discriminated-union kinds",
  hostile_input: "worst case is a held validation issue, never execution",
});

// W-020 (AI-10) — the estimatorDesignAction request shape + dispatch seam:
// the local contract is `validated proposal -> dispatch seam -> backend
// function`; `meta.backend_dispatched` on the proposal records whether the
// apply was dispatched (the flag rides the meta, never fabricated). The
// backend owns the authoritative write — the local path is the proposal +
// validation seam.
export const ESTIMATOR_DESIGN_ACTION_CONTRACT = Object.freeze({
  request_shape: "{ proposal, validated_issues, base_project_revision } -> dispatched apply",
  dispatch_seam: "validated proposal -> seam -> backend (backend owns the write)",
  backend_dispatched_flag: "meta.backend_dispatched records dispatch state, never fabricated",
});

// `MODULE_QUESTION_MAP` — the per-module question-map scaffold. Each module's
// intake asks its module-specific questions (the foundation module's map is
// the reference); a queued module's map is a scaffold — the questions name the
// module's required facts without an implemented intake shell.
export const MODULE_QUESTION_MAP = {
  foundation: ["sign style/weight", "mounting", "site constraints", "scope", "budget"],
  // P-02: channel_letters is implemented — the map mirrors the interview
  // contract's required facts (channelInterviewModel.CHANNEL_INTERVIEW_FIELDS).
  channel_letters: ["letter text/font/artwork", "count/height/depth/type", "faces/returns/backs/illumination/finish", "mounting substrate + raceway/backer", "access/height/environment", "electrical scope/access"],
  maintenance: ["service interval", "scope (cleaning/repair/lamp)", "access", "budget"],
  painting: ["surface area", "prep level", "coating type", "site access", "budget"],
  laser: ["material", "thickness", "detail level", "quantity", "budget"],
  cnc: ["material", "thickness", "detail level", "quantity", "budget"],
  neon: ["letter height", "tube color", "mounting type", "site access", "budget"],
  vinyl: ["surface area", "vinyl type", "print vs cut", "site access", "budget"],
};
