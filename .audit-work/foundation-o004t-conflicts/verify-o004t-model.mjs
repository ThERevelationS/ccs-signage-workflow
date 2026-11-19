// O-004 tail (CMP-A04) model verification — pure candidates directly imported;
// entity-touching candidate bundled with ONLY boundary stubs (staffEntities,
// base44Client). Proves:
//   A) draft↔saved conflict matrix (in_sync / edits_only / base_moved_identical /
//      conflict / unverifiable, draft_only/saved_only fields)
//   B) retry classifier modes (resume_pending / resync_unacknowledged / blocked /
//      none_needed / blocked_no_estimate)
//   C) saveSession conflictDetected tag (classified CAS vs local-gate conflicts)
//   D) retryFoundationBuilderSync outcome matrix (injectable deps: no writes on
//      conflict/invalid/blocked/already_synced; builder_calculation overlay;
//      expectedPendingKey pinning; pending-on-unacknowledged)
//   E) REAL recordBuilderSave end-to-end over an in-memory entity store:
//      first sync mints parts; retry creates ZERO new parts (part_key
//      convergence); partial-death mid-sync then retry converges with no dup
//      keys; pending-marker resume replays the stored plan once.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, basename, join, sep } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const DIR = here + "/";
const TMP = resolve(DIR, "tmp-model");
mkdirSync(TMP, { recursive: true });

const results = [];
const R = (name, fn) => {
  try {
    const r = fn();
    if (r && typeof r.then === "function") {
      return r.then(() => { results.push({ case: name, ok: true }); console.log("ok", name); })
        .catch((e) => { results.push({ case: name, ok: false, error: String(e.stack || e) }); console.log("FAIL", name, "-", String(e.message || e)); });
    }
    results.push({ case: name, ok: true });
    console.log("ok", name);
  } catch (e) {
    results.push({ case: name, ok: false, error: String(e.stack || e) });
    console.log("FAIL", name, "-", String(e.message || e));
  }
};

// ---------------- pure candidates ----------------
const draft = await import(pathToFileURL(resolve(DIR, "candidates/foundationDraftRecovery.js")).href);
const sync = await import(pathToFileURL(resolve(DIR, "candidates/foundationSyncRecovery.js")).href);
const saveSess = await import(pathToFileURL(resolve(DIR, "candidates/foundationSaveSession.js")).href);
const {
  summarizeFoundationDraftConflict, diffFoundationDraftFields,
  foundationDraftRebaseProject, foundationDraftConflictNeedsReview,
  sameFoundationDraftValue, createFoundationDraftStore, FOUNDATION_DRAFT_FIELDS,
} = draft;
const { classifyFoundationSyncRetry, createFoundationSyncAttempt, foundationSyncRecoveryState } = sync;
const { createFoundationSaveSession } = saveSess;

// ---------------- A. draft↔saved conflict matrix ----------------
const SAVED = {
  id: "p1", updated_date: "v2",
  project_name: "Sign A", notes: "n",
  items: [{ component_id: "i1", description: "footing" }],
  walls: [], poles: [], wall_caps: [], signage_cabinets: [], selected_equipment: [],
  landscape: { cell_size_inches: 12, cells: {} },
  customer_markup_percent: 20, customer_price_override: null, customer_pricing: { applied: false },
  concrete_cost_per_cy: 150,
};

R("A1 in_sync: same base, no field diffs", () => {
  const s = summarizeFoundationDraftConflict({
    draft: { project_name: "Sign A", notes: "n", items: [{ component_id: "i1", description: "footing" }], customer_markup_percent: 20, concrete_cost_per_cy: 150 },
    saved: SAVED, baseUpdatedAt: "v2", draftSavedAt: "2026-01-01T00:00:00Z",
  });
  assert.equal(s.status, "in_sync");
  assert.equal(s.baseMoved, false);
  assert.equal(foundationDraftConflictNeedsReview(s), false);
});

R("A2 edits_only: same base, field diverged — normal draft, NOT a merge conflict", () => {
  const s = summarizeFoundationDraftConflict({
    draft: { project_name: "Sign A renamed" },
    saved: SAVED, baseUpdatedAt: "v2",
  });
  assert.equal(s.status, "edits_only");
  assert.equal(s.counts.diverged, 1);
  assert.equal(foundationDraftConflictNeedsReview(s), false);
});

R("A3 base_moved_identical: stale anchor, content identical", () => {
  const s = summarizeFoundationDraftConflict({
    draft: { project_name: "Sign A", customer_markup_percent: 20 },
    saved: SAVED, baseUpdatedAt: "v1",
  });
  assert.equal(s.status, "base_moved_identical");
  assert.equal(s.baseMoved, true);
  assert.equal(foundationDraftConflictNeedsReview(s), true);
});

R("A4 conflict: stale anchor + diverged field", () => {
  const s = summarizeFoundationDraftConflict({
    draft: { project_name: "Sign A renamed", notes: "n" },
    saved: SAVED, baseUpdatedAt: "v1",
  });
  assert.equal(s.status, "conflict");
  assert.equal(s.counts.diverged, 1);
  assert.equal(s.savedUpdatedAt, "v2");
  assert.equal(foundationDraftConflictNeedsReview(s), true);
});

R("A5 conflict via draft_only field (draft records what saved lacks)", () => {
  const saved = { ...SAVED };
  delete saved.customer_price_override;
  const s = summarizeFoundationDraftConflict({
    draft: { customer_price_override: 4200 },
    saved, baseUpdatedAt: "v1",
  });
  assert.equal(s.status, "conflict");
  const row = s.fields.find((f) => f.field === "customer_price_override");
  assert.equal(row.status, "draft_only");
  assert.equal(row.draft.text, "4200");
  assert.equal(row.saved.text, "—");
});

