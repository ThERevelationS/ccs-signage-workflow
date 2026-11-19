const fs = require('fs'); const path = require('path');
const { repair } = require('./mojibake-fix2.cjs');
const norm = v => v.split('\r\n').join('\n').replace(/\n+$/, '');
const BADCH = /[\u2010\u00D3\u2400\u214E\u2018]/; // chars the buggy table produced
const files = process.argv.slice(2);
for (const p of files) {
  const orig = fs.readFileSync(path.join('.audit-work/pre-repair', p), 'utf8');
  const cur = fs.readFileSync(p, 'utf8');
  const cand = norm(repair(orig).out).split('\n'), now = norm(cur).split('\n');
  const origL = norm(orig).split('\n');
  if (cand.length !== now.length) { console.log(p, `LINECOUNT cand=${cand.length} now=${now.length} orig=${origL.length}`); continue; }
  let enc = 0, other = [];
  for (let i = 0; i < cand.length; i++) if (cand[i] !== now[i]) (BADCH.test(now[i]) || origL[i] !== cand[i] ? enc++ : other.push(i + 1));
  console.log(p, `encoding-lines=${enc}`, other.length ? `OTHER=${other.length} @${other.slice(0, 6).join(',')}` : 'other=0');
}
