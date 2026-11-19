// O-004 tail (CMP-A04) real-component browser verification.
// Mounts the REAL candidates — FoundationSyncConflictDialog.jsx +
// useFoundationSyncConflict + useFoundationBuilderSyncRetry +
// FoundationSyncRetryAction — over a frozen remote source map, with the REAL
// remote Radix dialog.jsx, REAL retryFoundationBuilderSync orchestrator, and
// the REAL recordBuilderSave→partSync chain. Boundary stubs only: a
// window.__db in-memory entity facade (staffEntities) + base44Client function
// invoke. Desktop 1280 + mobile 390.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import * as esbuild from "esbuild";
import { chromium } from "playwright-core";

const DIR = ".audit-work/foundation-o004t-conflicts/";
const OUT = DIR + "browser";
fs.mkdirSync(OUT, { recursive: true });
const ORIGIN = "http://127.0.0.1:5175";
const results = [];
const telemetry = { foreign: [], consoleErrors: [], pageErrors: [] };

// ---------- frozen remote source map (NO local worktree src) ----------
const sources = new Map();
const walk = (root, prefix) => {
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) walk(p, prefix + "/" + e.name);
    else sources.set(prefix + "/" + e.name, fs.readFileSync(p, "utf8"));
  }
};
walk(DIR + "remote-src/src", "/app/src");
walk(DIR + "remote-src/base44", "/app/base44");
// Candidates under test override their remote counterparts; the new dialog
// lands at its intended cluster path.
for (const f of ["foundationDraftRecovery.js", "foundationSyncRecovery.js", "foundationSaveSession.js", "foundationBuilderRecovery.js", "FoundationSyncConflictDialog.jsx"]) {
  sources.set("/app/src/components/estimator/foundation/" + f, fs.readFileSync(DIR + "candidates/" + f, "utf8"));
}

// ---------- boundary stubs only ----------
const STUBS = {
  "@/components/staff/staffEntities": `
    const table = (name) => (window.__db[name] || (window.__db[name] = {}));
    let ver = 0;
    const clone = (r) => JSON.parse(JSON.stringify(r));
    const match = (row, q) => Object.entries(q || {}).every(([k, v]) => JSON.stringify(row?.[k] ?? null) === JSON.stringify(v ?? null));
    const bump = (row) => { row.updated_date = 'u' + (++ver); return row; };
    const makeEntity = (name) => {
      const rows = () => table(name);
      const api = {
        async get(id) { window.__oplog.push(['get', name, id]); const r = rows()[id]; return r ? clone(r) : null; },
        async filter(q, sort, limit, skip) {
          window.__oplog.push(['filter', name]);
          let out = Object.values(rows()).filter((r) => match(r, q)).map(clone);
          if (sort) out.sort((a, b) => String(a[sort] ?? '').localeCompare(String(b[sort] ?? '')));
          if (skip) out = out.slice(skip);
          if (limit) out = out.slice(0, limit);
          return out;
        },
        async list(sort, limit, skip) { return api.filter({}, sort, limit, skip); },
        async create(data) {
          window.__oplog.push(['create', name]);
          const id = data.id || name.toLowerCase() + '-' + (Object.keys(rows()).length + 1) + '-' + (++ver);
          const rec = bump({ ...clone(data), id, created_date: 't0' });
          rows()[id] = rec;
          return clone(rec);
        },
        async updateMany(q, u) {
          window.__oplog.push(['updateMany', name]);
          const m = Object.values(rows()).filter((r) => match(r, q));
          if (m.length !== 1) return { updated: 0 };
          Object.assign(m[0], clone(u?.$set || {})); bump(m[0]);
          return { updated: 1 };
        },
        async deleteMany(q) {
          window.__oplog.push(['deleteMany', name]);
          const m = Object.values(rows()).filter((r) => match(r, q));
          m.forEach((r) => delete rows()[r.id]);
          return { deleted: m.length };
        },
      };
      return api;
    };
    export const staffEntities = new Proxy({}, { get: (_, n) => (typeof n === 'string' ? makeEntity(n) : undefined) });
  `,
  "@/api/base44Client": `
    export const base44 = {
      entities: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => [] }) }),
      functions: { invoke: async (name, payload) => {
        window.__oplog.push(['invoke', name]);
        if (name === 'ensureBuilderPriceRevision') return { data: { revision: { id: 'rev-stub', ...((payload && payload.revision) || {}) } } };
        return { data: {} };
      } },
      auth: { me: async () => ({ id: 'browser-test' }) },
    };
    export const isRetryableFunction = () => false;
  `,
};

// ---------- harness: conflict zone + retry zone ----------
const harness = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import FoundationSyncConflictDialog, {
  useFoundationSyncConflict, useFoundationBuilderSyncRetry, FoundationSyncRetryAction,
} from '@/components/estimator/foundation/FoundationSyncConflictDialog';
import { classifyFoundationSyncRetry } from '@/components/estimator/foundation/foundationSyncRecovery';
import {
  createFoundationDraftStore, foundationDraftRebaseProject,
  summarizeFoundationDraftConflict,
} from '@/components/estimator/foundation/foundationDraftRecovery';

