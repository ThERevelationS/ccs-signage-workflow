const fs = require("fs");
const p = "ESTIMATOR_MASTERPLAN.md";
let s = fs.readFileSync(p, "utf8");
const rep = (find, add) => {
  const idx = s.indexOf(find);
  if (idx === -1) { console.log("MISS:", find.slice(0, 60)); return; }
  s = s.slice(0, idx + find.length) + add + s.slice(idx + find.length);
  console.log("OK:", find.slice(0, 60));
};

// Lane B rows — append (landed) to each unmarked subunit
rep("`model_policy_version` field on proposals |", " (landed) |");
rep("per-module model-pin doc; `model_policy_version` field on proposals (landed) |", "");
rep("`operations` discriminated-union doc; `issues` field schema |", " — both landed in `FOUNDATION_AI_OUTPUT_CONTRACT` (6af3fe19) |");
rep("`applyModuleProposal` contract doc; `base_project_revision` stale-check (landed) |", " — `MODULE_APPLY_CONTRACT` in estimatorModuleKeys |");
rep("`PARSE_SCHEMA` no-price-fields doc; `apply-preview` no-cost doc |", " — `PARSE_NO_PRICE_DOC` |");
rep("`retry` doc | network-failure", " — `PARSE_RETRY_DOC` | network-failure");
rep("`script_execution` never-possible doc |", " — `SECURE_PARSING_DOC` |");
rep("`estimatorDesignAction` request-shape doc; `dispatch_seam` local contract; `backend_dispatched` flag |", " — `ESTIMATOR_DESIGN_ACTION_CONTRACT`; `backend_dispatched` landed (6af3fde) |");

// Lane C missed marks
rep("`unavailable_service` injection case; `stale_response` injection case; `malformed_response` injection case; `rate_limited` injection case |",
    " — all four landed in the eval harness (6af3f919 + malformed_response case) |");
rep("per-domain source-group docs | — |\n| O-103", " (landed) | — |\n| O-103");
rep("per-domain class-badge docs | — |", " (landed) | — |");

// Lane F rows — mark each named subunit
rep("`stage:` marker on each ledger entry; `plan/audit/research/implementation/verification` stage docs |",
    " (landed — fixture enforces); `plan/audit/research/implementation/verification` stage docs (landed — Lane F conventions) |");
rep("`root-ledger-is-source` doc; `module-spec-is-detail` doc |", " (both landed — Lane F conventions) |");
rep("`status-parser-unchanged` doc; `parser-contract` fixture |", " (landed — conventions + status fixture) |");
rep("`sandbox-complete-vs-published` doc; `published-gate` marker |", " (both landed — Lane F conventions) |");
rep("`lead+one-worker` doc; `worker-count` fixture |", " (both landed — Lane F conventions) |");
rep("`test-estimator-masterplan-status.mjs` (landed); `test-estimator-masterplan-evidence.mjs`; `test-estimator-masterplan-aliases.mjs` |",
    "; `test-estimator-masterplan-evidence.mjs` (landed); `test-estimator-masterplan-aliases.mjs` (landed) |");
rep("`dashboard-is-local` doc; `no-provider-polling` marker |", " (both landed — Lane F conventions) |");
rep("`preserve-hooks` doc; `no-always-running-loops` marker |", " (both landed — Lane F conventions) |");

fs.writeFileSync(p, s);
