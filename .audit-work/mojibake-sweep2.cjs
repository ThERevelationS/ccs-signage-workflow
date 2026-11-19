const fs = require('fs'), path = require('path');
const walk = (d, out = []) => {
  if (!fs.existsSync(d)) return out;
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (f !== 'node_modules' && f !== '.git') walk(p, out); }
    else if (/\.(jsx?|tsx?|jsonc?)$/.test(f)) out.push(p);
  }
  return out;
};
const marks = ['â€', 'Ã—', 'Ã©', 'Ã¨', 'Ã§', 'Â±', 'â‰', 'Â§', 'â”€'];
const dirs = ['base44/functions', 'base44/shared', 'base44/entities', 'base44/actors', 'src/lib'];
const files = dirs.flatMap(d => walk(d));
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const hits = marks.filter(m => s.includes(m));
  if (hits.length) {
    const lines = s.split('\n').filter(l => marks.some(m => l.includes(m)));
    console.log(f.replace(/\\/g, '/'), hits.join(' '), lines.length + ' lines');
    lines.slice(0, 3).forEach(l => console.log('   ', l.trim().slice(0, 90)));
  }
}
console.log('sweep done', files.length, 'files');