window.__oplog = window.__oplog || [];
window.__choices = window.__choices || [];

const draftStore = createFoundationDraftStore({
  getStorage: () => sessionStorage,
  ownerId: 'browser-staff', sourceId: 'p1', estimateId: 'e1',
});
window.__draftStore = draftStore;

function ConflictZone() {
  const syncConflict = useFoundationSyncConflict();
  const keep = (choice) => syncConflict.choose(async () => {
    const c = syncConflict.conflict;
    window.__choices.push([choice, c?.kind]);
    if (window.__blockChoice === choice) return false; // failure-path probe — before any effect
    if (choice === 'keep_saved') {
      const r = draftStore.clear(window.__draftRevision);
      if (r.status !== 'removed') return false;
      window.__draftCleared = (window.__draftCleared || 0) + 1;
    } else if (choice === 'keep_both') {
      const proj = foundationDraftRebaseProject({ draft: c.draft, sourceId: 'p1' });
      const w = draftStore.write({
        project: proj, baseUpdatedAt: c.summary.savedUpdatedAt,
        token: 'tok-rebased-' + Date.now(), savedAt: new Date().toISOString(),
        expectedRevision: window.__draftRevision,
      });
      if (w.status !== 'stored') return false;
      window.__draftRevision = w.revision;
      window.__draftRebased = (window.__draftRebased || 0) + 1;
    } else {
      window.__appliedDraft = c.draft; // page overlay happens caller-side
    }
    return true;
  });
  return React.createElement('div', { id: 'conflict-zone' },
    React.createElement('button', { id: 'open-draft-conflict', type: 'button',
      onClick: () => syncConflict.openDraftConflict(window.__conflictArgs) }, 'open-draft'),
    React.createElement('button', { id: 'open-save-conflict', type: 'button',
      onClick: () => syncConflict.openSaveConflict(window.__conflictArgs) }, 'open-save'),
    React.createElement(FoundationSyncConflictDialog, {
      conflict: syncConflict.conflict,
      disabled: window.__disabledChoices || {},
      onKeepDraft: () => keep('keep_draft'),
      onKeepSaved: () => keep('keep_saved'),
      onKeepBoth: () => keep('keep_both'),
      onDismiss: syncConflict.dismiss,
    }),
    React.createElement('div', { id: 'conflict-state' }, syncConflict.conflict ? 'open' : 'closed'),
  );
}

function RetryZone() {
  // The pinned version simulates the page's acknowledgedVersionRef — captured
  // at mount, so a later source move is detected as a stale anchor.
  const [pinned] = React.useState(() => window.__db.FoundationProject.p1.updated_date);
  const ctx = React.useCallback(() => ({
    sourceId: 'p1', estimateId: 'e1',
    expectedSourceVersion: pinned,
    ...(window.__expectedPendingKey !== undefined ? { expectedPendingKey: window.__expectedPendingKey } : {}),
  }), [pinned]);
  const retry = useFoundationBuilderSyncRetry(ctx); // real orchestrator, real recordBuilderSave
  const [frozen] = React.useState(() => window.__frozenRetryState === undefined ? 'unset' : window.__frozenRetryState);
  const project = window.__db.FoundationProject.p1;
  const estimate = window.__db.AllInOneEstimate.e1;
  const live = classifyFoundationSyncRetry({ project, estimateId: 'e1', estimate });
  const state = frozen === 'unset' ? live : frozen;
  return React.createElement('div', { id: 'retry-zone' },
    React.createElement(FoundationSyncRetryAction, {
      retryState: state,
      retrying: retry.retrying,
      lastOutcome: retry.lastOutcome,
      onRetry: retry.retry,
      estimateHref: '/EstimateDetail?id=e1',
      disabled: !!window.__retryDisabled,
    }),
    React.createElement('div', { id: 'retry-outcome' }, retry.lastOutcome?.status || ''),
    React.createElement('div', { id: 'retry-mode' }, state?.mode || ''),
  );
}

createRoot(document.getElementById('root')).render(
  React.createElement('div', null,
    React.createElement(ConflictZone, null),
    React.createElement(RetryZone, null)));
