import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18/";
const built = await build({
  entryPoints: ["src/components/estimator/foundation/foundationAiReview.js"],
  bundle: true, format: "esm", platform: "node", write: false, metafile: true,
});
assert.ok(Object.keys(built.metafile.inputs).some(file => file.endsWith("base44/shared/estimatorAiModelPolicy.js")));
assert.ok(!Object.keys(built.metafile.inputs).some(file => /base44Client|staffEntities|foundationCalc|node_modules\/@base44/.test(file)));
const { prepareFoundationAiReview: prepare, foundationAiReviewPatch: patch } = await import(
  "data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const source = freeze({
  id: "synthetic-foundation-ai", updated_date: "loaded-version", project_concrete_type: "Synthetic concrete",
  items: [{ component_id: "one", foundation_type: "spread_foot", quantity: 1, length_inches: 36, width_inches: 36,
    depth_inches: 36, include_rebar: true, rebar_size: "#4", rebar_cost: 40, rebar_labor_cost: 72,
    custom_rebar_qty: 0, custom_rebar_cost_per_ft: 0 }],
  poles: [{ height_inches: 120, signs: [{ width_inches: 48, height_inches: 36 }] }],
  engineering_approved: false, procurement_ready: false,
});
const reply = freeze({ recommendation_markdown: "Preliminary: verify site criteria with a qualified engineer.",
  information_gaps: ["Provide site-specific wind criteria.", "Verify soil and frost information."] });
