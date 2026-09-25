import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Compile the actual TypeScript sync translator; no mocked parser or live calls.
const built = await build({
  entryPoints: ['base44/shared/smartsheetSyncFields.ts'],
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
});
const { parseRowToFields, buildCells } = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`
);
const bindings = { est_inv_at: '4624329576763268' };
const row = (value, display_value = '') => ({ id: '123456789', cells: [{
  column_id: '4624329576763268', value, display_value,
}] });
assert.equal(parseRowToFields(row(14568), bindings, 'sales').est_inv_at, '14568',
  'Smartsheet numeric five-digit Est / Inv # must survive a blank display value.');
assert.equal(parseRowToFields(row(14589, undefined), bindings, 'sales').est_inv_at, '14589',
  'Smartsheet missing display text must not drop the numeric identifier.');
assert.equal(parseRowToFields(row('14582', '14582'), bindings, 'sales').est_inv_at, '14582',
  'Already-text identifiers must still parse.');
assert.equal(parseRowToFields(row(null, '14581'), bindings, 'sales').est_inv_at, '14581',
  'Display text remains a fallback when the raw value is missing.');
assert.equal(parseRowToFields(row(null, ''), bindings, 'sales').est_inv_at, undefined,
  'Blank cells must not invent an identifier.');
const incoming = parseRowToFields(row(14568), bindings, 'sales');
assert.deepEqual(Object.keys(incoming), ['est_inv_at'],
  'Sales identifier pull must not populate or overwrite the Base44-only link field.');
const cells = buildCells({ est_inv_at: '14568', corbridge_link: 'https://example.com/keep' }, bindings, 'sales');
assert.deepEqual(cells, [{ columnId: '4624329576763268', value: '14568' }],
  'Sales push must map only the five-digit value, never the Base44-only hyperlink.');
console.log('Sales five-digit Est / Inv # translation: 7/7 PASS.');