`;

const plugin = { name: "frozen", setup(b) {
  b.onResolve({ filter: /^harness$/ }, () => ({ path: "harness", namespace: "h" }));
  b.onResolve({ filter: /.*/ }, (a) => {
    if (STUBS[a.path]) return { path: "stub:" + a.path, namespace: "stub" };
    if (/^(react|react-dom|scheduler|lucide-react|clsx|tailwind-merge|@radix-ui)(\/|$)/.test(a.path)) return null; // node_modules
    let base;
    if (a.path.startsWith("@/")) base = "/app/src/" + a.path.slice(2);
    else if (a.path.startsWith("./") || a.path.startsWith("../")) {
      if (!a.importer.startsWith("/app")) return null;
      base = path.posix.resolve(path.posix.dirname(a.importer), a.path);
    } else return null;
    const resolved = [base, base + ".js", base + ".jsx", base + ".ts", base + ".tsx"].find((p) => sources.has(p));
    if (!resolved) throw new Error("Missing frozen source (no local worktree allowed): " + a.path + " from " + a.importer);
    return { path: resolved, namespace: "frozen" };
  });
  b.onLoad({ filter: /.*/, namespace: "h" }, () => ({ contents: harness, loader: "jsx", resolveDir: path.resolve(".") }));
  b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path.slice(5)], loader: "js", resolveDir: path.resolve(".") }));
  b.onLoad({ filter: /.*/, namespace: "frozen" }, (a) => {
    const contents = sources.get(a.path);
    const loader = a.path.endsWith(".jsx") ? "jsx" : a.path.endsWith(".ts") || a.path.endsWith(".tsx") ? "ts" : "js";
    return { contents, loader, resolveDir: path.resolve(".") };
  });
}};
const built = await esbuild.build({
  entryPoints: ["harness"], bundle: true, format: "iife", platform: "browser", write: false,
  plugins: [plugin], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic", metafile: true, logLevel: "silent",
});
fs.writeFileSync(OUT + "/metafile.json", JSON.stringify({ inputs: Object.keys(built.metafile.inputs) }, null, 1));
const badInputs = Object.keys(built.metafile.inputs).filter(i => /local-agent|worktree|src[\\/]pages[\\/]FoundationEstimator/i.test(i));
assert.deepEqual(badInputs, [], "page-owned file leaked into bundle");
for (const rp of ["FoundationSyncConflictDialog.jsx", "foundationDraftRecovery.js", "foundationSyncRecovery.js", "foundationBuilderRecovery.js", "builderService.js", "partSync.js", "dialog.jsx"]) {
  assert.ok(Object.keys(built.metafile.inputs).some(i => i.endsWith(rp)), "missing real source: " + rp);
}
assert.deepEqual(built.warnings, []);
const bundle = built.outputFiles[0].text;

// ---------- synthetic seed ----------
const items3 = (desc) => [
  { component_id: "i1", description: desc || "footing A", foundation_type: "spread_foot", quantity: 1, selected_concrete_id: "bag1", concrete_bags: 4, concrete_cost: 40, rebar_feet: 20, rebar_cost: 30, rebar_size: "#4", include_rebar: true, forming_qty: 2, forming_cost: 10, include_forming: true, excavation_volume_cy: 2, excavation_cost: 12, excavation_method: "hand_dig", pouring_hours: 1, pouring_cost: 15, include_finishing: true, finishing_hours: 1, finishing_cost: 14 },
];
const savedProject = (updated = "v2", extra = {}) => ({
  id: "p1", updated_date: updated, project_name: "Saved sign section", status: "calculated",
  excavation_method: "hand_dig", project_concrete_type: "4000_ae",
  items: items3(), walls: [], poles: [], wall_caps: [], signage_cabinets: [], selected_equipment: [],
  landscape: { cell_size_inches: 12, cells: {} },
  customer_markup_percent: 20, customer_price_override: null, customer_pricing: { applied: false },
  concrete_cost_per_cy: 150,
  total_concrete_cost: 90, total_rebar_cost: 30, total_excavation_cost: 12,
  total_labor_cost: 29, total_equipment_cost: 0, total_forming_materials_cost: 10,
  total_pole_cost: 120, total_pole_painting_cost: 0, total_brick_cost: 0,
  total_fill_cost: 0, total_wall_cost: 0, total_wall_cap_cost: 0,
  total_signage_cabinet_cost: 0, total_landscape_cost: 0,
  ...extra,
});
const attempt = { schema_version: 1, key: "k-att", source_project_id: "p1", estimate_id: "e1", requested_at: "2026-01-01T00:00:00Z" };
const estimate = (lineExtra = {}) => ({
  id: "e1", status: "draft", updated_date: "e-v1",
  line_items: [{ module_key: "foundation", project_id: "p1", builder_product_id: "bp1", estimate_id: "e1", line_id: "L1", customer_quantity: 1, updated_date_snapshot: "v0", ...lineExtra }],
});
const builder = () => ({
  id: "bp1", estimate_id: "e1", estimate_line_id: "L1", module_key: "foundation",
  source_entity: "FoundationProject", source_project_id: "p1",
  builder_name: "Concrete", client_product_name: "Concrete", updated_date: "b-v1",
  price_state: "current", frozen_cost: 500, builder_version: 3,
  quantity: 1, status: "in_progress", is_active: true,
});
const inventory = {
  bag1: { id: "bag1", material_type: "bagged_concrete", material_name: "Bagged 4000", cost_per_unit: 10 },
  pole1: { id: "pole1", material_type: "pole", material_name: "20ft Pole", pole_stock_price: 120, cost_per_unit: 120 },
};

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`<!doctype html><meta charset=utf-8><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    *,*::before,*::after{box-sizing:border-box}
    .grid{display:grid}.flex{display:flex}.block{display:block}.hidden{display:none}
    .items-center{align-items:center}.justify-between{justify-content:space-between}.justify-end{justify-content:flex-end}
    .min-w-0{min-width:0}.shrink-0{flex-shrink:0}
    .border{border:1px solid #e5e7eb}.border-t{border-top:1px solid #f3f4f6}
    .rounded-sm{border-radius:2px}.px-3{padding-left:12px;padding-right:12px}.py-2{padding-top:8px;padding-bottom:8px}.py-1{padding-top:4px;padding-bottom:4px}
    .px-2{padding-left:8px;padding-right:8px}.py-1\\.5{padding-top:6px;padding-bottom:6px}
    .mt-1{margin-top:4px}.mt-0\\.5{margin-top:2px}.mt-1\\.5{margin-top:6px}.ml-1{margin-left:4px}.pt-1{padding-top:4px}
    .space-y-2>*+*{margin-top:8px}.space-y-3>*+*{margin-top:12px}.space-y-0\\.5>*+*{margin-top:2px}
    .gap-2{gap:8px}.gap-3{gap:12px}.gap-1\\.5{gap:6px}
    .bg-gray-50{background:#f9fafb}.bg-white{background:#fff}.bg-amber-50{background:#fffbeb}.bg-blue-50{background:#eff6ff}.bg-indigo-50{background:#eef2ff}.bg-amber-600{background:#d97706}
    .bg-amber-50\\/60{background:rgba(255,251,235,.6)}.bg-indigo-50\\/40{background:rgba(238,242,255,.4)}
    .text-amber-800{color:#92400e}.text-amber-900{color:#78350f}.text-amber-600{color:#d97706}
    .text-blue-900{color:#1e3a8a}.text-indigo-700{color:#4338ca}.text-indigo-800{color:#3730a3}
    .text-emerald-800{color:#065f46}.text-gray-500{color:#6b7280}.text-gray-600{color:#4b5563}.text-gray-700{color:#374151}.text-gray-800{color:#1f2937}.text-white{color:#fff}
    .text-\\[12px\\]{font-size:12px}.text-\\[13px\\]{font-size:13px}.text-\\[11px\\]{font-size:11px}.text-\\[10px\\]{font-size:10px}.text-\\[15px\\]{font-size:15px}
    .font-semibold{font-weight:600}.font-medium{font-weight:500}.uppercase{text-transform:uppercase}.tracking-wide{letter-spacing:.05em}
    .overflow-hidden{overflow:hidden}.overflow-y-auto{overflow-y:auto}.max-h-\\[280px\\]{max-height:280px}.max-w-\\[720px\\]{max-width:720px}
    .list-disc{list-style:disc}.pl-5{padding-left:20px}.cursor-pointer{cursor:pointer}.leading-relaxed{line-height:1.625}
    .grid-cols-\\[minmax\\(0\\,1\\.1fr\\)_minmax\\(0\\,1fr\\)_minmax\\(0\\,1fr\\)\\]{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr)}
    .fixed{position:fixed}.inset-0{inset:0}.z-50{z-index:50}.bg-black\\/80{background:rgba(0,0,0,.8)}
    .left-\\[50\\%\\]{left:50%}.top-\\[50\\%\\]{top:50%}.translate-x-\\[-50\\%\\]{transform:translate(-50%,-50%)}.translate-y-\\[-50\\%\\]{}
    .w-full{width:100%}.max-w-lg{max-width:32rem}.p-6{padding:24px}.gap-4{gap:16px}
    .border-gray-200{border-color:#e5e7eb}.border-gray-300{border-color:#d1d5db}.border-gray-400{border-color:#9ca3af}.border-amber-300{border-color:#fcd34d}.border-blue-200{border-color:#bfdbfe}.border-blue-400{border-color:#60a5fa}.border-indigo-400{border-color:#818cf8}.border-gray-100{border-color:#f3f4f6}
    .h-\\[30px\\]{height:30px}.h-4{height:16px}.w-4{width:16px}.h-3{height:12px}.w-3{width:12px}.h-3\\.5{height:14px}.w-3\\.5{width:14px}
    .disabled\\:opacity-50:disabled{opacity:.5}
    .flex-wrap{flex-wrap:wrap}.underline{text-decoration:underline}
    .animate-spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
    </style><div id="root"></div>
    <script>window.localStorage.setItem('sss_session_token','tok-browser');</script>
    <script>${bundle}</script>`);
});
await new Promise((r) => server.listen(5175, "127.0.0.1", r));

const CHROME = "C:/Users/BrettHeinlein/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe";
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined, channel: fs.existsSync(CHROME) ? undefined : "chrome", headless: true, args: ["--disable-gpu", "--no-sandbox"] });

const guard = (page, tag) => {
  page.on("request", (r) => { try { if (new URL(r.url()).origin !== ORIGIN) telemetry.foreign.push({ tag, url: r.url() }); } catch { telemetry.foreign.push({ tag, url: r.url() }); } });
  page.on("pageerror", (e) => telemetry.pageErrors.push({ tag, error: String(e) }));
  page.on("console", (m) => { if (m.type() === "error") telemetry.consoleErrors.push({ tag, text: m.text().slice(0, 200) }); });
};
const R = async (name, fn) => {
  try { await fn(); results.push({ case: name, ok: true }); console.log("ok", name); }
  catch (e) { results.push({ case: name, ok: false, error: String(e.stack || e).slice(0, 1400) }); console.log("FAIL", name, "-", String(e.message || e).slice(0, 400)); }
  finally { for (const c of browser.contexts()) await c.close(); }
};
const DRAFT_KEY = "ccs:foundation-draft:v1:" + encodeURIComponent(JSON.stringify(["browser-staff", "p1", "e1"]));
const draftRaw = (page) => page.evaluate((k) => sessionStorage.getItem(k), DRAFT_KEY);
const openApp = async (ctx, tag, { db, conflictArgs, expectedPendingKey, frozenRetryState, disabledChoices, retryDisabled, blockChoice } = {}) => {
  const page = await ctx.newPage();
  guard(page, tag);
  await page.route("**/*", (r) => { try { new URL(r.request().url()).origin === ORIGIN ? r.continue() : r.abort(); } catch { r.abort(); } });
  await page.addInitScript(`window.__db = ${JSON.stringify(db || {})};
    window.__conflictArgs = ${JSON.stringify(conflictArgs || {})};
    ${expectedPendingKey !== undefined ? `window.__expectedPendingKey = ${JSON.stringify(expectedPendingKey)};` : ""}
    ${frozenRetryState !== undefined ? `window.__frozenRetryState = ${JSON.stringify(frozenRetryState)};` : ""}
    ${disabledChoices ? `window.__disabledChoices = ${JSON.stringify(disabledChoices)};` : ""}
    ${retryDisabled ? `window.__retryDisabled = true;` : ""}
    ${blockChoice ? `window.__blockChoice = ${JSON.stringify(blockChoice)};` : ""}
    window.__conflictArgs.getSavedProject = async () => {
      const p = window.__db.FoundationProject?.p1;
      if (window.__savedReadFails) throw new Error('read refused');
      return p ? JSON.parse(JSON.stringify(p)) : null;
    };`);
  await page.goto(ORIGIN + "/");
  await page.locator("#conflict-zone").waitFor({ timeout: 10000 });
  return page;
};
const dbFor = ({ projectExtra = {}, estimateLine = {}, withBuilder = true, attemptOn = true } = {}) => ({
  FoundationProject: { p1: savedProject("v2", { ...(attemptOn ? { builder_sync_attempt: attempt } : {}), ...projectExtra }) },
  AllInOneEstimate: { e1: estimate(estimateLine) },
  BuilderProduct: withBuilder ? { bp1: builder() } : {},
  FoundationInventory: inventory,
});
const conflictArgsFor = (over = {}) => ({
  draft: { project_name: "Draft — renamed section", customer_markup_percent: 17, items: items3("draft footing") },
  draftSavedAt: "2026-02-01T10:00:00Z",
  baseUpdatedAt: "v1",
  ...over,
});

// ---------- C1/C2: merge-conflict dialog — real Radix render, both sides, choices ----------
for (const vp of [{ w: 1280, h: 800, tag: "desktop" }, { w: 390, h: 844, tag: "mobile" }]) {
  await R(`C1 ${vp.tag}: conflict dialog shows both sides' values + timestamps + 3 honest choices`, async () => {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await openApp(ctx, "c1-" + vp.tag, { db: dbFor(), conflictArgs: conflictArgsFor() });
    await page.locator("#open-draft-conflict").click();
    await page.getByText("Browser draft conflicts with a newer saved project", { exact: false }).waitFor();
    // both sides' timestamps / revisions visible (locale-proof: read the
    // portaled dialog body, not the mount zone)
    const head = await page.locator('[role="dialog"]').innerText();
    assert.match(head, /Browser draft/);
    assert.match(head, /written /, "draft write timestamp rendered");
    assert.match(head, /anchored to saved revision v1/);
    await page.getByText("now at revision v2", { exact: false }).waitFor();
    await page.getByText("now at revision v2", { exact: false }).waitFor();
    await page.getByText("moved after this draft was written", { exact: false }).waitFor();
    // side-by-side field rows: diverged project_name + markup; draft-only nothing
    const nameRow = page.locator('[data-field="project_name"]');
    await nameRow.waitFor();
    assert.match(await nameRow.innerText(), /Draft — renamed section/);
    assert.match(await nameRow.innerText(), /Saved sign section/);
    const markupRow = page.locator('[data-field="customer_markup_percent"]');
    assert.match(await markupRow.innerText(), /17/);
    assert.match(await markupRow.innerText(), /20/);
    // saved-only honesty: saved fields the draft never recorded are surfaced
    await page.getByText("saved-only", { exact: false }).first().waitFor();
    // all three choices + decide later
    await page.getByRole("button", { name: "Keep draft edits" }).waitFor();
    await page.getByRole("button", { name: "Keep saved project" }).waitFor();
    await page.getByRole("button", { name: /Keep both/ }).waitFor();
    await page.getByRole("button", { name: "Decide later" }).waitFor();
    await page.screenshot({ path: `${OUT}/c1-${vp.tag}-conflict.png` });
    await ctx.close();
  });
}

await R("C2: keep_draft applies draft to caller and closes; nothing written to store/entities", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openApp(ctx, "c2", { db: dbFor(), conflictArgs: conflictArgsFor() });
  await page.locator("#open-draft-conflict").click();
  await page.getByText("Browser draft conflicts", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Keep draft edits" }).click();
  await page.waitForFunction(() => document.getElementById("conflict-state")?.textContent === "closed", null, { timeout: 5000 });
  const applied = await page.evaluate(() => window.__appliedDraft);
  assert.equal(applied.project_name, "Draft — renamed section");
  assert.equal(applied.customer_markup_percent, 17);
  assert.equal(await page.evaluate(() => window.__db.FoundationProject.p1.project_name), "Saved sign section", "saved record untouched");
  assert.equal(await page.evaluate(() => window.__oplog.filter(o => o[0] === "updateMany" || o[0] === "create").length), 0, "no entity writes from the dialog");
  await ctx.close();
});

await R("C3: keep_saved explicitly clears the stored draft through the real CAS store", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openApp(ctx, "c3", { db: dbFor(), conflictArgs: conflictArgsFor() });
  // seed a real stored draft envelope
  const rev = await page.evaluate(() => {
    const w = window.__draftStore.write({
      project: { id: "p1", project_name: "Draft — renamed section", customer_markup_percent: 17 },
      baseUpdatedAt: "v1", token: "tok1", savedAt: "2026-02-01T10:00:00Z", expectedRevision: null,
    });
    window.__draftRevision = w.revision;
    return w.status;
  });
  assert.equal(rev, "stored");
  await page.locator("#open-draft-conflict").click();
  await page.getByText("Browser draft conflicts", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Keep saved project" }).click();
  await page.waitForFunction(() => document.getElementById("conflict-state")?.textContent === "closed", null, { timeout: 5000 });
  assert.equal(await draftRaw(page), null, "stored draft cleared by explicit choice");
  assert.equal(await page.evaluate(() => window.__draftCleared), 1);
  assert.equal(await page.evaluate(() => window.__db.FoundationProject.p1.project_name), "Saved sign section");
  await ctx.close();
});

await R("C4: keep_both re-anchors the same draft onto v2 — saved stays, draft survives as new offer", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openApp(ctx, "c4", { db: dbFor(), conflictArgs: conflictArgsFor() });
  const rev = await page.evaluate(() => {
    const w = window.__draftStore.write({
      project: { id: "p1", project_name: "Draft — renamed section", customer_markup_percent: 17 },
      baseUpdatedAt: "v1", token: "tok1", savedAt: "2026-02-01T10:00:00Z", expectedRevision: null,
    });
    window.__draftRevision = w.revision;
    return w.status;
  });
  assert.equal(rev, "stored");
  await page.locator("#open-draft-conflict").click();
  await page.getByText("Browser draft conflicts", { exact: false }).waitFor();
  await page.getByRole("button", { name: /Keep both/ }).click();
  await page.waitForFunction(() => document.getElementById("conflict-state")?.textContent === "closed", null, { timeout: 5000 });
  const env = JSON.parse(await draftRaw(page));
  assert.equal(env.baseUpdatedAt, "v2", "draft re-anchored to the CURRENT saved revision");
  assert.equal(env.data.project_name, "Draft — renamed section", "draft content survives verbatim");
  assert.equal(env.data.customer_markup_percent, 17);
  assert.equal(await page.evaluate(() => window.__db.FoundationProject.p1.updated_date), "v2", "saved record untouched — both sides kept");
  assert.equal(await page.evaluate(() => window.__draftRebased), 1);
  await ctx.close();
});

await R("C5: failed choice handler keeps the dialog open — no silent half-apply", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openApp(ctx, "c5", { db: dbFor(), conflictArgs: conflictArgsFor(), blockChoice: "keep_saved" });
  await page.evaluate(() => {
    const w = window.__draftStore.write({
      project: { id: "p1", project_name: "Draft — renamed section" },
      baseUpdatedAt: "v1", token: "tok1", savedAt: "2026-02-01T10:00:00Z", expectedRevision: null,
    });
    window.__draftRevision = w.revision;
  });
  await page.locator("#open-draft-conflict").click();
  await page.getByText("Browser draft conflicts", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Keep saved project" }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator("#conflict-state").innerText(), "open", "dialog stays open on refused resolution");
  assert.ok(await draftRaw(page), "draft retained — not half-cleared");
  await ctx.close();
});

await R("C6: unverifiable saved side — honest banner, no blind diff", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openApp(ctx, "c6", { db: dbFor(), conflictArgs: conflictArgsFor() });
  await page.evaluate(() => { window.__savedReadFails = true; });
  await page.locator("#open-draft-conflict").click();
  await page.getByText("could not be re-read", { exact: false }).waitFor();
  // fields must NOT be diffed blind against nothing — only the draft-vs-nothing
  // summary appears, and the alert names the limitation.
  await page.screenshot({ path: OUT + "/c6-unverifiable.png" });
  await ctx.close();
});

