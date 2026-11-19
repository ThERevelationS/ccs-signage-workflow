// O-004 draft-recovery model verification — exercises the candidate
// foundationDraftRecovery.js in isolation with fake storage: pricing fields,
// CAS, quota-loss tombstone, oversize, back-compat. Also runs the same write
// against the BASELINE (remote pre-change) file to prove the tests
// discriminate (pricing fields must be absent there).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const DIR = ".audit-work/foundation-o004-drafts/";
const results = [];
const R = async (name, fn) => {
  try { await fn(); results.push({ case: name, ok: true }); console.log("ok", name); }
  catch (e) { results.push({ case: name, ok: false, error: String(e.stack || e).slice(0, 1200) }); console.log("FAIL", name, "-", String(e.message || e).slice(0, 300)); }
};

const bundle = async (file, out) => {
  await esbuild.build({ entryPoints: [file], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
  return import(pathToFileURL(path.resolve(out)) + "?t=" + Date.now());
};

const candidate = await bundle(DIR + "candidates/foundationDraftRecovery.js", DIR + "draft-candidate.mjs");
const baseline = await bundle(DIR + "remote-src/src/components/estimator/foundation/foundationDraftRecovery.js", DIR + "draft-baseline.mjs");
const { createFoundationDraftStore } = candidate;
const { FOUNDATION_DRAFT_FIELDS } = candidate;

const memStorage = (impl = {}) => {
  const map = new Map();
  return {
    getItem: impl.getItem || ((k) => (map.has(k) ? map.get(k) : null)),
    setItem: impl.setItem || ((k, v) => { map.set(k, String(v)); }),
    removeItem: impl.removeItem || ((k) => { map.delete(k); }),
    __map: map,
  };
};
const store = (s, over = {}) =>
  createFoundationDraftStore({ getStorage: () => s, ownerId: "u1", sourceId: "p1", estimateId: "e1", ...over });

const proj = (extra = {}) => ({
  id: "p1", project_name: "P", status: "calculated", assembly_schema_version: 1,
  items: [{ component_id: "f1", description: "footing" }], walls: [], poles: [], wall_caps: [],
  signage_cabinets: [], selected_equipment: [], landscape: { cell_size_inches: 12, cells: {} },
  customer_markup_percent: 15, customer_price_override: 1234.5,
  customer_pricing: { applied: true, tier_number: 3, margin_pct: 22 },
  client_name: "Client C", customer_id: "cust-9", hyperlink: "https://x", estimate_number: "E-100",
  pricing_engine: { wired: true }, concrete_delivery_snapshot: { version: 1, concrete_total: 5 },
  builder_sync_attempt: { key: "k", source_project_id: "p1", estimate_id: "e1" },
  total_concrete_cost: 42, notes: "n",
  ...extra,
});
const WR = { baseUpdatedAt: "v1", token: "t1", savedAt: "2024-02-01T00:00:00.000Z", expectedRevision: null };

// ---------- field coverage ----------
await R("model: pricing fields are drafted and restored verbatim", async () => {
  const s = memStorage();
  const st = store(s);
  const w = st.write({ project: proj(), ...WR });
  assert.equal(w.status, "stored");
  assert.deepEqual(w.draft.customer_pricing, { applied: true, tier_number: 3, margin_pct: 22 });
  assert.equal(w.draft.customer_markup_percent, 15);
  assert.equal(w.draft.customer_price_override, 1234.5);
  const rd = st.read();
  assert.equal(rd.status, "found");
  assert.equal(rd.draft.customer_markup_percent, 15);
  assert.equal(rd.draft.customer_price_override, 1234.5);
  assert.deepEqual(rd.draft.customer_pricing, { applied: true, tier_number: 3, margin_pct: 22 });
});

await R("model: identity/link/computed/internal fields stay out of the draft", async () => {
  const s = memStorage();
  const st = store(s);
  const w = st.write({ project: proj(), ...WR });
  assert.equal(w.status, "stored");
  const env = JSON.parse([...s.__map.values()][0]);
  for (const forbidden of ["status", "builder_sync_attempt", "hyperlink", "client_name", "customer_id",
    "estimate_number", "pricing_engine", "concrete_delivery_snapshot", "total_concrete_cost", "id"])
    assert.ok(!(forbidden in env.data), `forbidden field drafted: ${forbidden}`);
});

await R("model: allowlist stays explicit (no catch-all)", async () => {
  assert.ok(Array.isArray(FOUNDATION_DRAFT_FIELDS) && FOUNDATION_DRAFT_FIELDS.length < 40);
  for (const f of ["customer_markup_percent", "customer_price_override", "customer_pricing"]) assert.ok(FOUNDATION_DRAFT_FIELDS.includes(f));
  assert.ok(!FOUNDATION_DRAFT_FIELDS.includes("*"));
});

// ---------- quota-loss tombstone ----------
// Throws unless the payload is the small loss tombstone — a deterministic
// "quota" injector that lets the marker through while refusing real drafts.
const quotaStorage = () => {
  const inner = memStorage();
  inner.setItem = (k, v) => {
    if (!String(v).includes('"draftLost":true')) { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; }
    inner.__map.set(k, String(v));
  };
  return inner;
};

await R("model: quota failure on empty storage leaves loss marker -> read warns invalid", async () => {
  const s = quotaStorage();
  const st = store(s);
  const w = st.write({ project: proj(), ...WR });
  assert.equal(w.status, "unavailable");
  assert.match(w.message, /loss marker/i);
  const raw = [...s.__map.values()][0];
  const env = JSON.parse(raw);
  assert.equal(env.draftLost, true);
  assert.equal(env.version, 1);
  assert.equal(env.ownerId, "u1");
  assert.ok(env.droppedBytes > 100);
  const rd = st.read();
  assert.equal(rd.status, "invalid");
  assert.match(rd.message, /could not be kept/i);
  assert.equal(rd.revision, raw);
  const c = st.clear(rd.revision);
  assert.equal(c.status, "removed");
  assert.equal(st.read().status, "empty");
});

await R("model: quota failure with existing draft retains prior draft (no tombstone clobber)", async () => {
  const s = memStorage();
  const st = store(s);
  const w1 = st.write({ project: proj(), ...WR });
  assert.equal(w1.status, "stored");
  const prior = [...s.__map.values()][0];
  s.setItem = (k, v) => { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; };
  const w2 = st.write({ project: proj({ project_name: "P2" }), ...WR, expectedRevision: w1.revision });
  assert.equal(w2.status, "unavailable");
  assert.match(w2.message, /previously stored draft was retained/i);
  assert.equal([...s.__map.values()][0], prior, "prior draft untouched");
  s.setItem = memStorage().__setItem || ((k, v) => s.__map.set(k, String(v)));
  const rd = st.read();
  assert.equal(rd.status, "found");
  assert.equal(rd.draft.project_name, "P");
});

await R("model: oversize write on empty storage -> tombstone, on existing -> retained", async () => {
  const s = memStorage();
  const st = store(s);
  const big = proj({ notes: "x".repeat(1_100_000) });
  const w = st.write({ project: big, ...WR });
  assert.equal(w.status, "invalid");
  assert.match(w.message, /loss marker|character limit/i);
  const rd = st.read();
  assert.equal(rd.status, "invalid");
  assert.match(rd.message, /could not be kept/i);
  // clear tombstone, then store small draft, then oversize again -> retained
  st.clear(rd.revision);
  const small = st.write({ project: proj(), ...WR });
  assert.equal(small.status, "stored");
  const w2 = st.write({ project: big, ...WR, expectedRevision: small.revision });
  assert.equal(w2.status, "invalid");
  assert.match(w2.message, /previous draft retained/i);
  const rd2 = st.read();
  assert.equal(rd2.status, "found");
  assert.equal(rd2.draft.notes, "n");
});

await R("model: tombstone is a valid CAS revision — write over marker proceeds", async () => {
  const s = quotaStorage();
  const st = store(s);
  st.write({ project: proj(), ...WR });
  const tomb = st.read();
  assert.equal(tomb.status, "invalid");
  s.setItem = (k, v) => s.__map.set(k, String(v)); // quota freed
  const w = st.write({ project: proj({ project_name: "AfterQuota" }), ...WR, expectedRevision: tomb.revision });
  assert.equal(w.status, "stored");
  assert.equal(st.read().draft.project_name, "AfterQuota");
});

// ---------- unchanged contracts ----------
await R("model: CAS conflict / context isolation / identity gates unchanged", async () => {
  const s = memStorage();
  const st = store(s);
  const w = st.write({ project: proj(), ...WR });
  const conflict = st.write({ project: proj(), ...WR, expectedRevision: "stale" });
  assert.equal(conflict.status, "conflict");
  const other = createFoundationDraftStore({ getStorage: () => s, ownerId: "u2", sourceId: "p1", estimateId: "e1" });
  assert.equal(other.read().status, "empty");
  const noAccess = createFoundationDraftStore({ getStorage: () => s, ownerId: "", sourceId: "p1" });
  assert.equal(noAccess.read().status, "unavailable");
  assert.equal(st.write({ project: proj({ id: "other" }), ...WR }).status, "invalid");
});

await R("model: draft stores pricing only when present (absent keys absent)", async () => {
  const s = memStorage();
  const st = store(s);
  const p = proj(); delete p.customer_pricing; delete p.customer_markup_percent; delete p.customer_price_override;
  const w = st.write({ project: p, ...WR });
  assert.equal(w.status, "stored");
  const env = JSON.parse([...s.__map.values()][0]);
  assert.ok(!("customer_pricing" in env.data));
  assert.ok(!("customer_markup_percent" in env.data));
});

await R("model: corrupt stored envelope still surfaces invalid (unchanged path)", async () => {
  const s = memStorage();
  const st = store(s);
  s.__map.set([...s.__map.keys()][0] ?? "k", "");
  s.setItem("x", "");
  const key = "ccs:foundation-draft:v1:" + encodeURIComponent(JSON.stringify(["u1", "p1", "e1"]));
  s.__map.set(key, "{not json");
  const rd = st.read();
  assert.equal(rd.status, "invalid");
});

// ---------- red check: baseline store must NOT carry pricing ----------
await R("model RED: baseline store drops pricing fields (discrimination)", async () => {
  const s = memStorage();
  const st = baseline.createFoundationDraftStore({ getStorage: () => s, ownerId: "u1", sourceId: "p1", estimateId: "e1" });
  const w = st.write({ project: proj(), ...WR });
  assert.equal(w.status, "stored");
  const env = JSON.parse([...s.__map.values()][0]);
  assert.ok(!("customer_pricing" in env.data), "baseline unexpectedly carries pricing");
  assert.ok(!("customer_markup_percent" in env.data));
  assert.ok(!("customer_price_override" in env.data));
});

const okCount = results.filter(r => r.ok).length;
fs.writeFileSync(DIR + "draft-model-verification.json", JSON.stringify({ results, okCount, total: results.length }, null, 2));
console.log(`\n${okCount}/${results.length} model checks passed`);
process.exit(results.every(r => r.ok) ? 0 : 1);