R("A6 saved_only never counts toward conflict (overlay restore leaves it)", () => {
  const saved = { ...SAVED, rebar_cost_per_ft: 0.85 };
  const s = summarizeFoundationDraftConflict({
    draft: { project_name: "Sign A" },
    saved, baseUpdatedAt: "v1",
  });
  assert.equal(s.status, "base_moved_identical", "saved_only must not escalate to conflict");
  const row = s.fields.find((f) => f.field === "rebar_cost_per_ft");
  assert.equal(row.status, "saved_only");
  assert.equal(s.counts.diverged + s.counts.draftOnly, 0, "saved_only never counts toward conflict");
  assert.ok(s.counts.savedOnly >= 1, "every saved field the draft never recorded is reported");
});

R("A7 unverifiable: draft side unreadable", () => {
  for (const bad of [null, undefined, "x", [1], 4]) {
    const s = summarizeFoundationDraftConflict({ draft: bad, saved: SAVED, baseUpdatedAt: "v1" });
    assert.equal(s.status, "unverifiable");
    assert.equal(s.reason, "draft_unreadable");
    assert.equal(foundationDraftConflictNeedsReview(s), true);
  }
});

R("A8 unverifiable: saved side missing (record never re-read)", () => {
  const s = summarizeFoundationDraftConflict({ draft: { notes: "n" }, saved: null, baseUpdatedAt: "v1" });
  assert.equal(s.status, "unverifiable");
  assert.equal(s.reason, "saved_unreadable");
});

R("A9 compare semantics: numeric tolerance, whitespace, key order", () => {
  assert.equal(sameFoundationDraftValue(12.5, 12.5000004), true);
  assert.equal(sameFoundationDraftValue("a  b ", "a b"), true);
  assert.equal(sameFoundationDraftValue({ x: 1, y: [2, 3] }, { y: [2, 3], x: 1 }), true);
  assert.equal(sameFoundationDraftValue(null, ""), true, "empty-ish pair compares equal");
  assert.equal(sameFoundationDraftValue(null, undefined), true);
  assert.equal(sameFoundationDraftValue(null, 0), false, "stored null vs real 0 differ");
  assert.equal(sameFoundationDraftValue([1, 2], [2, 1]), false, "array order matters");
});

R("A10 diff rows carry per-side summaries (rows/tier/absent)", () => {
  const rows = diffFoundationDraftFields({
    draft: { items: [{ a: 1 }, { a: 2 }, { a: 3 }], customer_pricing: { applied: true, tier_number: 3 }, landscape: { cells: { "0,0": "grass", "0,1": "grass" } } },
    saved: { items: [{ a: 1 }], customer_pricing: { applied: false }, landscape: { cells: {} } },
  });
  const items = rows.find((r) => r.field === "items");
  assert.equal(items.status, "diverged");
  assert.equal(items.draft.text, "3 foundation items");
  assert.equal(items.saved.text, "1 foundation item");
  const tier = rows.find((r) => r.field === "customer_pricing");
  assert.equal(tier.draft.text, "Applied tier 3");
  assert.equal(tier.saved.text, "No tier applied");
  const land = rows.find((r) => r.field === "landscape");
  assert.match(land.draft.text, /2 filled cells/);
  assert.match(land.saved.text, /0 filled cells/);
});

R("A11 rebase project: id + draft fields verbatim, isolated clone", () => {
  const d = { items: [{ component_id: "i1" }], notes: "x" };
  const p = foundationDraftRebaseProject({ draft: d, sourceId: "p1" });
  assert.equal(p.id, "p1");
  assert.deepEqual(p.items, d.items);
  p.items[0].component_id = "mutated";
  assert.equal(d.items[0].component_id, "i1", "clone must not alias draft");
  assert.equal(foundationDraftRebaseProject({ draft: null, sourceId: "p1" }), null);
  assert.equal(foundationDraftRebaseProject({ draft: {}, sourceId: "" }), null);
});

R("A12 rebase writes through the real store: draft re-anchored, old base preserved in envelope", () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const store = createFoundationDraftStore({ getStorage: () => storage, ownerId: "o1", sourceId: "p1", estimateId: "e1" });
  const w1 = store.write({ project: { id: "p1", project_name: "Old" }, baseUpdatedAt: "v1", token: "t1", savedAt: "2026-01-01T00:00:00.000Z", expectedRevision: null });
  assert.equal(w1.status, "stored");
  // conflict detected: draft anchored v1, saved moved to v2
  const found = store.read();
  assert.equal(found.status, "found");
  const s = summarizeFoundationDraftConflict({ draft: found.draft, saved: SAVED, baseUpdatedAt: found.baseUpdatedAt, draftSavedAt: found.savedAt });
  assert.equal(s.status, "conflict");
  // keep-both: rebase the same draft content onto v2
  const rebase = foundationDraftRebaseProject({ draft: found.draft, sourceId: "p1" });
  const w2 = store.write({ project: rebase, baseUpdatedAt: "v2", token: "t2", savedAt: "2026-01-02T00:00:00.000Z", expectedRevision: found.revision });
  assert.equal(w2.status, "stored");
  const found2 = store.read();
  assert.equal(found2.baseUpdatedAt, "v2");
  assert.equal(found2.draft.project_name, "Old", "draft content survives rebase verbatim");
  const s2 = summarizeFoundationDraftConflict({ draft: found2.draft, saved: SAVED, baseUpdatedAt: found2.baseUpdatedAt });
  assert.equal(s2.status, "edits_only", "re-anchored draft returns to ordinary offer semantics");
});

