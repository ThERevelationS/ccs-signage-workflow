import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-module-registry.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/estimator/moduleRegistry.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { ESTIMATOR_MODULES, MODULE_TOTAL_FIELD, getModule, getModuleLabel } = await import(pathToFileURL(out).href);

assert.equal(ESTIMATOR_MODULES.length, 10, 'ten estimator modules registered');
for (const m of ESTIMATOR_MODULES) {
  assert.ok(m.key && m.label && m.entity && m.page, `${m.key} fully declared`);
  assert.equal(getModule(m.key).key, m.key, `${m.key} resolves`);
}
assert.equal(getModule('nope'), undefined, 'unknown key unresolved');
assert.equal(getModuleLabel('cnc'), 'CNC Router');
assert.equal(getModuleLabel('nope'), 'nope', 'label falls back to key');

// Modules with a single total field map it here; foundation + painting are
// intentionally absent — builderService.sourceProjectTotal handles them
// with multi-field sums instead.
for (const m of ESTIMATOR_MODULES.filter((x) => !['foundation', 'painting'].includes(x.key))) {
  assert.equal(MODULE_TOTAL_FIELD[m.key], 'total_cost', `${m.key} totals via total_cost`);
}
assert.equal(MODULE_TOTAL_FIELD.foundation, undefined, 'foundation splits totals itself');
assert.equal(MODULE_TOTAL_FIELD.painting, undefined, 'painting uses a multi-field sum in builderService');

console.log('PASS module registry (22 assertions)');
