// Contract checks for the follow-up scheduler (masterplan item H-05):
//  - base44/functions/followUpSweepAction/entry.ts — session-authed
//    run_follow_up_sweep action (admin-gated for non-dry-run, dry_run for any
//    staff) that scans sent/terminal AllInOneEstimate rows, evaluates
//    shared/followUpMachine.ts nextStage, claims the follow_up_state patch
//    via updateMany CAS, and enqueues through the shared/delivery.ts adapter
//    (Core.SendEmail on the email lane, OpportunityActivity on the
//    smartsheet lane, internal Notification row on both).
//  - Idempotency: follow_up_state.sweep_date belt + last_sent_at-today
//    short-circuit + deterministic Notification dedupe_key.
//
// The Deno runtime cannot be invoked from this script, so this is a
// SOURCE-shape test: the entry parses and bundles under esbuild (shared
// imports resolve), and the contract markers are present.
//
// Run: node scripts/test-follow-up-sweep.mjs  →  prints "PASS follow-up-sweep"

import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildSync } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const readText = (p) => readFileSync(join(root, p), 'utf8');

let failures = 0;
let checks = 0;
const check = (cond, msg) => {
  checks += 1;
  if (cond) return;
  failures += 1;
  console.error('FAIL', msg);
};

// ---------- function.jsonc ----------

const fn = readJson('base44/functions/followUpSweepAction/function.jsonc');
check(fn.name === 'followUpSweepAction', 'function.jsonc name is followUpSweepAction');
check(fn.entry === 'entry.ts', 'function.jsonc entry is entry.ts');

// ---------- entry.ts parses + shared imports resolve ----------

const entryPath = join(root, 'base44/functions/followUpSweepAction/entry.ts');
const out = resolve(dirname(fileURLToPath(import.meta.url)), '.tmp-follow-up-sweep.mjs');
let bundled = '';
let buildFailed = null;
try {
  buildSync({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    external: ['npm:*', 'node:*'],
    outfile: out,
    logLevel: 'silent',
  });
  bundled = readFileSync(out, 'utf8');
} catch (e) {
  buildFailed = e;
}
check(!buildFailed, `entry.ts bundles under esbuild (shared imports resolve) — ${buildFailed?.message || ''}`);
check(bundled.includes('Deno.serve'), 'bundled entry keeps the Deno.serve handler');
check(bundled.includes('nextStage'), 'bundled entry includes the nextStage machine call');
check(bundled.includes('buildDeliveryPlan'), 'bundled entry includes buildDeliveryPlan');
rmSync(out, { force: true });

// ---------- entry.ts source contract ----------

const src = readText('base44/functions/followUpSweepAction/entry.ts');

check(src.includes('authenticateSignShopSession'), 'entry.ts authenticates the sign-shop session');
check(src.includes('withEntityRateLimitRetry'), 'entry.ts wraps the client in withEntityRateLimitRetry');
check(src.includes('asServiceRole.entities'), 'entry.ts reads/writes via service-role entities');
check(src.includes("'run_follow_up_sweep'"), "entry.ts serves the 'run_follow_up_sweep' action");

// Admin gate — non-dry-run only; dry_run stays open to any staff session.
check(src.includes('body?.dry_run === true'), 'entry.ts honors a dry_run flag');
check(
  src.includes('!dryRun && !isAdmin') && src.includes('Only administrators'),
  'entry.ts admin-gates the non-dry-run sweep',
);
check(src.includes('is_full_admin'), 'isAdmin honors the is_full_admin break-glass grant');

// Imports from the house shared modules (`.ts`-suffix import convention).
check(src.includes("from '../../shared/followUpMachine.ts'"), 'imports the followUpMachine shared module');
check(src.includes("from '../../shared/delivery.ts'"), 'imports the delivery adapter shared module');
check(src.includes("from '../../shared/templateRender.ts'"), 'imports the template renderer shared module');
check(src.includes('nextStage'), 'entry.ts evaluates nextStage per row');
check(src.includes('resolveDeliveryChannel'), 'entry.ts resolves the delivery channel');