R("A13 rebase write honors CAS — a changed stored revision refuses", () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const store = createFoundationDraftStore({ getStorage: () => storage, ownerId: "o1", sourceId: "p1" });
  const w1 = store.write({ project: { id: "p1", notes: "a" }, baseUpdatedAt: "v1", token: "t1", savedAt: "2026-01-01T00:00:00.000Z", expectedRevision: null });
  const w2 = store.write({ project: foundationDraftRebaseProject({ draft: { notes: "b" }, sourceId: "p1" }), baseUpdatedAt: "v2", token: "t2", savedAt: "2026-01-02T00:00:00.000Z", expectedRevision: "stale-rev" });
  assert.equal(w2.status, "conflict", "stale expectedRevision must refuse");
  assert.equal(store.read().draft.notes, "a", "existing draft never clobbered by failed rebase");
});

// ---------------- B. classifyFoundationSyncRetry ----------------
const ATT = createFoundationSyncAttempt({ sourceId: "p1", estimateId: "e1", key: "k-att", requestedAt: "2026-01-01T00:00:00Z" });
const proj = (extra = {}) => ({ id: "p1", updated_date: "v1", ...extra });
const est = (lineExtra = {}, extra = {}) => ({ id: "e1", status: "draft", line_items: [{ module_key: "foundation", project_id: "p1", estimate_id: "e1", ...lineExtra }], ...extra });

R("B1 none_needed: no receipt, no pending", () => {
  const c = classifyFoundationSyncRetry({ project: proj(), estimateId: "e1", estimate: est() });
  assert.equal(c.mode, "none_needed");
  assert.equal(c.retryable, false);
});

R("B2 none_needed: receipt acknowledged by line snapshot", () => {
  const c = classifyFoundationSyncRetry({
    project: proj({ builder_sync_attempt: ATT }), estimateId: "e1",
    estimate: est({ updated_date_snapshot: "v1" }),
  });
  assert.equal(c.mode, "none_needed");
  assert.equal(c.retryable, false);
});

R("B3 resync_unacknowledged: receipt pending, no line marker", () => {
  const c = classifyFoundationSyncRetry({
    project: proj({ builder_sync_attempt: ATT }), estimateId: "e1",
    estimate: est({ updated_date_snapshot: "v0" }),
  });
  assert.equal(c.mode, "resync_unacknowledged");
  assert.equal(c.retryable, true);
  assert.equal(c.pendingKey, null);
  assert.equal(c.attempt.key, "k-att");
});

R("B4 resume_pending: durable line marker wins", () => {
  const c = classifyFoundationSyncRetry({
    project: proj({ builder_sync_attempt: ATT }), estimateId: "e1",
    estimate: est({ price_acceptance_pending: { key: "op-1", kind: "builder_initial_freeze", started_at: "2026-01-01T00:00:00Z", estimate_id: "e1", builder_product_id: "bp1" } }),
  });
  assert.equal(c.mode, "resume_pending");
  assert.equal(c.retryable, true);
  assert.equal(c.pendingKey, "op-1");
});

R("B5 blocked_mismatch: receipt names another estimate", () => {
  const c = classifyFoundationSyncRetry({
    project: proj({ builder_sync_attempt: { ...ATT, estimate_id: "eOTHER" } }),
    estimateId: "e1", estimate: est(),
  });
  assert.equal(c.mode, "blocked_mismatch");
  assert.equal(c.retryable, false);
});

R("B6 blocked_unsupported: malformed receipt untouched", () => {
  const c = classifyFoundationSyncRetry({
    project: proj({ builder_sync_attempt: { weird: true } }),
    estimateId: "e1", estimate: est(),
  });
  assert.equal(c.mode, "blocked_unsupported");
  assert.equal(c.retryable, false);
});

R("B7 blocked_no_estimate: standalone project (no receipt, no estimate)", () => {
  const c = classifyFoundationSyncRetry({ project: proj(), estimateId: null, estimate: null });
  assert.equal(c.mode, "blocked_no_estimate");
  assert.equal(c.retryable, false);
  // A receipt whose estimate_id is empty is malformed — unsupported, not
  // merely unlinked — and is left untouched rather than retried against.
  const c2 = classifyFoundationSyncRetry({ project: proj({ builder_sync_attempt: { ...ATT, estimate_id: "" } }), estimateId: null, estimate: null });
  assert.equal(c2.mode, "blocked_unsupported");
});

R("B8 pending marker resumes even without a receipt on the project", () => {
  const c = classifyFoundationSyncRetry({
    project: proj(), estimateId: "e1",
    estimate: est({ price_acceptance_pending: { key: "op-9", kind: "builder_initial_freeze", started_at: "2026-01-01T00:00:00Z", estimate_id: "e1", builder_product_id: "bp1" } }),
  });
  assert.equal(c.mode, "resume_pending");
  assert.equal(c.retryable, true);
});

// ---------------- C. saveSession conflictDetected ----------------
const liveCurrent = { sourceId: "p1", editRevision: 3, loaded: true };

await R("C1 classified CAS conflict carries conflictDetected", async () => {
  const sess = createFoundationSaveSession();
  const outcome = await sess.run({
    sourceId: "p1", editRevision: 3, getCurrent: () => liveCurrent,
    saveSource: async () => { throw new Error("Foundation project changed in another session. Reload it before saving."); },
  });
  assert.equal(outcome.status, "conflict");
  assert.equal(outcome.conflictDetected, true);
});

