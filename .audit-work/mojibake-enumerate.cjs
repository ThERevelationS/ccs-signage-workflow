const fs = require('fs'), path = require('path');
const walk = (d, out = []) => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(f)) out.push(p);
  }
  return out;
};
const files = walk('src/components/estimator')
  .concat(walk('src/pages').filter(p => /Estimator/i.test(p)));
// mojibake run: starts with Ã/â/Â then any run of chars in the double-encode alphabet
const seqs = new Map();
const RUN = /[ÃÂâ][-ÿ€œ”‘’–—±§×·©³²°‰≈≥≤]+/g;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(RUN)) {
    if (!seqs.has(m[0])) seqs.set(m[0], { count: 0, files: new Set() });
    const e = seqs.get(m[0]); e.count++; e.files.add(f.split(/[\\/]/).pop());
  }
}
for (const [seq, info] of seqs) {
  const bytes = Buffer.from([...seq].map(c => c.charCodeAt(0)));
  try { info.decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { info.decoded = null; }
}
const sorted = [...seqs.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [seq, i] of sorted) {
  console.log(JSON.stringify(seq), '->', JSON.stringify(i.decoded), 'x' + i.count, [...i.files].slice(0, 5).join(','));
}
