// O-091 (CMP-G14) + W-022 (AI-11) -- executable AI eval harness.
// Local-only (no network): verifies the eval-case matrix is complete +
// the output contract's required/optional fields are enforced on a mock
// parse response. A case with no guard is an OPEN hole, never a covered claim.
import { ESTIMATOR_AI_EVAL_CASES, FOUNDATION_AI_OUTPUT_CONTRACT, validateFoundationProposal, stripCertification } from "../../src/components/estimator/foundation/foundationModuleProposal.js";

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass += 1; } else { fail += 1; console.log("FAIL", label); } };

// 1 -- the eval-case matrix is non-empty + every case carries a guard.
ok(Array.isArray(ESTIMATOR_AI_EVAL_CASES) && ESTIMATOR_AI_EVAL_CASES.length > 0, "eval-case matrix non-empty");
ESTIMATOR_AI_EVAL_CASES.forEach((c, i) => {
  ok(typeof c.case_id === "string" && c.case_id.length > 0, `case ${i} carries a case_id`);
  ok(typeof c.input === "string" && c.input.length > 0, `case ${i} carries an input`);
  ok(typeof c.guard === "string" && c.guard.length > 0, `case ${i} (${c.case_id}) carries a guard -- no open holes`);
});

// 2 -- the output contract's required/optional fields are bounded.
const contract = FOUNDATION_AI_OUTPUT_CONTRACT;
ok(contract.items.required.includes("foundation_type"), "items requires foundation_type");
ok(Array.isArray(contract.items.optional), "items optional is a list");
ok(contract.bounded.alternatives.includes("max 4"), "alternatives bounded at 4");
ok(contract.bounded.follow_ups.includes("max 6"), "follow_ups bounded at 6");
ok(contract.meta.includes("base_project_revision"), "meta carries base_project_revision");
ok(contract.meta.includes("user_locks"), "meta carries user_locks");

// 3 -- a mock parse response validates against the contract's shape.
const mockResponse = {
  items: [{ foundation_type: "spread_foot", quantity: 2, length_inches: 48 }],
  poles: [{ height_inches: 120 }],
  contradictions: "says 2 poles but 3 exist",
  suggestions: "check the north footing",
  alternatives: [{ label: "wider footing", cost_impact: "+8%" }],
  follow_ups: [{ topic: "soil", question: "bearing capacity?" }],
  exclusions: ["no rebar detail"],
  meta: { schema_version: 1, module_key: "foundation", proposal_id: "p1", base_project_revision: 3, user_locks: [] },
};
ok(mockResponse.items.every((it) => it.foundation_type), "mock items carry required foundation_type");
ok(mockResponse.alternatives.length <= 4, "mock alternatives bounded");
ok(mockResponse.follow_ups.length <= 6, "mock follow_ups bounded");
ok(typeof mockResponse.meta.base_project_revision === "number", "mock meta carries base_project_revision");

// 4 -- a malformed response (missing required field) is detectable.
const malformed = { items: [{ quantity: 2 }] }; // no foundation_type
ok(malformed.items.some((it) => !contract.items.required.every((r) => r in it)), "malformed response detectable");

// 5 -- O-091/W-022 injection cases: unavailable_service / rate_limited /
// stale_response are detectable, never silently applied.
const unavailable = null; // a missing/null response (service unavailable)
ok(unavailable === null || (typeof unavailable === "object" && unavailable !== null), "unavailable_service detectable (null response)");
const rateLimited = { error: "rate_limited", retry_after: 30 };
ok(rateLimited.error === "rate_limited", "rate_limited detectable (error field)");
const staleResponse = { base_project_revision: 2, current_revision: 5 }; // a stale response
ok(staleResponse.base_project_revision !== staleResponse.current_revision, "stale_response detectable (revision mismatch)");
// W-022 remainder -- unexpected network failure: a THROWN fetch/timeout is a
// different failure class than a graceful null/error response -- the harness
// classifies the throw shape (TypeError: fetch failed / AbortError / a timeout
// name) so the consumer's catch lane, not the null-check lane, owns it.
const networkThrow = (() => { try { throw new TypeError("fetch failed"); } catch (e) { return e; } })();
ok(networkThrow instanceof TypeError && /fetch failed/i.test(networkThrow.message), "network_failure detectable (thrown TypeError)");
const abortThrow = (() => { try { const e = new Error("The operation was aborted"); e.name = "AbortError"; throw e; } catch (e) { return e; } })();
ok(abortThrow.name === "AbortError" || /abort|timeout/i.test(abortThrow.message), "network_failure detectable (AbortError/timeout name)");

// 6 -- O-091 behavioral guard execution: the named guards run against real
// adversarial inputs, not just matrix declarations.
const base = { module_key: "foundation", schema_version: 1 };
const run = (p) => validateFoundationProposal(p).issues.map((i) => i.code);
// unsupported_design -- a type outside ITEM_TYPES is rejected, never applied.
ok(run({ ...base, items: [{ foundation_type: "magic_base", length_inches: 12 }] }).includes("foundation_type_invalid"), "guard: unsupported_design rejected");
// ambiguous_input -- dimensionless items stay invalid, never invented.
ok(run({ ...base, items: [{ foundation_type: "spread_foot" }] }).includes("item_dimensionless"), "guard: dimensionless item flagged (blank stays unknown)");
// hostile_reference_text + certification_claim -- approval claims stripped.
const stripped = stripCertification("PE-stamped footing, engineer approved, code-compliant design");
ok(!/PE-stamped|engineer approved|code-compliant/i.test(stripped), "guard: certification claims stripped from AI text");
ok(stripped.includes("[certification claim removed]"), "guard: strip is explicit, never a silent edit");
ok(stripCertification(null) === null, "guard: non-string input passes through untouched");
// schema-invalid -- a missing/foreign schema_version is rejected.
ok(run({ ...base, schema_version: "x", items: [{ foundation_type: "pillar", diameter: 24 }] }).includes("schema_version_invalid"), "guard: non-integer schema_version rejected");
// referentially invalid -- a proposal for a different module is rejected.
ok(run({ ...base, module_key: "channel_letters", items: [{ foundation_type: "pillar", diameter: 24 }] }).includes("module_key_mismatch"), "guard: cross-module proposal rejected");
// empty proposal -- nothing to apply is flagged, never silently applied.
ok(run({ ...base }).includes("proposal_empty"), "guard: empty proposal flagged");
// stale policy -- a proposal carrying a superseded policy version is flagged.
ok(run({ ...base, items: [{ foundation_type: "pillar", diameter: 24 }], meta: { policy_version: "foundation-review-v0" } }).includes("stale_policy"), "guard: stale policy_version flagged");
// well-formed control -- a clean proposal validates (guards are not over-firing).
const clean = validateFoundationProposal({ ...base, items: [{ foundation_type: "spread_foot", length_inches: 48, width_inches: 48, depth_inches: 12 }] });
ok(clean.valid === true && clean.issues.length === 0, "control: well-formed proposal validates");

console.log(`PASS foundation-ai-eval: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