await R("C2 409-status error classifies as conflict + detected", async () => {
  const sess = createFoundationSaveSession();
  const err = new Error("request failed"); err.status = 409;
  const outcome = await sess.run({
    sourceId: "p1", editRevision: 3, getCurrent: () => liveCurrent,
    saveSource: async () => { throw err; },
  });
  assert.equal(outcome.status, "conflict");
  assert.equal(outcome.conflictDetected, true);
});

await R("C3 generic failure: no conflictDetected (dialog must not open)", async () => {
  const sess = createFoundationSaveSession();
  const outcome = await sess.run({
    sourceId: "p1", editRevision: 3, getCurrent: () => liveCurrent,
    saveSource: async () => { throw new Error("network unreachable"); },
  });
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.conflictDetected, undefined);
});

await R("C4 builder-sync failure → partial + pending, never conflictDetected", async () => {
  const sess = createFoundationSaveSession();
  const outcome = await sess.run({
    sourceId: "p1", editRevision: 3, getCurrent: () => liveCurrent,
    saveSource: async () => ({ id: "p1", updated_date: "v2" }),
    syncBuilder: async () => { throw new Error("estimate write timed out"); },
  });
  assert.equal(outcome.status, "partial");
  assert.equal(outcome.builderSync, "pending");
  assert.equal(outcome.sourceSaved, true);
  assert.equal(outcome.sourceVersion, "v2");
  assert.equal(outcome.conflictDetected, undefined);
});

await R("C5 stale-context save → superseded, no conflictDetected", async () => {
  const sess = createFoundationSaveSession();
  const outcome = await sess.run({
    sourceId: "p1", editRevision: 3, getCurrent: () => ({ ...liveCurrent, editRevision: 9 }),
    saveSource: async () => { throw new Error("changed in another session"); },
  });
  assert.equal(outcome.status, "superseded");
  assert.equal(outcome.conflictDetected, undefined);
});

// ---------------- D/E. bundled entity-touching candidates ----------------
// In-memory entity store mimicking CAS semantics (updateMany matches
// {id, updated_date}; returns {updated:0|1}).
writeFileSync(resolve(TMP, "staffEntitiesStub.js"), `
export const __db = { FoundationProject: new Map(), AllInOneEstimate: new Map(), BuilderProduct: new Map(), BuilderPart: new Map(), BuilderPartGroup: new Map(), FoundationInventory: new Map(), LaborServiceInventory: new Map(), EstimateRevision: new Map() };
export const __ops = { gets: 0, filters: 0, creates: 0, updateManys: 0, deleteManys: 0 };
export const __fail = { updateManyOnce: new Map(), createOnce: new Map() };
let ver = 0;
const table = (name) => (__db[name] || (__db[name] = new Map()));
const clone = (r) => JSON.parse(JSON.stringify(r));
const match = (row, q) => Object.entries(q || {}).every(([k, v]) => JSON.stringify(row?.[k] ?? null) === JSON.stringify(v ?? null));
const bump = (row) => { row.updated_date = 'u' + (++ver); return row; };
function makeEntity(name) {
  const rows = table(name);
  let seq = 0;
  return {
    async get(id) { __ops.gets++; const r = rows.get(id); return r ? clone(r) : null; },
    async filter(query, sort, limit, skip) {
      __ops.filters++;
      let out = [...rows.values()].filter((r) => match(r, query)).map(clone);
      if (sort) out.sort((a, b) => String(a[sort] ?? '').localeCompare(String(b[sort] ?? '')));
      if (skip) out = out.slice(skip);
      if (limit) out = out.slice(0, limit);
      return out;
    },
    async list(sort, limit, skip) { return this.filter({}, sort, limit, skip); },
    async create(data) {
      __ops.creates++;
      const once = __fail.createOnce.get(name) || 0;
      if (once > 0) {
        if (once - 1 <= 0) __fail.createOnce.delete(name); else __fail.createOnce.set(name, once - 1);
        throw new Error('injected create failure');
      }
      const id = data.id || name.toLowerCase() + '-' + (++seq) + '-' + (rows.size + 1);
      const rec = bump({ ...clone(data), id, created_date: 't0' });
      rows.set(id, rec);
      return clone(rec);
    },
    async updateMany(query, update) {
      __ops.updateManys++;
      if (__fail.updateManyOnce.get(name) > 0) {
        __fail.updateManyOnce.set(name, __fail.updateManyOnce.get(name) - 1);
        throw new Error('injected updateMany failure');
      }
      const matched = [...rows.values()].filter((r) => match(r, query));
      if (matched.length !== 1) return { updated: 0 };
      const rec = matched[0];
      Object.assign(rec, clone(update?.$set || {}));
      bump(rec);
      rows.set(rec.id, rec);
      return { updated: 1 };
    },
    async deleteMany(query) {
      __ops.deleteManys++;
      const matched = [...rows.values()].filter((r) => match(r, query));
      matched.forEach((r) => rows.delete(r.id));
      return { deleted: matched.length };
    },
  };
}
export const staffEntities = new Proxy({}, { get: (_, name) => (typeof name === 'string' ? makeEntity(name) : undefined) });
export const __seed = (name, row) => { const rec = clone(row); if (!rec.updated_date) bump(rec); table(name).set(rec.id, rec); };
export const __rows = (name) => [...table(name).values()].map(clone);
`);
writeFileSync(resolve(TMP, "base44Stub.js"), `
export const base44 = {
  entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => [] }) }),
  functions: { invoke: async (name, payload) => {
    if (name === 'ensureBuilderPriceRevision') return { data: { revision: { id: 'rev-' + (payload?.idempotency_key || 'x').slice(-8), ...((payload && payload.revision) || {}) } } };
    return { data: {} };
  } },
  auth: { me: async () => ({ id: 'tester' }) },
};
export const isRetryableFunction = () => false;
`);

