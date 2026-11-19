import assert from "node:assert/strict";
import fs from "node:fs";

const DIR = ".audit-work/foundation-reinforcement18/";
const source = JSON.parse(fs.readFileSync(DIR + "catalog-persistence-current-source.json", "utf8"))
  .files.find(file => file.path === "src/components/estimator/builder/builderEntityPersistence.js").content;
const mode = process.argv[2] || "baseline";
assert.ok(["baseline", "candidate"].includes(mode));
const candidateFile = DIR + "catalog-update-readback-candidate.js";
const actual = mode === "candidate" ? fs.readFileSync(candidateFile, "utf8") : source;
const { replaceEntityFieldsIfUnchanged: replace, expectedEntityFields: expected } = await import(
  "data:text/javascript;base64," + Buffer.from(actual).toString("base64"));
const initial = Object.freeze({ id: "synthetic-catalog", updated_date: "loaded-version",
  material_name: "Synthetic bar", material_type: "rebar", cost_per_unit: 2,
  rebar_diameter_inches: 0.5, rebar_weight_lb_per_ft: 0.668 });
const wanted = Object.freeze({ material_name: "Synthetic changed bar", rebar_diameter_inches: 0.625,
  rebar_weight_lb_per_ft: 1.043, cost_per_unit: 0 });
function store({ row = initial, project = value => value, failReadback = false, loseReply = false } = {}) {
  let current = structuredClone(row);
  const calls = [];
  return {
    calls, inspect: () => structuredClone(current),
    entity: {
      async get(id) {
        calls.push(["get", id]);
        if (failReadback && calls.some(call => call[0] === "updateMany")) throw Error("Synthetic readback unavailable");
        return structuredClone(current);
      },
      async updateMany(query, update) {
        calls.push(["updateMany", structuredClone(query), structuredClone(update)]);
        assert.deepEqual(query, { id: initial.id, updated_date: initial.updated_date });
        current = project({ ...current, ...structuredClone(update.$set), updated_date: "saved-version" });
        if (loseReply) throw Error("Synthetic lost update reply");
        return { updated: 1 };
      },
    },
  };
}
const save = (s, patch = wanted) => replace({
  entity: s.entity, id: initial.id, expectedUpdatedAt: initial.updated_date,
  expectedFields: expected(initial, patch), nextFields: patch, label: "Foundation catalog material",
});
const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
await check("exact saved fields and explicit zero cost return verified catalog data after one conditional write", async () => {
  const s = store(), saved = await save(s);
  assert.equal(saved.cost_per_unit, 0); assert.equal(saved.rebar_weight_lb_per_ft, 1.043);
  assert.equal(saved.updated_date, "saved-version");
  assert.equal(s.calls.filter(call => call[0] === "updateMany").length, 1);
  assert.equal(initial.cost_per_unit, 2);
});
await check("server dropping declared-looking diameter/weight cannot be acknowledged as a successful metadata save", async () => {
  const s = store({ project: record => {
    delete record.rebar_diameter_inches; delete record.rebar_weight_lb_per_ft; return record;
  } });
  await assert.rejects(save(s), /stored values.*match|could not.*verif/i);
  assert.equal(s.calls.filter(call => call[0] === "updateMany").length, 1, "No rewrite/retry after an ambiguous persisted outcome");
  assert.equal(s.inspect().material_name, wanted.material_name, "Do not pretend the entire write failed or undo its other fields");
});
await check("explicit null metadata clear must not be accepted if server preserves the old recorded diameter", async () => {
  const s = store({ project: record => ({ ...record, rebar_diameter_inches: initial.rebar_diameter_inches }) });
  await assert.rejects(save(s, { rebar_diameter_inches: null }), /stored values.*match|could not.*verif/i);
  assert.equal(s.calls.filter(call => call[0] === "updateMany").length, 1);
});
await check("server replacing authored zero price with another rate cannot be reported as success", async () => {
  const s = store({ project: record => ({ ...record, cost_per_unit: 2 }) });
  await assert.rejects(save(s, { cost_per_unit: 0 }), /stored values.*match|could not.*verif/i);
  assert.equal(s.calls.filter(call => call[0] === "updateMany").length, 1);
});
await check("a newer competing saved record is rejected rather than closing the editor as saved", async () => {
  const s = store({ project: record => ({ ...record, material_name: "Newer concurrent edit", updated_date: "newer-version" }) });
  await assert.rejects(save(s), /stored values.*match|could not.*verif/i);
  assert.equal(s.inspect().material_name, "Newer concurrent edit");
});
await check("exact null clears remain unknown and survive the returned receipt without zero substitution", async () => {
  const s = store(), saved = await save(s, { rebar_diameter_inches: null, rebar_weight_lb_per_ft: null });
  assert.equal(saved.rebar_diameter_inches, null); assert.equal(saved.rebar_weight_lb_per_ft, null);
});
await check("lost update reply recovers exact persisted values without a second write", async () => {
  const s = store({ loseReply: true }), saved = await save(s);
  assert.equal(saved.cost_per_unit, 0); assert.equal(saved.rebar_diameter_inches, 0.625);
  assert.equal(s.calls.filter(call => call[0] === "updateMany").length, 1);
});
await check("lost reply plus dropped metadata retains the original error and never claims recovery", async () => {
  const s = store({ loseReply: true, project: record => { delete record.rebar_weight_lb_per_ft; return record; } });
  await assert.rejects(save(s), /Synthetic lost update reply/);
  assert.equal(s.calls.filter(call => call[0] === "updateMany").length, 1);
});
await check("unavailable readback remains blocked after an acknowledged write", async () => {
  const s = store({ failReadback: true });
  await assert.rejects(save(s), /updated but could not be re-read/);
  assert.equal(s.calls.filter(call => call[0] === "updateMany").length, 1);
});
await check("retry converges when the exact intended values already exist without rewriting a newer timestamp", async () => {
  const row = { ...initial, ...wanted, updated_date: "newer-but-exact" };
  const s = store({ row }), saved = await save(s);
  assert.equal(saved.updated_date, "newer-but-exact");
  assert.equal(s.calls.filter(call => call[0] === "updateMany").length, 0);
});
fs.writeFileSync(DIR + `catalog-update-readback-${mode}-verification.json`, JSON.stringify({
  results, syntheticOnly: true, realStorageVerified: false, schemaChanged: false,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;
