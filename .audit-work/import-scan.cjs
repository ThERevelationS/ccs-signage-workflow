const fs = require('fs');
const path = require('path');
const root = process.argv[2] || '.';
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules') walk(p);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) files.push(p);
  }
})(root);
const exps = {};
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  const names = new Set();
  for (const m of c.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_]+)/g)) names.add(m[1]);
  for (const m of c.matchAll(/export\s*\{([^}]+)\}/g))
    m[1].split(',').forEach(s => { const n = s.trim().split(/\s+as\s+/).pop().trim(); if (n) names.add(n); });
  if (/export\s+default/.test(c)) names.add('default');
  exps['./' + path.basename(f).replace(/\.(jsx?|tsx?)$/, '')] = names;
}
let bad = 0;
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  for (const m of c.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](\.\/[A-Za-z0-9_.\-\/]+)['"]/g)) {
    const tgt = m[2];
    for (const n of m[1].split(',')) {
      const name = n.trim().split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      const hit = Object.keys(exps).some(k => tgt === k && exps[k].has(name));
      if (!hit) { bad++; console.log(f + ': missing export "' + name + '" from ' + tgt); }
    }
  }
}
console.log(bad === 0 ? 'ALL IMPORTS RESOLVE' : bad + ' unresolved');
