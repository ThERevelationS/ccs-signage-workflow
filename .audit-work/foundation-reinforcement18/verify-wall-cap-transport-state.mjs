import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { assertOwnedSource } from "./wall-cap-geometry-sandbox-unit.mjs";

const dir = ".audit-work/foundation-reinforcement18/";
const spec = JSON.parse(fs.readFileSync(dir + "wall-cap-geometry-transport-spec.json", "utf8"));
const frozen = JSON.parse(fs.readFileSync(dir + "wall-cap-geometry-sandbox-final-scope.json", "utf8"));
const hash = text => createHash("sha256").update(text, "utf8").digest("hex");
const results = [];
function baseline() {
  const snapshot = structuredClone(frozen);
  snapshot.headAfter = snapshot.head;
  snapshot.dirtyAfter = snapshot.dirty;
  return snapshot;
}
function updated(snapshot, paths = spec.targetOrder) {
  for (const path of paths) {
    const file = snapshot.files.find(f => f.path === path);
    const text = fs.readFileSync(dir + spec.candidatePrefix + path.split("/").pop(), "utf8");
    Object.assign(file, { text, normalized: text, base64: Buffer.from(text).toString("base64"), hash: hash(text) });
  }
  snapshot.changed = [...paths];
  snapshot.head = snapshot.headAfter = "a".repeat(40);
  return snapshot;
}
function check(name, run) {
  try {
    run();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.stack });
  }
}
check("unchanged baseline is eligible", () => assert.deepEqual(assertOwnedSource(baseline()), []));
check("own committed partial state permits explicit resume", () => {
  const path = spec.targetOrder[0];
  assert.deepEqual(assertOwnedSource(updated(baseline(), [path])), [path]);
});
check("all three committed candidate files verify", () => {
  assert.deepEqual(assertOwnedSource(updated(baseline()), true), spec.targetOrder);
});
check("partial application cannot claim verification", () => {
  assert.throws(() => assertOwnedSource(updated(baseline(), [spec.targetOrder[0]]), true), /incomplete application/);
});
check("protected file mutation is rejected", () => {
  const s = updated(baseline());
  s.files.find(f => f.path === spec.protectedFiles[0]).hash = "0".repeat(64);
  assert.throws(() => assertOwnedSource(s), /protected source changed/);
});
check("unrecognized target edits are rejected", () => {
  const s = baseline(), f = s.files.find(f => f.path === spec.targetOrder[0]);
  f.text += "\n// unexpected";
  f.base64 = Buffer.from(f.text).toString("base64");
  f.hash = hash(f.text);
  assert.throws(() => assertOwnedSource(s), /unrecognized target change/);
});
check("missing protected source is rejected", () => {
  const s = baseline();
  s.files = s.files.filter(f => f.path !== spec.protectedFiles[0]);
  assert.throws(() => assertOwnedSource(s));
});
check("unrelated committed changes are rejected", () => {
  const s = updated(baseline());
  s.changed.push("src/pages/Unrelated.jsx");
  assert.throws(() => assertOwnedSource(s), /unexpected changed-file scope/);
});
check("dirty source cannot claim readiness", () => {
  const s = updated(baseline());
  s.dirty = s.dirtyAfter = ` M ${spec.targetOrder[0]}\n`;
  assert.throws(() => assertOwnedSource(s), /committed and clean/);
});
check("unrelated net-zero commits invalidate the baseline", () => {
  const s = baseline();
  s.head = s.headAfter = "b".repeat(40);
  assert.throws(() => assertOwnedSource(s), /unexpected baseline HEAD/);
});
check("HEAD races during capture are rejected", () => {
  const s = baseline();
  s.headAfter = "b".repeat(40);
  assert.throws(() => assertOwnedSource(s), /HEAD changed during capture/);
});
check("worktree races during capture are rejected", () => {
  const s = baseline();
  s.dirtyAfter = ` M ${spec.targetOrder[0]}\n`;
  assert.throws(() => assertOwnedSource(s), /worktree changed during capture/);
});
check("lossy raw-text decoding is rejected", () => {
  const s = baseline();
  s.files.find(f => f.path === spec.targetOrder[0]).base64 = Buffer.from("different bytes").toString("base64");
  assert.throws(() => assertOwnedSource(s), /UTF8 roundtrip/);
});
check("forged target hashes are rejected", () => {
  const s = baseline(), f = s.files.find(f => f.path === spec.targetOrder[0]);
  f.text += "\n";
  f.base64 = Buffer.from(f.text).toString("base64");
  assert.throws(() => assertOwnedSource(s), /target raw capture/);
});
check("uncommitted target content cannot claim committed scope", () => {
  const s = updated(baseline(), [spec.targetOrder[0]]);
  s.changed = [];
  assert.throws(() => assertOwnedSource(s), /unexpected changed-file scope/);
});
check("duplicate source entries are rejected", () => {
  const s = baseline();
  s.files[0] = structuredClone(s.files[1]);
  assert.throws(() => assertOwnedSource(s));
});
fs.writeFileSync(dir + "wall-cap-geometry-transport-state-verification.json", JSON.stringify({ results }, null, 2));
for (const r of results) console.log(`${r.ok ? "ok" : "FAIL"} ${r.name}${r.error ? "\n" + r.error : ""}`);
assert.ok(results.every(r => r.ok), "transport state checks failed");
console.log(`VERIFIED ${results.length} source-state cases; no CLI, SDK, or business-record operations.`);