// The bundle must see the FROZEN remote-src mirror for every non-stubbed
// module, with candidates overriding their remote counterparts.
const mirror = resolve(DIR, "remote-src");
const cand = resolve(DIR, "candidates");
const MIRROR_POSIX = mirror.split(sep).join("/") + "/";
const CANDIDATES = new Set([
  "src/components/estimator/foundation/foundationBuilderRecovery.js",
  "src/components/estimator/foundation/foundationSyncRecovery.js",
  "src/components/estimator/foundation/foundationDraftRecovery.js",
  "src/components/estimator/foundation/foundationSaveSession.js",
]);
const EXTS = ["", ".js", ".jsx", ".ts", ".tsx", ".mjs"];
const resolveAbs = (noExt) => {
  for (const ext of EXTS) if (existsSync(noExt + ext)) return noExt + ext;
  for (const idx of ["/index.js", "/index.jsx", "/index.ts", "/index.tsx"]) if (existsSync(noExt + idx)) return noExt + idx;
  return null;
};
const resolveIn = (rootDir, relBase) => resolveAbs(join(rootDir, relBase));
const plugin = {
  name: "frozen",
  setup(b) {
    // Boundary stubs stay EXTERNAL (relative specifier) so the bundle and the
    // harness share ONE module instance — the in-memory entity store and its
    // __ops/__fail counters live in exactly one place.
    const stubs = {
      "@/components/staff/staffEntities": "./staffEntitiesStub.js",
      "@/api/base44Client": "./base44Stub.js",
    };
    b.onResolve({ filter: /.*/ }, (a) => {
      if (stubs[a.path]) return { path: stubs[a.path], external: true };
      if (a.path.startsWith("@/")) {
        const rel = "src/" + a.path.slice(2);
        if (CANDIDATES.has(rel)) {
          const c = resolveIn(cand, basename(rel));
          if (c) return { path: c };
        }
        const p = resolveIn(mirror, rel);
        if (p) return { path: p };
        return { errors: [{ text: `missing frozen source ${a.path} from ${a.importer}` }] };
      }
      if (a.path.startsWith("./") || a.path.startsWith("../")) {
        if (!a.importer) return null;
        const p = resolveAbs(resolve(dirname(a.importer), a.path));
        if (!p) return { errors: [{ text: `cannot resolve ${a.path} from ${a.importer}` }] };
        // Redirect to the candidate override when the resolved file is a
        // mirrored module we replaced.
        const pPosix = p.split(sep).join("/");
        if (pPosix.startsWith(MIRROR_POSIX) && CANDIDATES.has(pPosix.slice(MIRROR_POSIX.length))) {
          const c = resolveIn(cand, basename(p));
          if (c) return { path: c };
        }
        return { path: p };
      }
      return null; // bare packages external
    });
  },
};

const BUNDLED = [
  ["foundationBuilderRecovery", resolve(DIR, "candidates/foundationBuilderRecovery.js"), resolve(TMP, "bundle-foundationBuilderRecovery.mjs")],
];
for (const [, entry, outfile] of BUNDLED) {
  await build({
    entryPoints: [entry], bundle: true, format: "esm", platform: "node",
    outfile, logLevel: "silent", plugins: [plugin],
  });
}
globalThis.window = { localStorage: { getItem: (k) => (k === "sss_session_token" ? "tok-1" : null), setItem() {}, removeItem() {} }, location: { href: "http://test.local" } };
const rec = await import(pathToFileURL(resolve(TMP, "bundle-foundationBuilderRecovery.mjs")).href);
const stub = await import(pathToFileURL(resolve(TMP, "staffEntitiesStub.js")).href);
const { retryFoundationBuilderSync } = rec;
const { __db, __ops, __seed, __rows, __fail } = stub;

const reset = () => {
  for (const m of Object.values(__db)) m.clear();
  __ops.gets = __ops.filters = __ops.creates = __ops.updateManys = __ops.deleteManys = 0;
  __fail.updateManyOnce.clear();
  __fail.createOnce.clear();
};
// The acknowledgment gate requires a real estimate-line shape back from
// recordBuilderSave — module/project/estimate identity plus the revision it
// acknowledged — not just the snapshot stamp.
const ackedLine = (snapshot = "v1") => ({
  module_key: "foundation", project_id: "p1", estimate_id: "e1",
  builder_product_id: "bp1", line_id: "L1",
  updated_date_snapshot: snapshot, price_state: "current",
});