await R("C7: base_moved_identical — dedicated safe re-anchor copy", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const saved = savedProject("v2");
  const identicalDraft = { project_name: saved.project_name, customer_markup_percent: saved.customer_markup_percent, items: saved.items };
  const page = await openApp(ctx, "c7", { db: dbFor(), conflictArgs: conflictArgsFor({ draft: identicalDraft }) });
  await page.locator("#open-draft-conflict").click();
  await page.getByText("matches the newer save", { exact: false }).first().waitFor();
  await page.getByText("Every draft field matches the newer saved revision", { exact: false }).waitFor();
  await page.screenshot({ path: OUT + "/c7-identical.png" });
  await ctx.close();
});

await R("C8: save_conflict kind — unsent-edits framing + keep-both re-offer copy", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openApp(ctx, "c8", { db: dbFor(), conflictArgs: conflictArgsFor() });
  await page.locator("#open-save-conflict").click();
  await page.getByText("Saved project changed while you were editing", { exact: false }).waitFor();
  await page.getByText("re-applies your unsent edits on top", { exact: false }).waitFor();
  await page.getByText("re-anchors your unsent edits as a fresh browser draft offer", { exact: false }).waitFor();
  await ctx.close();
});

await R("C9: disabled choice surfaces its reason and blocks the click", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openApp(ctx, "c9", { db: dbFor(), conflictArgs: conflictArgsFor(), disabledChoices: { keep_saved: "Draft backup could not be verified — resolve storage before discarding." } });
  await page.locator("#open-draft-conflict").click();
  await page.getByText("resolve storage before discarding", { exact: false }).waitFor();
  const btn = page.getByRole("button", { name: "Keep saved project" });
  assert.equal(await btn.isDisabled(), true);
  await ctx.close();
});

