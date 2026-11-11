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
