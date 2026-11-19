// Runs in the sandbox: for each flagged commit, which identifiers / ledger tags
// in the lines it removed exist NOWHERE in current HEAD (estimator + pages)?
const { execFileSync } = require('child_process');
const fs = require('fs');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 << 20 });
const L = (rev, p) => git('show', `${rev}:${p}`).replace(/\r/g, '').split('\n');
const corpus = git('ls-files', 'src/components/estimator', 'src/pages', 'src/lib', 'base44/shared').split('\n').filter(Boolean)
  .map((p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }).join('\n');
const STOP = new Set(['return', 'const', 'function', 'export', 'import', 'default', 'Number', 'isFinite', 'undefined', 'disabled', 'onChange', 'className', 'string', 'number', 'object', 'length', 'filter', 'reduce', 'Boolean']);
const items = JSON.parse(process.argv[2]);
for (const [p, c, parent] of items) {
  const C = new Set(L(c, p).map((l) => l.trim()));
  const removed = L(parent, p).filter((l) => l.trim().length > 3 && !C.has(l.trim()));
  const toks = new Set();
  for (const l of removed) for (const m of l.matchAll(/\b(O-\d{3}|CMP-[A-Z]\d{2}|[A-Za-z_][A-Za-z0-9_]{7,})\b/g)) if (!STOP.has(m[1])) toks.add(m[1]);
  const lost = [...toks].filter((t) => !corpus.includes(t));
  console.log(`## ${p.split('/').pop()} ${c} removedLines=${removed.length} identifiers=${toks.size} LOST=${lost.length}`);
  if (lost.length) console.log('   ' + lost.slice(0, 40).join(' '));
}