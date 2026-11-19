// Live dashboard for the 1000-address run. Usage: node scripts/watch-validation.mjs
import { readFileSync, existsSync } from 'node:fs';
const FILES = { fix1:'.fixture-1000-build.log', fix2:'.fixture-1000-build2.log', src:'.fixture-business-1000-src.json', src2:'.fixture-business-1000-src2.json', fix:'.fixture-business-1000.json', val:'.validation-1000.log', res:'.validation-1000.json' };
const lastLines = (f,n)=>{ try { return readFileSync(f,'utf8').trim().split('\n').slice(-n); } catch { return []; } };
const count = f => { try { return JSON.parse(readFileSync(f,'utf8')).length; } catch { return 0; } };
while (true) {
  console.clear();
  const now = new Date().toLocaleTimeString();
  console.log('══════════════  PERMITTING 1000-ADDRESS LIVE RUN  ══════════════');
  console.log(`  ${now}   (Ctrl+C to stop watching — the run keeps going)`);
  const c1 = count(FILES.src), c2 = count(FILES.src2), cf = count(FILES.fix);
  console.log(`\n▶ FIXTURE: pass1 ${c1} + pass2 ${c2} collected  |  sampled set: ${cf||'—'}`);
  const fl = lastLines(FILES.fix2,2); if (fl.length) console.log('  last city: '+fl[fl.length-1]);
  const vl = lastLines(FILES.val,6);
  if (vl.length) {
    console.log('\n▶ VALIDATION (live resolvePermittingAddress):');
    for (const l of vl.filter(l=>l.includes('/')&&l.includes('resolved'))) console.log('  '+l);
    const last = vl[vl.length-1]; if (!last.includes('resolved so far')) console.log('  last line: '+last);
    const res = (()=>{try{return JSON.parse(readFileSync(FILES.res,'utf8'));}catch{return null;}})();
    if (res?.results) {
      const done = res.results.length;
      const stages = {};
      for (const r of res.results) stages[r.stage]=(stages[r.stage]||0)+1;
      console.log(`\n▶ RESULTS so far (${done}):`);
      for (const [s,n] of Object.entries(stages).sort((a,b)=>b[1]-a[1])) console.log(`    ${s.padEnd(28)} ${n}`);
      const fails = res.results.filter(r=>!r.ok).slice(-5);
      if (fails.length) { console.log('  recent failures:'); for (const f of fails) console.log(`    [${f.stage}] ${f.address} — ${f.detail}`.slice(0,90)); }
    }
  } else {
    console.log('\n▶ VALIDATION: not started yet — starts automatically when the fixture finishes');
  }
  console.log('\n────────────────────────────────────────────────────────────────');
  await new Promise(r=>setTimeout(r,10000));
}