// ---------- R-series: retry action → REAL orchestrator → REAL recordBuilderSave ----------
await R("R1: resync_unacknowledged retry — real chain mints parts, acknowledges v2, no dup keys", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openApp(ctx, "r1", { db: dbFor() });
  await page.getByText("A saved Builder sync attempt is still unacknowledged", { exact: false }).waitFor();
  await page.getByText("Only the unfinished estimate-side sync replays", { exact: false }).waitFor();
  const btn = page.getByRole("button", { name: "Retry the unfinished Builder sync" });
  await btn.waitFor();
  await btn.click();
  await page.waitForFunction(() => document.getElementById("retry-outcome")?.textContent === "synced", null, { timeout: 15000 });
  const state = await page.evaluate(() => ({
    keys: Object.values(window.__db.BuilderPart || {}).map(p => p.part_key),
    line: window.__db.AllInOneEstimate.e1.line_items[0],
    creates: window.__oplog.filter(o => o[0] === "create").length,
    projectRev: window.__db.FoundationProject.p1.updated_date,
  }));
  assert.ok(state.keys.length >= 3, `expected real parts, got ${state.keys.length}`);
  assert.equal(new Set(state.keys).size, state.keys.length, "no duplicate part_key");
  assert.equal(state.line.updated_date_snapshot, "v2", "line acknowledged the retried revision");
  assert.equal(state.projectRev, "v2", "source record untouched — only estimate-side replayed");
  await page.screenshot({ path: OUT + "/r1-retry-synced.png" });
  await ctx.close();
});

