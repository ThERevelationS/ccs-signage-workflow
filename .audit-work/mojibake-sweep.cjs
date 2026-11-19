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
const marks = ['â€', 'Ã—', 'Ã©', 'Ã¨', 'Ã§', 'Â±', 'â‰', 'Â§'];
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const hits = marks.filter(m => s.includes(m));
  if (hits.length) {
    const lines = s.split('\n').filter(l => marks.some(m => l.includes(m))).length;
    console.log(f.replace(/\\/g, '/').split('src/')[1], hits.join(' '), lines + ' lines');
  }
}
console.log('sweep done', files.length, 'files');
