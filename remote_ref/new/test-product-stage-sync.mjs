import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-pss.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/estimator/productStageSync.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  WO_STAGE_ORDER,
  STAGE_LABELS,
  PRODUCT_TO_STAGE,
  PRODUCT_STAGE_MODE_SETTING_KEY,
  PRODUCT_STAGE_MODES,
  DEFAULT_PRODUCT_STAGE_MODE,
  TERMINAL_FULFILLMENT_STATES,
  isProductFulfilled,
  isProductTerminal,
  productStageModeFromSetting,
  productStatusRollup,
  productStatusRollupLabel,
  suggestStageForProducts,
  openProductsBlockingCompletion,
} = await import(pathToFileURL(out).href);

const p = (over = {}) => ({ id: 'p1', ...over });
// suggest(products, current, expected): expected null means "no suggestion".
const suggest = (products, current, expected) =>
  assert.equal(suggestStageForProducts(products, current)?.suggested ?? null, expected);

// ---- Constants and mode parsing -----------------------------------------
{
  assert.equal(PRODUCT_STAGE_MODE_SETTING_KEY, 'productStatusDrivesStage');
  assert.equal(DEFAULT_PRODUCT_STAGE_MODE, 'suggest');
  assert.deepEqual(PRODUCT_STAGE_MODES, ['off', 'suggest', 'auto']);
  assert.deepEqual(
    WO_STAGE_ORDER,
    ['estimating', 'sales', 'permitting', 'design', 'production', 'fabrication', 'installation', 'completed'],
    'mirror of workOrderPersistence WO_STAGE_ORDER drifted'
  );
  // Mode resolution: strings, {setting_value}, {mode}, objects, garbage.
  assert.equal(productStageModeFromSetting(null), 'suggest');
  assert.equal(productStageModeFromSetting(undefined), 'suggest');
  assert.equal(productStageModeFromSetting({}), 'suggest');
  assert.equal(productStageModeFromSetting('auto'), 'auto');
  assert.equal(productStageModeFromSetting('OFF'), 'off');
  assert.equal(productStageModeFromSetting({ setting_key: 'productStatusDrivesStage', setting_value: 'auto' }), 'auto');
  assert.equal(productStageModeFromSetting({ setting_value: 'off' }), 'off');
  assert.equal(productStageModeFromSetting({ setting_value: { mode: 'auto' } }), 'auto');
  assert.equal(productStageModeFromSetting({ setting_value: 'bogus' }), 'suggest');
  assert.equal(productStageModeFromSetting('garbage'), 'suggest');
  // Every mapped status resolves to a real WO stage.
  for (const [status, stage] of Object.entries(PRODUCT_TO_STAGE)) {
    assert.ok(WO_STAGE_ORDER.includes(stage), `${status} maps to unknown stage ${stage}`);
  }
  assert.ok(Object.keys(STAGE_LABELS).length === WO_STAGE_ORDER.length);
  for (const s of TERMINAL_FULFILLMENT_STATES) {
    assert.ok(isProductFulfilled(p({ fulfillment_state: s })), s);
  }
  assert.equal(isProductTerminal(p({ operational_status: 'vended' })), true);
  assert.equal(isProductTerminal(p({ operational_status: 'in_design' })), false);
}

// ---- Edge inputs ---------------------------------------------------------
{
  suggest([], 'design', null);
  suggest(null, 'design', null);
  suggest([null, undefined], 'design', null);
  // Products with no usable status contribute no signal.
  suggest([p({ operational_status: 'none' }), p({})], 'sales', null);
  suggest([p({ operational_status: 'bogus_status' })], 'sales', null);
}

// ---- Uniform statuses (WO sitting at estimating) --------------------------
{
  suggest([p({ operational_status: 'in_production' })], 'estimating', 'production');
  suggest(
    [p({ id: 'a', operational_status: 'in_production' }), p({ id: 'b', operational_status: 'in_production' })],
    'estimating', 'production'
  );
  suggest([p({ operational_status: 'order_review' })], 'estimating', 'sales');
  suggest([p({ operational_status: 'awaiting_customer_action' })], 'estimating', 'sales');
  suggest([p({ operational_status: 'in_design' })], 'estimating', 'design');
  suggest([p({ operational_status: 'design_review' })], 'estimating', 'design');
  suggest([p({ operational_status: 'awaiting_proof_approval' })], 'estimating', 'design');
  suggest([p({ operational_status: 'site_survey' })], 'estimating', 'design');
  suggest([p({ operational_status: 'permitting' })], 'estimating', 'permitting');
  suggest([p({ operational_status: 'proof_approved' })], 'estimating', 'production');
  suggest([p({ operational_status: 'quality_control' })], 'estimating', 'fabrication');
  suggest([p({ operational_status: 'install_or_removal_only' })], 'estimating', 'installation');
  suggest([p({ operational_status: 'service_repair' })], 'estimating', 'installation');
}

// ---- Weakest-link rollup over open products ------------------------------
{
  // A straggler holds the suggestion at its own phase.
  suggest(
    [p({ id: 'a', operational_status: 'in_design' }), p({ id: 'b', operational_status: 'in_production' })],
    'estimating', 'design'
  );
  // Terminal products never hold the job back.
  suggest(
    [p({ id: 'a', fulfillment_state: 'delivered' }), p({ id: 'b', operational_status: 'in_production' })],
    'design', 'production'
  );
  // No-signal products are ignored, not treated as open.
  suggest(
    [p({ id: 'a', operational_status: 'none' }), p({ id: 'b', operational_status: 'in_production' })],
    'estimating', 'production'
  );
  const s = suggestStageForProducts(
    [p({ id: 'a', operational_status: 'in_design' }), p({ id: 'b', operational_status: 'in_design' })],
    'estimating'
  );
  assert.equal(s.suggested, 'design');
  assert.ok(/open product/.test(s.reason));
}

