import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Backlog §16 #376: estimator/ dead-code test.
// A "no-op marker" file is one whose entire meaningful content is comments
// plus pure re-exports (export ... from '...' / export {} / export default {}|null):
// it executes nothing of its own. A no-op file that NO import anywhere in
// src/ references is dead code — kept around only to confuse greps.
//
// KNOWN_DEAD documents the dead-file list found by the sweep. It is
// deliberately an allowlist, not just a log: a NEW unreferenced no-op file
// fails this test until it is either deleted or consciously added here.
// Sweep result as of 2026-11: zero dead files under src/components/estimator/.

const KNOWN_DEAD = [];

const TARGET = 'src/components/estimator';

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx?|mjs|tsx?)$/.test(e.name)) out.push(p);
  }
  return out;
};

const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, '$1');

const isNoOpFile = (src) => {
  const code = stripComments(src)
    // pure re-exports: export * from 'x', export {..} from 'x', export * as n from 'x'
    .replace(/export\s+(\*\s+as\s+\w+|\*|\{[^}]*\})\s+from\s+['"][^'"]+['"]\s*;?/g, '')
    // empty exports: export {}; export default {}; export default null/undefined;
    .replace(/export\s*\{[^}]*\}\s*;?/g, '')
    .replace(/export\s+default\s+(\{\s*\}|null|undefined)\s*;?/g, '')
    .replace(/[\s;]/g, '');
  return code.length === 0;
};

// ---------- Classifier unit checks (synthetic sources) ----------
assert.equal(isNoOpFile(''), true, 'empty file is a no-op');
assert.equal(isNoOpFile('// only a comment\n/* and a block */'), true, 'comments-only is a no-op');
assert.equal(isNoOpFile("export { a, b } from './x.js';"), true, 're-export only is a no-op');
assert.equal(isNoOpFile("export * from './x.js';\nexport * as y from './y.js';"), true, 'star re-exports are a no-op');
assert.equal(isNoOpFile('export {};'), true, 'bare export is a no-op');
assert.equal(isNoOpFile('export default {};'), true, 'empty default export is a no-op');
assert.equal(isNoOpFile("export const x = 1;"), false, 'a real export is live code');
assert.equal(isNoOpFile("import './side-effect.js';"), false, 'a side-effect import executes code');
assert.equal(isNoOpFile("import { a } from './x';\nexport const y = a + 1;"), false, 'real impl is live code');
assert.equal(isNoOpFile("const x = 1;\nexport default x;"), false, 'identifier default export is live code');

// ---------- Tree sweep ----------
const estimatorFiles = walk(TARGET).map((p) => p.replace(/\\/g, '/'));
assert.ok(estimatorFiles.length > 100, 'sweep covers the estimator tree');
const noop = estimatorFiles.filter((p) => isNoOpFile(readFileSync(p, 'utf8')));

const allSrc = walk('src').map((p) => p.replace(/\\/g, '/'));
const corpus = allSrc.map((p) => [p, readFileSync(p, 'utf8')]);

const referenced = (path) => {
  const noExt = path.replace(/\.(jsx?|mjs|tsx?)$/, '');
  const alias = noExt.replace(/^src\//, '@/');
  const base = noExt.split('/').pop().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const relRx = new RegExp(`['"]\\.{1,2}/[\\w./-]*${base}['"]`);
  return corpus.some(([p, src]) =>
    p !== path && (src.includes(alias) || relRx.test(src)));
};

const dead = noop.filter((p) => !referenced(p)).sort();
assert.deepEqual(
  dead,
  [...KNOWN_DEAD].sort(),
  `unreferenced no-op files drifted from the documented dead-file list.\n` +
  `Found: ${JSON.stringify(dead)}\n` +
  `If a file is intentionally kept dead, add it to KNOWN_DEAD in this test; otherwise delete the file or wire it back in.`,
);

console.log(`PASS estimator dead-code sweep (${estimatorFiles.length} files scanned, ${noop.length} no-op marker files, ${dead.length} dead — all documented)`);
process.exit(0);
