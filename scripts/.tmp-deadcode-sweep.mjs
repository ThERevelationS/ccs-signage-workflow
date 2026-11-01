// Dead-code sweep: find "no-op marker" files under src/components/estimator —
// files whose entire content is comments + pure re-exports (they execute
// nothing of their own) — then check which of them are referenced by any
// import anywhere in src/. A no-op file nobody imports is dead code.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src'];
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
    // export {}; export default {}; export default null/undefined;
    .replace(/export\s*\{[^}]*\}\s*;?/g, '')
    .replace(/export\s+default\s+(\{\s*\}|null|undefined)\s*;?/g, '')
    .replace(/[\s;]/g, '');
  return code.length === 0;
};

const estimatorFiles = walk(TARGET).map((p) => p.replace(/\\/g, '/'));
const noop = estimatorFiles.filter((p) => isNoOpFile(readFileSync(p, 'utf8')));

const allSrc = ROOTS.flatMap(walk).map((p) => p.replace(/\\/g, '/'));
const corpus = allSrc.map((p) => [p, readFileSync(p, 'utf8')]);

const referenced = (path) => {
  const noExt = path.replace(/\.(jsx?|mjs|tsx?)$/, '');
  const alias = noExt.replace(/^src\//, '@/');
  const base = noExt.split('/').pop();
  const relRx = new RegExp(`['"]\\.{1,2}/[\\w./-]*${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
  return corpus.some(([p, src]) => p !== path && (src.includes(alias) || src.includes(`'${noExt}'`) || src.includes(`"${noExt}"`) || relRx.test(src)));
};

const dead = noop.filter((p) => !referenced(p));
const live = noop.filter((p) => referenced(p));
console.log(JSON.stringify({ noopCount: noop.length, liveNoop: live, dead }, null, 1));
