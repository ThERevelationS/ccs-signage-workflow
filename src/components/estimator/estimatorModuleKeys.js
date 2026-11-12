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