// Minimal saved foundation record (persisted shape: calc-priced items + totals)
const savedProject = () => ({
  id: "p1", updated_date: "v1", project_name: "P", status: "calculated",
  excavation_method: "hand_dig", project_concrete_type: "4000_ae",
  items: [{
    component_id: "i1", foundation_type: "spread_foot", quantity: 1,
    selected_concrete_id: "bag1", concrete_bags: 4, concrete_cost: 40,
    rebar_feet: 20, rebar_cost: 30, rebar_size: "#4",
    forming_qty: 2, forming_cost: 10, include_forming: true,
    excavation_volume_cy: 2, excavation_cost: 12, excavation_method: "hand_dig",
    pouring_hours: 1, pouring_cost: 15, finishing_hours: 1, finishing_cost: 14,
    include_rebar: true, include_finishing: true,
  }],
  walls: [], poles: [{
    component_id: "po1", pole_name: "pole A", selected_pole_id: "pole1",
    required_length_inches: 240, stock_pieces: 1, pole_cost: 120,
    include_pole_painting: false, pole_painting_cost: 0, total_cost: 120,
  }],
  wall_caps: [], signage_cabinets: [], selected_equipment: [],
  landscape: { cell_size_inches: 12, cells: {} },
  total_concrete_cost: 90, total_rebar_cost: 30, total_excavation_cost: 12,
  total_labor_cost: 29, total_equipment_cost: 0, total_forming_materials_cost: 10,
  total_pole_cost: 120, total_pole_painting_cost: 0, total_brick_cost: 0,
  total_fill_cost: 0, total_wall_cost: 0, total_wall_cap_cost: 0,
  total_signage_cabinet_cost: 0, total_landscape_cost: 0,
  customer_markup_percent: 20, customer_pricing: { applied: false },
  builder_sync_attempt: { schema_version: 1, key: "k-att", source_project_id: "p1", estimate_id: "e1", requested_at: "2026-01-01T00:00:00Z" },
});
const catalogInv = [
  { id: "bag1", material_type: "bagged_concrete", material_name: "Bagged 4000", cost_per_unit: 10 },
  { id: "pole1", material_type: "pole", material_name: "20ft Pole", pole_stock_price: 120, cost_per_unit: 120 },
];
const mkEstimate = (lineExtra = {}) => ({
  id: "e1", status: "draft",
  line_items: [{ module_key: "foundation", project_id: "p1", builder_product_id: "bp1", estimate_id: "e1", line_id: "L1", customer_quantity: 1, updated_date_snapshot: "v0", ...lineExtra }],
});
const mkBuilder = () => ({
  id: "bp1", estimate_id: "e1", estimate_line_id: "L1", module_key: "foundation",
  source_entity: "FoundationProject", source_project_id: "p1",
  builder_name: "Concrete", client_product_name: "Concrete",
  price_state: "current", frozen_cost: 500, builder_version: 3,
  quantity: 1, status: "in_progress", is_active: true,
});
const seedAll = ({ estimateLine = {}, withBuilder = true, attempt = true } = {}) => {
  const p = savedProject();
  if (!attempt) delete p.builder_sync_attempt;
  __seed("FoundationProject", p);
  __seed("AllInOneEstimate", mkEstimate(estimateLine));
  if (withBuilder) __seed("BuilderProduct", mkBuilder());
  catalogInv.forEach((r) => __seed("FoundationInventory", r));
};

await R("D1 invalid: missing anchors → nothing read or written", async () => {
  reset();
  const r1 = await retryFoundationBuilderSync({ sourceId: "", estimateId: "e1", expectedSourceVersion: "v1" });
  assert.equal(r1.status, "invalid");
  const r2 = await retryFoundationBuilderSync({ sourceId: "p1", estimateId: "e1" });
  assert.equal(r2.status, "invalid");
  assert.equal(r2.reason, "missing_source_version");
  assert.equal(__ops.gets, 0, "no entity reads on invalid input");
});

await R("D2 conflict: source moved under the acknowledged revision — no writes", async () => {
  reset(); seedAll();
  const r = await retryFoundationBuilderSync({ sourceId: "p1", estimateId: "e1", expectedSourceVersion: "vOLD" });
  assert.equal(r.status, "conflict");
  assert.equal(r.reason, "source_moved");
  assert.equal(__ops.updateManys, 0);
  assert.equal(__ops.creates, 0);
});

await R("D3 conflict: estimate unreadable → nothing written", async () => {
  reset(); seedAll();
  const r = await retryFoundationBuilderSync({
    sourceId: "p1", estimateId: "e1", expectedSourceVersion: "v1",
    deps: { getEstimate: async () => null },
  });
  assert.equal(r.status, "conflict");
  assert.equal(r.reason, "estimate_unreadable");
  assert.equal(__ops.updateManys, 0);
});

await R("D4 blocked: receipt names another estimate → recordSave never called", async () => {
  reset(); seedAll();
  __db.FoundationProject.get("p1").builder_sync_attempt.estimate_id = "eOTHER";
  let called = 0;
  const r = await retryFoundationBuilderSync({
    sourceId: "p1", estimateId: "e1", expectedSourceVersion: "v1",
    deps: { recordSave: async () => { called += 1; } },
  });
  assert.equal(r.status, "blocked");
  assert.equal(r.mode, "blocked_mismatch");
  assert.equal(called, 0);
});

await R("D5 already_synced: acknowledged receipt → recordSave never called", async () => {
  reset(); seedAll({ estimateLine: { updated_date_snapshot: "v1" } });
  let called = 0;
  const r = await retryFoundationBuilderSync({
    sourceId: "p1", estimateId: "e1", expectedSourceVersion: "v1",
    deps: { recordSave: async () => { called += 1; } },
  });
  assert.equal(r.status, "already_synced");
  assert.equal(called, 0);
});

await R("D6 resync_unacknowledged → recordSave called with line hint + record source + warning", async () => {
  reset(); seedAll();
  let got;
  const r = await retryFoundationBuilderSync({
    sourceId: "p1", estimateId: "e1", expectedSourceVersion: "v1",
    deps: { recordSave: async (a) => { got = a; return { line: ackedLine() }; } },
  });
  assert.equal(r.status, "synced");
  assert.equal(r.mode, "resync_unacknowledged");
  assert.deepEqual(got.line, { project_id: "p1", module_key: "foundation" });
  assert.equal(got.sourceProject.id, "p1");
  assert.equal(got.sourceProject.builder_calculation, undefined, "record basis when no capture supplied");
  assert.ok(r.warnings.includes("descriptor_basis:record"));
  assert.equal(got.expectedPendingKey, undefined);
});

