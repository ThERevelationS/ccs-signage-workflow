// B-07a wiring checks: the live due-date paths must run through
// base44/shared/dueDateEngine.ts — no leftover naive date math, signatures
// preserved, real end-to-end semantics through the actual module chain
// (proofModel → workOrderConversion → engine), esbuild syntax clean.
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { build, transformSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const convPath = resolve(here, '../src/components/estimator/workOrderConversion.js');
const modelPath = resolve(here, '../src/components/proofs/proofModel.js');
const panelPath = resolve(here, '../src/components/proofs/ProofPanel.jsx');
const enginePath = resolve(here, '../base44/shared/dueDateEngine.ts');

const convSrc = readFileSync(convPath, 'utf8');
const modelSrc = readFileSync(modelPath, 'utf8');
const panelSrc = readFileSync(panelPath, 'utf8');

// --- import bridge + no naive math in the conversion helper ------------------
assert.match(convSrc, /from\s+["']\.\.\/\.\.\/\.\.\/base44\/shared\/dueDateEngine\.ts["']/,
  'workOrderConversion imports the shared engine via the relative base44/shared path');
assert.match(convSrc, /import\s*\{[^}]*\brecalcOnProofApproval\b[^}]*\}\s*from/,
  'workOrderConversion imports recalcOnProofApproval');
