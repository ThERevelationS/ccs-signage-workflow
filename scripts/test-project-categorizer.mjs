import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-categorizer.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/markup/projectCategorizer.jsx')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const cat = await import(pathToFileURL(out).href);

// Channel letter: dimensional with fab_config splits material vs labor.
{
  const lines = cat.categorizeChannelLetterProject({
    letter_purchases: [{
      letter_type: 'dimensional_letters', description: 'CCS', total_cost: 1000,
      fab_config: { material_cost: 300, paint_material_cost: 100, cnc_labor_cost: 400, paint_labor_cost: 150 },
    }],
  });
  const mat = lines.find((l) => l.label.includes('Material'));
  const lab = lines.find((l) => l.label.includes('Labor'));
  assert.equal(mat?.cost, 400, 'material = material + paint_material');
  assert.equal(mat?.category_key, 'substrates');
  assert.equal(lab?.cost, 550, 'labor = cnc + paint labor');
  assert.equal(lab?.category_key, 'inhouse_labor');
  const remainder = lines.find((l) => l.label.includes('other'));
  assert.equal(remainder?.cost, 50, 'remainder = total - mat - labor');
}

// Channel letter: non-dimensional -> outsourced fab line.
{
  const lines = cat.categorizeChannelLetterProject({
    letter_purchases: [{ letter_type: 'channel_letters', description: 'Main St', total_cost: 500 }],
  });
  assert.equal(lines.length, 1);
  assert.notEqual(lines[0].category_key, 'substrates', 'non-dimensional is not material');
}

// Channel letter: zero-cost lines skipped.
{
  const lines = cat.categorizeChannelLetterProject({ letter_purchases: [{ letter_type: 'x', total_cost: 0 }] });
  assert.equal(lines.length, 0);
}

// Null guards.
for (const fn of ['categorizeChannelLetterProject', 'categorizeFoundationProject', 'categorizePaintProject', 'categorizeLaserProject', 'categorizeCNCProject', 'categorizeMetalProject', 'categorizeBrickStoneProject', 'categorizeMaintenanceProject', 'categorizeVinylProject']) {
  assert.deepEqual(cat[fn](null), [], `${fn}(null) -> []`);
}

console.log('PASS project categorizer (14 cases)');