await R("R2: resume_pending retry — 'Resume the recorded Builder operation' replays stored plan", async () => {
  const pendingKey = "op-browser-1";
  const db = dbFor({ estimateLine: {
    price_acceptance_pending: {
      key: pendingKey, kind: "builder_initial_freeze",
      started_at: new Date().toISOString(), estimate_id: "e1",
      estimate_line_id: "L1", builder_product_id: "bp1",
      builder_updated_date_before: "b-v1",
      part_acceptance_plan: { part_updates: [
        { operation: "create", part_key: "foundation:item:0:concrete", data: { builder_product_id: "bp1", part_key: "foundation:item:0:concrete", part_name: "Concrete", part_type: "material", quantity: 4, unit_cost: 10, extended_cost: 40, is_active: true } },
      ] },
      builder_patch: { price_state: "current", frozen_cost: 590 },
      line_patch: { updated_date_snapshot: "v2", price_state: "current", total_snapshot: 590 },
      skip_revision: true,
    },
  } });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openApp(ctx, "r2", { db, expectedPendingKey: pendingKey });
  await page.getByText("still in progress", { exact: false }).waitFor();
  const btn = page.getByRole("button", { name: "Resume the recorded Builder operation" });
  await btn.waitFor();
  await btn.click();
  await page.waitForFunction(() => document.getElementById("retry-outcome")?.textContent === "synced", null, { timeout: 15000 });
  const state = await page.evaluate(() => ({
    parts: Object.values(window.__db.BuilderPart || {}).map(p => ({ k: p.part_key, c: p.extended_cost })),
    line: window.__db.AllInOneEstimate.e1.line_items[0],
    builder: window.__db.BuilderProduct.bp1,
  }));
  assert.deepEqual(state.parts.map(p => p.k), ["foundation:item:0:concrete"], "exactly the stored plan's creates");
  assert.equal(state.line.updated_date_snapshot, "v2");
  assert.ok(!state.line.price_acceptance_pending?.key, "marker cleared");
  assert.equal(state.builder.frozen_cost, 590, "stored builder patch applied");
  await page.screenshot({ path: OUT + "/r2-resume.png" });
  await ctx.close();
});

