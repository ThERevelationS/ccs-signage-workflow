const fs = require('fs'), path = require('path');
const dir = 'base44/functions';
const fns = fs.readdirSync(dir).filter(d => { try { return fs.statSync(path.join(dir, d, 'entry.ts')).isFile(); } catch { return false; } });
const re = /\[([0-9,\s]+)\]\.includes\(status\)/g;
let touched = [], skipped = 0;
for (const f of fns) {
  const p = path.join(dir, f, 'entry.ts');
  let src = fs.readFileSync(p, 'utf8');
  let changed = false;
  const out = src.replace(re, (m, nums) => {
    if (/(^|[,\s])429([,\s]|$)/.test(nums)) return m;
    changed = true;
    if (/,\s*503\s*$/.test(nums)) return '[' + nums.replace(/,\s*503\s*$/, ', 429, 503') + '].includes(status)';
    return '[' + nums.replace(/\s*$/, '') + ', 429].includes(status)';
  });
  if (changed && out !== src) { fs.writeFileSync(p, out); touched.push(f); }
  else skipped++;
}
console.log('patched:', touched.length);
console.log(touched.join(','));