assert.match(convSrc, /export function recalculateProductDueDateOnProofApproval\(\{ product = \{\}, leadTimeDays = 0/,
  'exported name + signature preserved (callers unchanged)');

// Extract the wrapper body (function start → next top-level statement) and
// confirm the naive date math is gone from it.
const bodyMatch = convSrc.match(
  /export function recalculateProductDueDateOnProofApproval[\s\S]*?\n}\n/
);
assert.ok(bodyMatch, 'wrapper function located');
const wrapperBody = bodyMatch[0];
assert.ok(!/\.setDate\(/.test(wrapperBody), 'naive setDate day-add removed');
assert.ok(!/\.toISOString\(/.test(wrapperBody), 'naive toISOString return removed');
assert.ok(!/\.getDate\(\)/.test(wrapperBody), 'no manual day arithmetic remains');
assert.ok(/recalcOnProofApproval\(/.test(wrapperBody), 'wrapper delegates to the engine');

// The hard-due guard in applyProductOperationalPatch must stay intact.
assert.match(convSrc, /product\?\.hard_due_date === true[\s\S]*?hard due date; moving it later requires an explicit override/,
  'applyProductOperationalPatch hard-due guard intact');

// --- proofModel wires the engine path ---------------------------------------
assert.match(modelSrc, /leadTimeDays, parts, now|parts, now/, 'nextProofPatch accepts parts');
assert.match(modelSrc, /recalculateProductDueDateOnProofApproval\(\{[\s\S]*?parts,[\s\S]*?fromDate: now \|\| new Date\(\)/,
  'approve patch passes product + leadTimeDays + parts + fromDate through to the wrapper');

// --- ProofPanel keeps the manual override input + loads parts ---------------
assert.match(panelSrc, /value=\{leadTimeDays\}/, 'Lead days input still bound (override)');
assert.match(panelSrc, /staffEntities\.BuilderPart/, 'panel loads BuilderPart rows for the engine');
assert.match(panelSrc, /action === "approve"/, 'parts fetch is gated to the approve path');

// --- syntax clean on all three edited files ----------------------------------
transformSync(convSrc, { loader: 'js' });
transformSync(modelSrc, { loader: 'js' });
transformSync(panelSrc, { loader: 'jsx' });

// --- functional: run the REAL module chain under Node ------------------------
// workOrderConversion pulls @/-alias + sibling imports used by untested
// functions only; stub them as empty CJS modules (named imports from CJS are
// runtime property lookups — never invoked on the tested paths). The engine
// and the conversion/proof-model chain itself bundle for real.
const stubImports = {
  name: 'w32-stub-imports',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (args.kind === 'entry-point') return null;
      if (args.path.includes('dueDateEngine')) return null;
      if (/workOrderConversion(\.js)?$/.test(args.path)) return null;
      return { path: args.path, namespace: 'w32-stub' };
    });
    build.onLoad({ filter: /.*/, namespace: 'w32-stub' }, () => ({
      contents: 'module.exports = {};', loader: 'js',
    }));
  },
};

const convOut = resolve(here, '.tmp-ddw-conv.mjs');
const modelOut = resolve(here, '.tmp-ddw-model.mjs');
await build({ entryPoints: [convPath], bundle: true, format: 'esm', outfile: convOut, plugins: [stubImports], logLevel: 'silent' });
await build({ entryPoints: [modelPath], bundle: true, format: 'esm', outfile: modelOut, plugins: [stubImports], logLevel: 'silent' });

const { recalculateProductDueDateOnProofApproval } = await import(pathToFileURL(convOut).href);
const { nextProofPatch } = await import(pathToFileURL(modelOut).href);
assert.equal(typeof recalculateProductDueDateOnProofApproval, 'function');
assert.equal(typeof nextProofPatch, 'function');

const MON = '2026-11-02';

// Engine semantics through the legacy-named wrapper.
assert.equal(
  recalculateProductDueDateOnProofApproval({
    product: { product_due_date: '2026-11-04', parts: [{ product_lead_days: 5 }] },
    fromDate: MON,
  }),
  '2026-11-07', 'max-of-parts lead drives the recalc');
assert.equal(
  recalculateProductDueDateOnProofApproval({
    product: { product_due_date: '2026-11-20', parts: [{ product_lead_days: 2 }] },
    fromDate: MON,
  }),
  '2026-11-20', 'forward-only clamp never pulls a date earlier');
assert.equal(
  recalculateProductDueDateOnProofApproval({
    product: { hard_due_date: true, product_due_date: '2026-11-12', parts: [{ product_lead_days: 30 }] },
    fromDate: MON,
  }),
  '2026-11-12', 'hard due date held by the engine');
assert.equal(
  recalculateProductDueDateOnProofApproval({
    product: { product_due_date: '2026-11-01', parts: [{ product_lead_days: 50 }] },
    leadTimeDays: 3, fromDate: MON,
  }),
  '2026-11-05', 'explicit leadTimeDays overrides per-part leads');
assert.equal(
  recalculateProductDueDateOnProofApproval({
    product: { product_due_date: '2026-11-01', parts: [{ product_min_days: 10, product_std_days: 20 }] },
    leadTimeDays: 3, fromDate: MON,
  }),
  '2026-11-12', 'override still honors each part min floor');
assert.equal(
  recalculateProductDueDateOnProofApproval({
    product: { parts: [{ product_lead_days: 50 }] },
    parts: [{ product_lead_days: 2 }],
    fromDate: MON,
  }),
  '2026-11-04', 'caller-loaded parts beat embedded product.parts');
assert.equal(
  recalculateProductDueDateOnProofApproval({
    product: {}, leadTimeDays: 5, fromDate: MON,
  }),
  '2026-11-07', 'no parts + manual override → synthesized lead keeps legacy reach');
assert.equal(
  recalculateProductDueDateOnProofApproval({
    product: { product_due_date: '2026-11-09' }, fromDate: MON,
  }),
  '2026-11-09', 'no parts + no override leaves the existing date untouched');
assert.match(
  recalculateProductDueDateOnProofApproval({ product: {}, leadTimeDays: 3, fromDate: MON }),
  /^\d{4}-\d{2}-\d{2}$/, 'legacy signature returns the stored date-only convention');

// Full proof-approval chain: nextProofPatch → wrapper → engine.
const approving = {
  id: 'p1', proof_status: 'awaiting_approval', proof_version: 2,
  proof_file_url: 'https://files.example/proof-v2.pdf', product_due_date: '2026-11-04',
};
{
  const patch = nextProofPatch(approving, 'approve', {
    parts: [{ product_lead_days: 5 }], now: MON,
  });
  assert.equal(patch.proofStatus, 'approved');
  assert.equal(patch.operationalStatus, 'proof_approved');
  assert.equal(patch.productDueDate, '2026-11-07', 'approve patch carries the engine due date');
  assert.equal(patch.proofApprovedVersion, 2);
}
{
  const patch = nextProofPatch({ ...approving, hard_due_date: true }, 'approve', {
    parts: [{ product_lead_days: 30 }], now: MON,
  });
  assert.equal(patch.productDueDate, '2026-11-04', 'hard due date held through the full chain');
}
{
  const patch = nextProofPatch({ ...approving, product_due_date: '' }, 'approve', {
    leadTimeDays: 4, now: MON,
  });
  assert.equal(patch.productDueDate, '2026-11-06', 'manual override lands with no parts loaded');
}

rmSync(convOut, { force: true });
rmSync(modelOut, { force: true });
console.log('PASS due-date-wiring');