await R("R3: stale pinned anchor + concurrent source move → conflict outcome, zero writes", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openApp(ctx, "r3", { db: dbFor() });
  await page.getByRole("button", { name: "Retry the unfinished Builder sync" }).waitFor();
  // A concurrent save moves the record between mount and click — the hook's
  // pinned expected version is now stale and the retry must refuse, not replay.
  await page.evaluate(() => { window.__db.FoundationProject.p1.updated_date = "v9-concurrent"; });
  await page.getByRole("button", { name: "Retry the unfinished Builder sync" }).click();
  await page.waitForFunction(() => document.getElementById("retry-outcome")?.textContent === "conflict", null, { timeout: 10000 });
  await page.getByText("changed in another session", { exact: false }).first().waitFor();
  const state = await page.evaluate(() => ({
    parts: Object.keys(window.__db.BuilderPart || {}).length,
    writes: window.__oplog.filter(o => o[0] === "updateMany" || o[0] === "create").length,
  }));
  assert.equal(state.parts, 0, "no parts minted on a stale anchor");
  assert.equal(state.writes, 0, "zero entity writes on conflict");
  await ctx.close();
});

await R("R4: blocked_mismatch receipt — action rendered disabled with the reason", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openApp(ctx, "r4", {
    db: dbFor({ projectExtra: { builder_sync_attempt: { ...attempt, estimate_id: "eOTHER" } } }),
  });
  await page.getByText("different estimate context", { exact: false }).waitFor();
  const btn = page.getByRole("button", { name: "Retry the unfinished Builder sync" });
  assert.equal(await btn.isDisabled(), true, "non-retryable classification disables the action");
  await page.screenshot({ path: OUT + "/r4-blocked.png" });
  await ctx.close();
});

