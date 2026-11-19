// Build restore candidates: repair2(pre-repair remote original) -> working tree.
// Verifies per file: no residual mojibake tokens, no buggy-table artifacts,
// and every changed line is a line that carried mojibake in the original.
const fs = require('fs'), path = require('path');
const { repair } = require('./mojibake-fix2.cjs');
const BAD = /[\u2010\u00D3\u2400\u214E]/g;
const files = process.argv.slice(2);
let ok = true;
for (const p of files) {
  const src = fs.existsSync(path.join('.audit-work/pre-repair', p)) ? path.join('.audit-work/pre-repair', p) : null;
  if (!src) { console.log(p, 'NO-ORIGINAL'); ok = false; continue; }
  const orig = fs.readFileSync(src, 'utf8');
  const r = repair(orig);
  const residual = repair(r.out).fixed;
  const origBad = (orig.match(BAD) || []).length, candBad = (r.out.match(BAD) || []).length;
  const ol = orig.split(/\r?\n/), cl = r.out.split(/\r?\n/);
  let stray = 0;
  for (let i = 0; i < ol.length; i++) if (ol[i] !== cl[i] && repair(ol[i]).fixed === 0) stray++;
  const good = residual === 0 && candBad === origBad && stray === 0 && ol.length === cl.length;
  if (!good) ok = false;
  fs.writeFileSync(p, r.out, 'utf8');
  console.log(good ? 'OK  ' : 'FAIL', p, `fixed=${r.fixed} residual=${residual} artifacts=${candBad}/${origBad} stray=${stray}`);
}
console.log(ok ? 'ALL-OK' : 'PROBLEMS');