// ---- All-terminal rollups -------------------------------------------------
{
  // Every product fully fulfilled → completed.
  suggest(
    [p({ id: 'a', fulfillment_state: 'delivered' }), p({ id: 'b', fulfillment_state: 'installed' })],
    'installation', 'completed'
  );
  suggest([p({ fulfillment_state: 'picked_up', operational_status: 'in_production' })], 'fabrication', 'completed');
  // Produced but not yet fulfilled → installation.
  suggest([p({ operational_status: 'vended' })], 'fabrication', 'installation');
  suggest(
    [p({ id: 'a', operational_status: 'vended' }), p({ id: 'b', fulfillment_state: 'shipped' })],
    'fabrication', 'installation'
  );
}

// ---- Regression prevention ------------------------------------------------
{
  // Never suggest at or before the current stage.
  suggest([p({ operational_status: 'in_production' })], 'production', null);
  suggest([p({ operational_status: 'in_design' })], 'production', null);
  suggest([p({ operational_status: 'in_design' })], 'completed', null);
  suggest([p({ fulfillment_state: 'delivered' })], 'completed', null);
  // Unknown current stage → nothing (cannot prove forward).
  suggest([p({ operational_status: 'in_production' })], 'bogus', null);
  suggest([p({ operational_status: 'in_production' })], 'not a stage', null);
  // Empty/unset current stage → any implied stage is forward.
  suggest([p({ operational_status: 'in_design' })], '', 'design');
  suggest([p({ operational_status: 'in_design' })], null, 'design');
}

// ---- Rollup counts and chip label ----------------------------------------
{
  const rollup = productStatusRollup([
    p({ id: 'a', operational_status: 'in_design' }),
    p({ id: 'b', operational_status: 'in_production' }),
    p({ id: 'c', operational_status: 'in_production' }),
    p({ id: 'd', fulfillment_state: 'delivered' }),
    p({ id: 'e', operational_status: 'vended' }),
  ]);
  assert.equal(rollup.total, 5);
  assert.equal(rollup.open, 3);
  assert.equal(rollup.fulfilled, 2);
  assert.deepEqual(rollup.counts, { in_design: 1, in_production: 2 });
  assert.equal(rollup.openProducts.length, 3);
  // Chip is ordered by implied stage: design bucket first, then production.
  assert.equal(productStatusRollupLabel(rollup), '1 in design · 2 in prod · 2 done');
  assert.equal(productStatusRollupLabel(productStatusRollup([])), '');
}

// ---- Completion guard list -------------------------------------------------
{
  const open = openProductsBlockingCompletion([
    p({ id: 'a', description: 'Monument sign', operational_status: 'in_design' }),
    p({ id: 'b', description: 'Vinyl', fulfillment_state: 'installed' }),
    p({ id: 'c', description: 'Done one', operational_status: 'vended' }),
    { description: 'No status yet' },
  ]);
  assert.equal(open.length, 2);
  assert.equal(open[0].name, 'Monument sign');
  assert.equal(open[0].status, 'in_design');
  assert.equal(open[1].status, 'none');
  assert.deepEqual(openProductsBlockingCompletion([p({ fulfillment_state: 'delivered' })]), []);
}

// ---- UI hooks -------------------------------------------------------------
// The sync only works if every surface is wired — grep the sources for the
// call sites and labels so a future refactor can't drop a hook silently.
const src = (rel) => readFileSync(resolve(here, rel), 'utf8');
{
  const jw = src('../src/components/jobs/JobWorkspace.jsx');
  assert.ok(jw.includes('suggestStageForProducts'), 'JobWorkspace imports suggestStageForProducts');
  assert.ok(jw.includes('PRODUCT_STAGE_MODE_SETTING_KEY'), 'JobWorkspace reads the mode setting');
  assert.ok(jw.includes('Products suggest stage'), 'JobWorkspace renders the suggestion banner');
  assert.ok(jw.includes('applyStageSuggestion'), 'JobWorkspace wires Apply');
  assert.ok(jw.includes('stageSyncNotice'), 'JobWorkspace announces applied moves');
  assert.ok(jw.includes('transitionWorkOrderFromLoadedSnapshot'), 'JobWorkspace uses the CAS transition');

  const pq = src('../src/components/queues/ProductQueue.jsx');
  assert.ok(pq.includes('suggestStageForProducts'), 'ProductQueue imports suggestStageForProducts');
  assert.ok(pq.includes('stageHints'), 'ProductQueue computes per-row hints');
  assert.ok(pq.includes('stageSyncMode === "auto"'), 'ProductQueue auto-applies on transitions');
  assert.ok(pq.includes('stageSyncNotice'), 'ProductQueue announces applied moves');

  const card = src('../src/components/workflow/WorkOrderCard.jsx');
  assert.ok(card.includes('productStatusRollup'), 'WorkOrderCard rolls up product statuses');
  assert.ok(card.includes('productRollupLabel'), 'WorkOrderCard renders the rollup chip');
  assert.ok(card.includes('openProductsBlockingCompletion'), 'WorkOrderCard lists open products on complete');

  const details = src('../src/components/workflow/WorkOrderDetailsDialog.jsx');
  assert.ok(details.includes('openProductsBlockingCompletion'), 'Details dialog lists open products on complete');
  assert.ok(details.includes('still open'), 'Details dialog warns about open products');
}

rmSync(out);
console.log('PASS product-stage-sync');