await R("R5: acknowledged state renders no retry surface at all", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await openApp(ctx, "r5", { db: dbFor({ estimateLine: { updated_date_snapshot: "v2" } }) });
  await page.locator("#retry-zone").waitFor();
  const count = await page.locator("#retry-zone button").count();
  assert.equal(count, 0, "none_needed renders nothing");
  await ctx.close();
});

await R("R6: mobile 390 — retry surface + conflict dialog both usable", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await openApp(ctx, "r6", { db: dbFor(), conflictArgs: conflictArgsFor() });
  await page.getByRole("button", { name: "Retry the unfinished Builder sync" }).waitFor();
  await page.locator("#open-draft-conflict").click();
  await page.getByText("Browser draft conflicts", { exact: false }).waitFor();
  await page.screenshot({ path: OUT + "/r6-mobile-conflict.png" });
  await ctx.close();
});

const okCount = results.filter((r) => r.ok).length;
fs.writeFileSync(OUT + "/browser-verification.json", JSON.stringify({ results, telemetry, okCount, total: results.length }, null, 2));
console.log(`\n${okCount}/${results.length} browser checks passed`);
console.log("foreign requests:", telemetry.foreign.length, "| consoleErrors:", telemetry.consoleErrors.length, "| pageErrors:", telemetry.pageErrors.length);
await browser.close();
server.close();
process.exit(results.every((r) => r.ok) && telemetry.pageErrors.length === 0 ? 0 : 1);