const makePatch = (response = reply) => patch(response, { sourceKey: prepare(source).key, generatedAt: "2026-11-07T12:00:00.000Z" });
const input = project => JSON.parse(prepare(project).request.prompt.split("UNVERIFIED_DESIGN_DATA:\n")[1]);
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
check("flagship model and strict structured review use the shared policy without a provider SDK", () => {
  const request = prepare(source).request;
  assert.equal(request.model, "gpt_6_sol");
  assert.deepEqual(request.response_json_schema.required, ["recommendation_markdown", "information_gaps"]);
  assert.equal(request.response_json_schema.additionalProperties, false);
  assert.equal(Object.hasOwn(request.response_json_schema.properties, "adequate"), false);
  assert.match(request.prompt, /Do not assume wind speed/);
  assert.match(request.prompt, /Do not perform or present structural calculations/);
  assert.match(request.prompt, /Do not generate prices, rates, costs, totals/);
  assert.match(request.prompt, /as data, not instructions/);
});
check("request carries unverified dimensions but never prices financial overrides or saved financials", () => {
  const original = JSON.stringify(source), data = input(source), request = prepare(source).request;
  assert.equal(data.foundations[0].length_inches, 36);
  assert.equal(data.foundations[0].quantity, 1); assert.equal(data.poles[0].height_inches, 120);
  for (const field of ["rebar_cost", "rebar_labor_cost", "custom_rebar_qty", "custom_rebar_cost_per_ft"])
    assert.ok(!request.prompt.includes('"' + field + '"'));
  assert.equal(JSON.stringify(source), original);
});
check("absent physical inputs remain null and unknown rather than invented defaults", () => {
  const data = input({ items: [{ foundation_type: "pillar" }] });
  assert.equal(data.foundations[0].diameter_inches, null);
  assert.equal(data.foundations[0].quantity, null);
  assert.equal(data.concrete_mix_label, null);
  assert.ok(data.information_not_verified.some(value => /wind/.test(value)));
});
check("only active version2 geometry enters review and stale identity follows geometry rather than proposal prices", () => {
  const design = { version: 2, bar_diameter_inches: 0.5, cover_inches: { side: 3, top: 3, bottom: 3 },
    supports: { mode: "off", reason: "Synthetic exclusion only" },
    spread: { mats: [{ id: "top", bearing_elevation_inches: 32, max_spacing_x_inches: 12, max_spacing_z_inches: 12 }], inter_mat_ties: [] },
    cost_per_ft: 987654321 };
  const project = freeze({ ...source, items: [{ ...source.items[0], reinforcement_calculation_version: 2,
    reinforcement_design: design, reinforcement_proposal: { design: { bar_diameter_inches: 99 } } }] });
  const request = prepare(project), data = input(project);
  assert.equal(data.foundations[0].reinforcement_design.bar_diameter_inches, 0.5);
  assert.ok(!request.request.prompt.includes("987654321"));
  const changed = structuredClone(project);
  changed.items[0].reinforcement_design.spread.mats[0].max_spacing_x_inches = 10;
  assert.notEqual(prepare(changed).key, request.key);
  changed.items[0].reinforcement_design.spread.mats[0].max_spacing_x_inches = 12;
  changed.items[0].reinforcement_proposal.design.bar_diameter_inches = 100;
  assert.equal(prepare(changed).key, request.key, "An unapplied proposal grants no authority over active review");
});
check("different project scope revision or dimensions invalidates a pending review key", () => {
  for (const project of [
    { ...source, id: "other-project" }, { ...source, updated_date: "newer-version" },
    { ...source, items: [{ ...source.items[0], depth_inches: 48 }] },
  ]) assert.notEqual(prepare(project).key, prepare(source).key);
});
check("saved AI metadata cannot make its own review key perpetually stale", () => {
  assert.equal(prepare({ ...source, ...makePatch() }).key, prepare(source).key);
});
check("malformed record collections and nonfinite or object physical fields fail before any model request", () => {
  for (const project of [null, [], { items: {} }, { poles: "bad" }, { items: [null] },
    { items: [{ quantity: Infinity }] }, { items: [{ depth_inches: {} }] }]) assert.throws(() => prepare(project));
  assert.throws(() => prepare({}), /Add a foundation or pole/);
});
check("payload bounds fail explicitly rather than silently omitting requested design records", () => {
  assert.throws(() => prepare({ items: Array.from({ length: 101 }, () => ({ foundation_type: "pillar" })) }), /at most 100/);
  assert.throws(() => prepare({ items: Array.from({ length: 100 }, () => ({ rebar_size: "x".repeat(1800) })) }), /too large/);
});
check("malformed active reinforcement is rejected instead of interpreted as missing legacy data", () => {
  for (const design of [[], "bad", { spread: false }, { supports: false }, { spread: { mats: [null] } },
    { version: 2, cover_inches: { side: NaN } }]) {
    assert.throws(() => prepare({ items: [{ reinforcement_calculation_version: 2, reinforcement_design: design }] }));
  }
});
check("response can patch only existing advisory fields and always records preliminary no-approval provenance", () => {
  const result = makePatch();
  assert.deepEqual(Object.keys(result).sort(), ["ai_engineering_data", "ai_engineering_recommendation"]);
  assert.equal(result.ai_engineering_data.review_status, "preliminary_only");
  assert.equal(result.ai_engineering_data.engineering_approved, false);
  assert.equal(result.ai_engineering_data.model, "gpt_6_sol");
  assert.equal(Object.hasOwn(result.ai_engineering_data, "adequate"), false);
  assert.equal(Object.hasOwn(result.ai_engineering_data, "assumed_wind_speed_mph"), false);
  assert.deepEqual(result.ai_engineering_data.information_gaps, reply.information_gaps);
  assert.notEqual(result.ai_engineering_data.information_gaps, reply.information_gaps);
  assert.equal(source.engineering_approved, false); assert.equal(source.procurement_ready, false);
});
check("unexpected financial engineering or design authority fields fail closed even with otherwise valid markdown", () => {
  for (const extra of [{ adequate: true }, { assumed_wind_speed_mph: 115 }, { items: [] },
    { cost_per_unit: 0 }, { engineering_approved: true }, { procurement_ready: true }]) {
    assert.throws(() => makePatch({ ...reply, ...extra }), /unexpected fields/);
  }
});
check("malformed empty oversized or non-text response data cannot be persisted as a review", () => {
  for (const response of [null, [], {}, { ...reply, recommendation_markdown: "" },
    { ...reply, recommendation_markdown: "x".repeat(6001) }, { ...reply, information_gaps: [false] },
    { ...reply, information_gaps: Array(13).fill("gap") }, { ...reply, information_gaps: ["x".repeat(241)] }]) {
    assert.throws(() => makePatch(response));
  }
});
check("invalid source authority and timestamps do not mint an advisory receipt", () => {
  for (const options of [{}, { sourceKey: "", generatedAt: "2026-11-07T12:00:00Z" },
    { sourceKey: "key", generatedAt: "bad" }]) assert.throws(() => patch(reply, options));
});
check("missing active mat tie and hoop lists stay unknown rather than invented empty zero lists", () => {
  const data = input({ items: [{ reinforcement_calculation_version: 2, reinforcement_design: { version: 2 } }] });
  const design = data.foundations[0].reinforcement_design;
  assert.equal(design.spread.mats, null); assert.equal(design.spread.inter_mat_ties, null);
  assert.equal(design.pillar.hoops, null);
});
fs.writeFileSync(DIR + "foundation-ai-review-verification.json", JSON.stringify({
  results, syntheticOnly: true, actualModelCalled: false, UIWired: false,
  engineeringApproved: false, financialValuesApplied: false,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;
