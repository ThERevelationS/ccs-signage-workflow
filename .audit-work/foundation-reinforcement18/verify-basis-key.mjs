import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18";
const sourcePath = "src/components/estimator/foundation/foundationReinforcementBasisKey.js";
buildSync({ entryPoints: [sourcePath], bundle: true, platform: "node", format: "esm", outfile: `${DIR}/basis-key-bundle.mjs` });
const { encodeFoundationReinforcementBasis: encode } = await import(pathToFileURL(path.resolve(`${DIR}/basis-key-bundle.mjs`)));
const results = [];
function check(name, run) {
  try { run(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
check("object key insertion order does not change equality", () => assert.equal(encode({ a: 1, b: 2 }), encode({ b: 2, a: 1 })));
check("nested object order is canonical; ordered arrays remain ordered", () => {
  assert.equal(encode([{ x: 1, y: 2 }]), encode([{ y: 2, x: 1 }]));
  assert.notEqual(encode([1, 2]), encode([2, 1]));
});
check("primitive types, explicitundefined, null and omitted keys stay distinct", () => {
  const values = [null, undefined, "", 0, -0, false, "0", "false", [], {}];
  assert.equal(new Set(values.map(encode)).size, values.length);
  assert.notEqual(encode({ missing: undefined }), encode({}));
});
check("numeric input text does not equal a typed number", () => assert.notEqual(encode({ quantity: "3" }), encode({ quantity: 3 })));
check("delimiter-like and escaped keys/strings cannot collide", () => {
  const values = [{ a: "x;number:1;" }, { a: "x", b: 1 }, { 'a":string:': "b" }, { a: "\u0000\n\r\"" }, { a: "\\u0000\\n\\r\\\"" }];
  assert.equal(new Set(values.map(encode)).size, values.length);
});
check("raw array order and component edits change the basis", () => {
  const a = { items: [{ component_id: "a", quantity: 1 }, { component_id: "b", quantity: 1 }] };
  const b = structuredClone(a); b.items.reverse(); assert.notEqual(encode(a), encode(b));
  b.items.reverse(); b.items[0].quantity = 2; assert.notEqual(encode(a), encode(b));
});
check("owner/project/sourceversion/estimate/generation/editrevision each invalidate", () => {
  const a = { ownerId: "owner", sourceId: "source", sourceAckVersion: "v1", estimateId: "estimate", estimateRevision: "q1", generation: 3, editRevision: 8 };
  for (const key of Object.keys(a)) {
    const b = { ...a, [key]: typeof a[key] === "number" ? a[key] + 1 : a[key] + "-changed" };
    assert.notEqual(encode(a), encode(b), key);
  }
});
check("catalog pricing/unit/diameter/weight/settings/proposedconfig invalidate", () => {
  const values = { catalog: { rate: 2, unit: "ft", diameter: 0.5, weight: 0.668 }, settings: { labor: 60 }, proposal: { quantity: null } };
  for (const [parent, key, replacement] of [["catalog", "rate", 3], ["catalog", "unit", "each"], ["catalog", "diameter", 0.625],
    ["catalog", "weight", null], ["settings", "labor", 0], ["proposal", "quantity", 0]]) {
    const b = structuredClone(values); b[parent][key] = replacement; assert.notEqual(encode(values), encode(b));
  }
});
check("nonfinite numbers never serialize as plausible null", () => {
  for (const value of [NaN, Infinity, -Infinity]) assert.throws(() => encode({ value }), TypeError);
});
check("unsupported functions/symbols/bigint never disappear silently", () => {
  for (const value of [() => 1, Symbol("value"), 1n]) assert.throws(() => encode({ value }), TypeError);
});
check("Date/Map/Set/typed arrays/class instances are rejected", () => {
  for (const value of [new Date(), new Map(), new Set(), new Uint8Array([1]), new (class Input {})()]) assert.throws(() => encode(value), TypeError);
});
check("getter and toJSON are not executed", () => {
  let reads = 0; const value = Object.defineProperty({}, "price", { enumerable: true, get() { reads++; return 0; } });
  assert.throws(() => encode(value), TypeError);
  assert.throws(() => encode({ toJSON() { reads++; return {}; } }), TypeError); assert.equal(reads, 0);
});
check("hidden keys and symbol keys are rejected, not silently dropped", () => {
  assert.throws(() => encode(Object.defineProperty({}, "hidden", { value: 1 })), TypeError);
  assert.throws(() => encode({ [Symbol("a")]: 1 }), TypeError);
});
check("cyclic object/array fail closed", () => {
  const object = {}; object.self = object; assert.throws(() => encode(object), TypeError);
  const array = []; array.push(array); assert.throws(() => encode(array), TypeError);
});
check("repeated shared child reference is legal, not a cycle", () => {
  const child = { price: 1 }; assert.equal(encode([child, child]), encode([{ price: 1 }, { price: 1 }]));
});
check("sparse arrays/extra array fields cannot masquerade as same schedule", () => {
  assert.throws(() => encode(Array(2)), TypeError);
  const extra = [1]; extra.custom = 2; assert.throws(() => encode(extra), TypeError);
  const hidden = [1]; Object.defineProperty(hidden, "0", { enumerable: false }); assert.throws(() => encode(hidden), TypeError);
});
check("depth32 allowed, depth33 rejected", () => {
  let value = "leaf"; for (let i = 0; i < 32; i++) value = { child: value };
  assert.equal(typeof encode(value), "string"); assert.throws(() => encode({ child: value }), RangeError);
});
check("more than1000000 nodes is rejected, not truncated", () => assert.throws(() => encode(Array(1000000).fill(null)), RangeError));
check("encoded character limit includes escaping and framing", () => {
  assert.throws(() => encode("a".repeat(16000000)), RangeError);
  assert.throws(() => encode("\n".repeat(8000000)), RangeError);
});
check("null-prototype JSON records canonicalize like ordinary records", () => {
  const value = Object.assign(Object.create(null), { value: 1, "__proto__": "literal" });
  assert.equal(encode(value), encode({ value: 1 }));
  const protoKey = JSON.parse('{"__proto__":"literal","value":1}'); assert.notEqual(encode(protoKey), encode({ value: 1 }));
});
check("frozen source isn't changed; basis doesn't retain mutable input references", () => {
  const source = Object.freeze({ inputs: Object.freeze([Object.freeze({ value: "0" })]) });
  const before = JSON.stringify(source), key = encode(source);
  assert.equal(JSON.stringify(source), before);
  assert.equal(key, encode(structuredClone(source)));
  const next = structuredClone(source); next.inputs[0].value = "1"; assert.notEqual(key, encode(next));
});
const synthetic = {
  context: { ownerId: "owner", sourceId: "source", generation: 1, editRevision: 1, sourceAckVersion: "saved-v1" },
  project: { items: Array.from({ length: 200 }, (_, i) => ({ component_id: `foundation-${i}`, quantity: 1, length_inches: 36, width_inches: 36, depth_inches: 36 })) },
  proposal: { spread: { inter_mat_ties: Array.from({ length: 4096 }, (_, i) => ({ id: `tie-${i}`, from_mat_id: "one", to_mat_id: "two", x_inches: i, z_inches: 0, cut_length_inches: 12 })) } },
};
let sample;
check("bounded synthetic200-item/4096-row snapshot encodes completely", () => {
  const started = performance.now(), key = encode(synthetic);
  sample = { syntheticItems: 200, syntheticTieRows: 4096, encodedCharacters: key.length, elapsedMs: performance.now() - started };
  assert.match(key, /tie-4095/); assert.match(key, /foundation-199/); assert.ok(key.length > 409600);
});
const failed = results.filter(r => !r.ok).length;
fs.writeFileSync(`${DIR}/basis-key-verification.json`, JSON.stringify({
  synthetic: true, localOnly: true, sourceSha256: crypto.createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex"),
  results, sample, notFullProposalIntegration: true,
}, null, 2) + "\n");
console.log(`Basis key: ${results.length - failed}/${results.length} passed; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