await R("D7 builderCalculation + savedProject overlay forwarded for descriptor parity", async () => {
  reset(); seedAll();
  const ack = savedProject(); ack.updated_date = "v1";
  const bc = { totals: { grand_total: 321 }, delivery: { concreteTotal: 50 }, cabinet_cost: 0, landscape_cost: 0, section_total: 321 };
  let got;
  const r = await retryFoundationBuilderSync({
    sourceId: "p1", estimateId: "e1", expectedSourceVersion: "v1",
    savedProject: ack, builderCalculation: bc, liveTotal: 321,
    deps: { recordSave: async (a) => { got = a; return { line: ackedLine() }; } },
  });
  assert.equal(r.status, "synced");
  assert.equal(got.sourceProject.builder_calculation, bc, "transient capture attached");
  assert.equal(got.liveTotal, 321);
  assert.ok(!r.warnings.includes("descriptor_basis:record"));
});

await R("D8 resume_pending: expectedPendingKey forwarded; ack asserts line", async () => {
  reset(); seedAll({ estimateLine: { price_acceptance_pending: { key: "op-1", kind: "builder_initial_freeze", started_at: "2026-01-01T00:00:00Z", estimate_id: "e1", builder_product_id: "bp1" } } });
  let got;
  const r = await retryFoundationBuilderSync({
    sourceId: "p1", estimateId: "e1", expectedSourceVersion: "v1", expectedPendingKey: "op-1",
    deps: { recordSave: async (a) => { got = a; return { line: ackedLine() }; } },
  });
  assert.equal(r.status, "synced");
  assert.equal(r.mode, "resume_pending");
  assert.equal(got.expectedPendingKey, "op-1");
});

await R("D9 pending_key_changed → conflict, recordSave never called", async () => {
  reset(); seedAll({ estimateLine: { price_acceptance_pending: { key: "op-LIVE", kind: "builder_initial_freeze", started_at: "2026-01-01T00:00:00Z", estimate_id: "e1", builder_product_id: "bp1" } } });
  let called = 0;
  const r = await retryFoundationBuilderSync({
    sourceId: "p1", estimateId: "e1", expectedSourceVersion: "v1", expectedPendingKey: "op-STALE",
    deps: { recordSave: async () => { called += 1; } },
  });
  assert.equal(r.status, "conflict");
  assert.equal(r.reason, "pending_key_changed");
  assert.equal(called, 0);
});

await R("D10 recordSave throws → failed, markers retained, error surfaced", async () => {
  reset(); seedAll();
  const r = await retryFoundationBuilderSync({
    sourceId: "p1", estimateId: "e1", expectedSourceVersion: "v1",
    deps: { recordSave: async () => { throw new Error("estimate CAS failed"); } },
  });
  assert.equal(r.status, "failed");
  assert.match(r.error, /estimate CAS failed/);
});

await R("D11 unacknowledged line after replay → pending (not claimed synced)", async () => {
  reset(); seedAll();
  const r = await retryFoundationBuilderSync({
    sourceId: "p1", estimateId: "e1", expectedSourceVersion: "v1",
    deps: { recordSave: async () => ({ updated_date_snapshot: "vSTALE", estimate_id: "e1", module_key: "foundation", project_id: "p1" }) },
  });
  assert.equal(r.status, "pending");
});

// ---------------- E. REAL recordBuilderSave over the in-memory store ----------------
await R("E1 real end-to-end: first sync mints parts; retry creates ZERO new parts", async () => {
  reset(); seedAll();
  const r1 = await retryFoundationBuilderSync({ sourceId: "p1", estimateId: "e1", expectedSourceVersion: "v1" });
  assert.equal(r1.status, "synced", JSON.stringify(r1));
  const parts1 = __rows("BuilderPart");
  assert.ok(parts1.length >= 3, `expected real parts, got ${parts1.length}`);
  const keys1 = parts1.map((p) => p.part_key);
  assert.equal(new Set(keys1).size, keys1.length, "no duplicate part_key after first sync");
  const createsAfter1 = __ops.creates;
  assert.ok(createsAfter1 >= parts1.length, "creates counted");

  const r2 = await retryFoundationBuilderSync({ sourceId: "p1", estimateId: "e1", expectedSourceVersion: "v1" });
  assert.equal(r2.status, "already_synced", JSON.stringify(r2));
  assert.equal(__ops.creates, createsAfter1, "acknowledged retry mints nothing");
  const keys2 = __rows("BuilderPart").map((p) => p.part_key);
  assert.deepEqual([...keys2].sort(), [...keys1].sort(), "part set identical");
  // the estimate line now acknowledges v1
  const line = __rows("AllInOneEstimate")[0].line_items.find((i) => i.project_id === "p1");
  assert.equal(line.updated_date_snapshot, "v1");
});

await R("E2 forced re-sync while pending → converges on part_key, zero new creates on 2nd replay", async () => {
  reset(); seedAll({ estimateLine: { updated_date_snapshot: "v0" } });
  const r1 = await retryFoundationBuilderSync({ sourceId: "p1", estimateId: "e1", expectedSourceVersion: "v1" });
  assert.equal(r1.status, "synced");
  const creates1 = __ops.creates;
  const keys1 = __rows("BuilderPart").map((p) => p.part_key).sort();
  // Force the line unacknowledged again (as if the ack write was lost) then
  // replay the SAME retry — resync mode, no new creates may appear.
  __db.AllInOneEstimate.get("e1").line_items = __db.AllInOneEstimate.get("e1").line_items.map((i) => ({ ...i, updated_date_snapshot: "v0" }));
  const r2 = await retryFoundationBuilderSync({ sourceId: "p1", estimateId: "e1", expectedSourceVersion: "v1" });
  assert.equal(r2.status, "synced");
  assert.equal(__ops.creates, creates1, "replayed sync must not mint duplicate parts");
  const keys2 = __rows("BuilderPart").map((p) => p.part_key).sort();
  assert.deepEqual(keys2, keys1, "identical part_key set — convergence by key");
});

