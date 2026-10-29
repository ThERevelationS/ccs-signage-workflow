import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = (name) => {
  const out = resolve(here, `.tmp-${name}.mjs`);
  buildSync({ entryPoints: [resolve(here, `../src/components/vinylInventory/${name}.jsx`)], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  return pathToFileURL(out).href;
};
const { inkCostPerSqIn, vinylCostPerSqft, filterVinylForScope, VINYL_FINISH_LABELS } = await import(bundle('vinylConstants'));

// inkCostPerSqIn: tiered field wins, legacy fallback.
assert.equal(inkCostPerSqIn(null), 0);
assert.equal(inkCostPerSqIn({ print_cost_per_sqin: 0.05 }), 0.05, 'legacy field');
assert.equal(inkCostPerSqIn({ print_cost_per_sqin: 0.05, print_cost_per_sqin_production: 0.02 }, 'production'), 0.02, 'tiered wins');
assert.equal(inkCostPerSqIn({ print_cost_per_sqin: 0.05, print_cost_per_sqin_draft: 0 }, 'draft'), 0.05, 'zero tier falls back');

// vinylCostPerSqft across pricing modes (54" x 50yd roll = 4.5ft x 150ft = 675 sqft).
const roll = { roll_width_inches: 54, roll_length_yards: 50 };
assert.equal(vinylCostPerSqft({ ...roll, pricing_mode: 'per_sqft', cost_per_sqft: 2 }), 2);
assert.equal(vinylCostPerSqft({ ...roll, pricing_mode: 'per_roll', cost_per_roll: 675 }), 1, 'per_roll / roll area');
assert.equal(vinylCostPerSqft({ ...roll, pricing_mode: 'per_linear_foot', cost_per_linear_foot: 4.5 }), 1, 'per_linear_ft / width ft');
assert.equal(vinylCostPerSqft({ pricing_mode: 'per_roll', cost_per_roll: 100 }), 0, 'missing dims -> 0');
assert.equal(vinylCostPerSqft(null), 0);

// filterVinylForScope: inactive + scope gating.
const rows = [
  { id: 'a', is_active: true },
  { id: 'b', is_active: false },
  { id: 'c', is_active: true, show_in_master_only: true },
  { id: 'd', is_active: true, show_in_channel_letters: false },
];
assert.deepEqual(filterVinylForScope(rows, 'master').map((r) => r.id), ['a', 'c', 'd']);
assert.deepEqual(filterVinylForScope(rows, 'channel_letters').map((r) => r.id), ['a'], 'channel scope excludes master_only + flagged off');
assert.deepEqual(filterVinylForScope(null, 'master'), []);

// Labels map covers finishes.
assert.ok(Object.keys(VINYL_FINISH_LABELS).length >= 3);

console.log('PASS vinyl helpers (14 cases)');