// Projected read — the spec'd fields are named in the projection.
for (const field of ['status', 'follow_up_state', 'sent_at', 'quote_issue_date', 'customer_id', 'estimate_number', 'contact_email', 'salesperson', 'updated_date']) {
  check(src.includes(`'${field}'`), `ESTIMATE_FIELDS projection includes '${field}'`);
}
check(src.includes("query: { status: 'sent' }"), 'entry.ts scans estimates with status sent');
check(src.includes('TERMINAL_SCAN_STATUSES'), 'entry.ts also scans terminal statuses for the close path');

// Template keys + hardcoded fallbacks.
check(src.includes('estimate_follow_up_1'), 'entry.ts uses template key estimate_follow_up_1');
check(src.includes('estimate_follow_up_2'), 'entry.ts uses template key estimate_follow_up_2');
check(src.includes('FOLLOW_UP_TEMPLATE_DEFAULTS'), 'entry.ts carries hardcoded template fallbacks');
check(src.includes('renderTemplate('), 'entry.ts renders subject/body through renderTemplate');

// Idempotency belt — sweep_date stamp + sweep_ran_today short-circuit +
// last_sent_at-today guard.
check(src.includes('sweep_date'), 'entry.ts stamps a per-row sweep_date');
check(src.includes('sweep_ran_today'), 'entry.ts short-circuits on sweep_ran_today');
check(src.includes('last_sent_at'), 'entry.ts checks last_sent_at for the same-day guard');

// CAS claim on the loaded updated_date — written BEFORE the delivery send.
check(src.includes('updateMany'), 'entry.ts persists follow_up_state via updateMany CAS');
check(
  src.includes('{ id: estimate.id, updated_date: version }') ||
    src.includes('updated_date: version'),
  'the CAS claim is anchored on the loaded updated_date',
);
check(
  src.indexOf('const claim = await claimFollowUpState') > 0 &&
    src.indexOf('const claim = await claimFollowUpState') < src.indexOf('base44.integrations.Core.SendEmail'),
  'the state claim is written before the email send (no duplicate sends)',
);

// Delivery adapter wiring — email lane sends, smartsheet lane writes the
// activity row, the internal Notification row rides both lanes.
check(src.includes('buildDeliveryPlan'), 'entry.ts builds a delivery plan per send');
check(src.includes('Core.SendEmail'), 'email lane enqueues via Core.SendEmail');
check(src.includes('OpportunityActivity'), 'smartsheet lane writes an OpportunityActivity row');
check(src.includes('entities.Notification'), 'entry.ts writes the internal Notification row');
check(src.includes('dedupe_key'), 'internal row carries a deterministic dedupe_key');
check(src.includes('creation_request_key'), 'internal row carries an idempotent creation_request_key');

// Result contract — {scanned, sent_fu1, sent_fu2, closed, skipped, errors[]}.
for (const key of ['scanned', 'sent_fu1', 'sent_fu2', 'closed', 'skipped', 'errors']) {
  check(src.includes(`${key}`), `response includes '${key}'`);
}
check(
  src.includes('sent_fu1:') && src.includes('sent_fu2:') && src.includes('closed,') && src.includes('skipped,') && src.includes('errors,'),
  'response returns the spec count keys',
);

// Safe-failure envelope matches the sibling gateway convention.
check(src.includes('catch (error: any)'), 'entry.ts wraps the handler in try/catch');
check(src.includes('[400, 401, 403, 404, 409, 429]'), 'entry.ts keeps the typed error-status envelope');

rmSync(out, { force: true });
console.log(`${checks - failures}/${checks} checks passed`);
if (failures) {
  console.error(`FAIL follow-up-sweep (${failures} failing checks)`);
  process.exit(1);
}
console.log('PASS follow-up-sweep');