await R("E3 partial death mid-sync → retry completes, still no dup keys", async () => {
  reset(); seedAll();
  // Kill the first BuilderProduct.updateMany (the ensure-path identity patch)
  // AFTER some part creates may have queued — inject one create failure deeper
  // instead: first updateMany on BuilderPart dies once, then heals.
  __fail.updateManyOnce.set("BuilderProduct", 1);
  const r1 = await retryFoundationBuilderSync({ sourceId: "p1", estimateId: "e1", expectedSourceVersion: "v1" }).catch((e) => ({ status: "threw", error: String(e) }));
  // may fail or partially sync depending on where the injected failure landed
  const r2 = await retryFoundationBuilderSync({ sourceId: "p1", estimateId: "e1", expectedSourceVersion: "v1" });
  assert.ok(["synced", "already_synced"].includes(r2.status), JSON.stringify(r2));
  const keys = __rows("BuilderPart").map((p) => p.part_key);
  assert.equal(new Set(keys).size, keys.length, "no duplicate part_key after partial-then-retry");
  assert.ok(keys.length >= 3);
});

await R("E4 resume_pending replays the stored plan verbatim once, then already_synced", async () => {
  reset();
  const pendingKey = "op-freeze-1";
  const p = savedProject();
  __seed("FoundationProject", p);
  // Seed the Builder FIRST so the durable marker can pin the exact
  // builder_updated_date_before the interrupted operation observed.
  __seed("BuilderProduct", mkBuilder());
  const builderRev = __db.BuilderProduct.get("bp1").updated_date;
  __seed("AllInOneEstimate", mkEstimate({
    price_acceptance_pending: {
      key: pendingKey, kind: "builder_initial_freeze",
      started_at: new Date().toISOString(), estimate_id: "e1",
      estimate_line_id: "L1", builder_product_id: "bp1",
      builder_updated_date_before: builderRev,
      part_acceptance_plan: {
        part_updates: [
          { operation: "create", part_key: "foundation:item:0:concrete", data: { builder_product_id: "bp1", part_key: "foundation:item:0:concrete", part_name: "Concrete", part_type: "material", quantity: 4, unit_cost: 10, extended_cost: 40, is_active: true } },
          { operation: "create", part_key: "foundation:item:0:rebar", data: { builder_product_id: "bp1", part_key: "foundation:item:0:rebar", part_name: "Rebar", part_type: "material", quantity: 20, unit_cost: 1.5, extended_cost: 30, is_active: true } },
        ],
      },
      builder_patch: { price_state: "current", frozen_cost: 590 },
      line_patch: { updated_date_snapshot: "v1", price_state: "current", total_snapshot: 590 },
      revision: { reason: "initial_freeze" },
      skip_revision: true,
    },
  }));
  catalogInv.forEach((r) => __seed("FoundationInventory", r));

  const r1 = await retryFoundationBuilderSync({ sourceId: "p1", estimateId: "e1", expectedSourceVersion: "v1", expectedPendingKey: pendingKey });
  assert.equal(r1.status, "synced", JSON.stringify(r1));
  const keys = __rows("BuilderPart").map((x) => x.part_key).sort();
  assert.deepEqual(keys, ["foundation:item:0:concrete", "foundation:item:0:rebar"], "plan minted exactly its stored steps");
  const line = __rows("AllInOneEstimate")[0].line_items.find((i) => i.project_id === "p1");
  assert.ok(!line.price_acceptance_pending?.key, "marker cleared on completion");
  assert.equal(line.updated_date_snapshot, "v1");

  const r2 = await retryFoundationBuilderSync({ sourceId: "p1", estimateId: "e1", expectedSourceVersion: "v1" });
  assert.equal(r2.status, "already_synced");
  assert.equal(__rows("BuilderPart").length, 2, "replay after completion mints nothing");
});

await R("E5 resume with a foreign pending key → conflict, plan not replayed", async () => {
  reset();
  const pendingKey = "op-real";
  const p = savedProject();
  __seed("FoundationProject", p);
  __seed("BuilderProduct", mkBuilder());
  __seed("AllInOneEstimate", mkEstimate({
    price_acceptance_pending: { key: pendingKey, kind: "builder_initial_freeze", started_at: new Date().toISOString(), estimate_id: "e1", estimate_line_id: "L1", builder_product_id: "bp1", part_acceptance_plan: { part_updates: [] }, builder_patch: {}, line_patch: { updated_date_snapshot: "v1" }, skip_revision: true },
  }));
  const r = await retryFoundationBuilderSync({ sourceId: "p1", estimateId: "e1", expectedSourceVersion: "v1", expectedPendingKey: "op-WRONG" });
  assert.equal(r.status, "conflict");
  assert.equal(r.reason, "pending_key_changed");
  assert.equal(__rows("BuilderPart").length, 0, "no plan step ran");
});

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} model cases passed`);
if (passed !== results.length) {
  writeFileSync(resolve(DIR, "model-failures.json"), JSON.stringify(results.filter((r) => !r.ok), null, 1));
  console.log("FAILURES written to model-failures.json");
  process.exit(1);
}
writeFileSync(resolve(DIR, "verify-o004t-model-results.json"), JSON.stringify({ total: results.length, passed, results }, null, 1));
console.log("PASS o004t model");
process.exit(0);
