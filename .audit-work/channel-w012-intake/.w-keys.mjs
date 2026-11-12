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
function estimatorModuleKey(key) {
  return ESTIMATOR_MODULE_KEYS.find((m) => m.module_key === key) || null;
}
function estimatorIntakeShellStatus(key) {
  return estimatorModuleKey(key)?.intake_shell || null;
}
var INTAKE_SHELL_CONTRACT = {
  schema_version: 1,
  required_fields: ["schema_version", "module_key", "proposal_id", "base_project_revision", "brief", "operations", "assumptions", "questions", "issues", "evidence_refs"],
  operations_kind: "allowlisted discriminated union \u2014 never arbitrary entity writes, executable code or tool instructions",
  apply_contract: "schema-valid commit-merge via the module's apply path \u2014 never a silent apply",
  manual_paths: ["Use a template", "Build manually"],
  ai_path: "Start with AI",
  contract_version: "1.0.0"
};
var MODULE_QUESTION_MAP = {
  foundation: ["sign style/weight", "mounting", "site constraints", "scope", "budget"],
  // P-02: channel_letters is implemented — the map mirrors the interview
  // contract's required facts (channelInterviewModel.CHANNEL_INTERVIEW_FIELDS).
  channel_letters: ["letter text/font/artwork", "count/height/depth/type", "faces/returns/backs/illumination/finish", "mounting substrate + raceway/backer", "access/height/environment", "electrical scope/access"],
  maintenance: ["service interval", "scope (cleaning/repair/lamp)", "access", "budget"],
  painting: ["surface area", "prep level", "coating type", "site access", "budget"],
  laser: ["material", "thickness", "detail level", "quantity", "budget"],
  cnc: ["material", "thickness", "detail level", "quantity", "budget"],
  neon: ["letter height", "tube color", "mounting type", "site access", "budget"],
  vinyl: ["surface area", "vinyl type", "print vs cut", "site access", "budget"]
};
export {
  ESTIMATOR_MODULE_KEYS,
  ESTIMATOR_MODULE_KEY_SET,
  INTAKE_SHELL_CONTRACT,
  MODULE_QUESTION_MAP,
  estimatorIntakeShellStatus,
  estimatorModuleKey
};
