// Module-lane cross-wire ownership fixture — the shared exact-once contract
// every estimator module wire must honor (Q-12/R-11/S-12/T-12/U-12/V-13's
// "new pure fixtures" clause). Pure asserts, no browser/SDK/network:
//   - *RecordLines emits unique deterministic keys, 1:1 with record.items
//   - malformed/absent records project zero lines (fail-closed, never invented)
//   - resolve*SellPricing on unconfigured records passthroughs the verbatim
//     baseline sell — no invented markup, no dropped dollars
//   - vinyl's items-vs-workflows line-source precedence
// Run: node scripts/test-module-wire-ownership.mjs

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = (entry, name) => {
  const out = resolve(here, `.tmp-${name}.mjs`);
  buildSync({ entryPoints: [resolve(here, entry)], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  return out;
};

const WIRES = {
  laser: await import(pathToFileURL(bundle('../base44/shared/laserPricingWire.ts', 'laser-wire')).href),
  cnc: await import(pathToFileURL(bundle('../base44/shared/cncPricingWire.ts', 'cnc-wire')).href),
  metal: await import(pathToFileURL(bundle('../base44/shared/metalPricingWire.ts', 'metal-wire')).href),
  paint: await import(pathToFileURL(bundle('../base44/shared/paintPricingWire.ts', 'paint-wire')).href),
  maintenance: await import(pathToFileURL(bundle('../base44/shared/maintenancePricingWire.ts', 'maint-wire')).href),
  vinyl: await import(pathToFileURL(bundle('../base44/shared/vinylPricingWire.ts', 'vinyl-wire')).href),
};
const FN = {
  laser: ['laserRecordLines', 'resolveLaserSellPricing'],
  cnc: ['cncRecordLines', 'resolveCncSellPricing'],
  metal: ['metalRecordLines', 'resolveMetalSellPricing'],
  paint: ['paintRecordLines', 'resolvePaintSellPricing'],
  maintenance: ['maintenanceRecordLines', 'resolveMaintenanceSellPricing'],
  vinyl: ['vinylRecordLines', 'resolveVinylSellPricing'],
};

let n = 0;
const ok = (c, m) => { n += 1; assert.ok(c, m); };
const eq = (a, b, m) => { n += 1; assert.equal(a, b, m); };

const REC = {
  items: [
    { id: 'it-a', description: 'Panel work', qty: 2, item_total_cost: 100 },
    { id: 'it-b', description: 'Detail pass', qty: 1, item_total_cost: 50 },
  ],
  subtotal: 150, markup_percent: 20, markup_amount: 30, total_cost: 180,
};

for (const [name, [linesFn, resolveFn]] of Object.entries(FN)) {
  const recordLines = WIRES[name][linesFn];
  const resolveSell = WIRES[name][resolveFn];
  ok(typeof recordLines === 'function', `${name}: ${linesFn} exported`);
  ok(typeof resolveSell === 'function', `${name}: ${resolveFn} exported`);

  // 1. Line projection: 1:1 with record.items, unique keys, deterministic.
  const lines = recordLines(REC);
  eq(lines.length, 2, `${name}: two items project two lines`);
  const keys = lines.map((l) => l.key);
  eq(new Set(keys).size, keys.length, `${name}: line keys unique`);
  eq(recordLines(REC).map((l) => l.key).join('|'), keys.join('|'), `${name}: deterministic projection`);

  // 2. Fail-closed: malformed/absent records project zero lines — never
  //    an invented row.
  eq(recordLines(null).length, 0, `${name}: null record -> no lines`);
  eq(recordLines('x').length, 0, `${name}: string record -> no lines`);
  eq(recordLines({ items: 'not-an-array' }).length, 0, `${name}: malformed items -> no lines`);
  eq(recordLines({ items: [] }).length, 0, `${name}: empty items -> no lines`);

  // 3. Passthrough: unconfigured record resolves verbatim baseline sell —
  //    the wire never invents a markup or drops dollars.
  const r = resolveSell({ record: REC, baselineSell: 180, internalCost: 150, engine: {} });
  eq(r.passthrough, true, `${name}: unconfigured record passthroughs`);
  eq(r.customer_price, 180, `${name}: passthrough price is verbatim baseline sell`);
  ok(['no_config', 'no_engine', 'no_lines', 'no_priced_lines'].includes(r.reason),
    `${name}: passthrough names its reason (${r.reason})`);

  // 4. No record at all -> passthrough, never a crash or an invented price.
  const r2 = resolveSell({ record: null, baselineSell: 0, internalCost: 0, engine: {} });
  eq(r2.passthrough, true, `${name}: null record passthroughs`);
  eq(r2.reason, 'no_record', `${name}: null record -> no_record`);
}

// ===========================================================================
// Vinyl-specific: items (persisted flat list) wins over workflows; an empty
// items list falls back to flattening workflows — one line source, never both.
// ===========================================================================
{
  const { vinylRecordLines } = WIRES.vinyl;
  const both = {
    items: [{ id: 'flat-1', description: 'Flat item', qty: 1, item_total_cost: 10 }],
    workflows: [{ items: [{ id: 'wf-1', description: 'Workflow part', qty: 3, item_total_cost: 30 }] }],
  };
  const lines = vinylRecordLines(both);
  eq(lines.length, 1, 'vinyl: items wins over workflows (no double source)');
  eq(lines[0].origin, 'items', 'vinyl: the flat item is the line source');
  const wfOnly = vinylRecordLines({ items: [], workflows: [{ items: [{ description: 'Part A', qty: 2 }] }, { items: [{ description: 'Part B' }] }] });
  eq(wfOnly.length, 2, 'vinyl: empty items falls back to workflows flatten');
  eq(wfOnly[0].origin, 'workflows', 'vinyl: workflow fallback marks origin');
  const wfKeys = wfOnly.map((l) => l.key);
  eq(new Set(wfKeys).size, wfKeys.length, 'vinyl: workflow-derived keys unique');
}

console.log(`PASS module-wire-ownership (${n} asserts: 6 wires x {line uniqueness, deterministic projection, fail-closed malformed, verbatim passthrough, no_record} + vinyl line-source precedence)`);
