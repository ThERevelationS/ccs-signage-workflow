const fs = require('fs');
const { execSync } = require('child_process');

const remote = fs.readFileSync('.tmp-rfiles.txt', 'utf8').split('\n').map(s => s.trim()).filter(s => s.startsWith('src/'));
const APP = '68dfcc5e57bbbc35387da97c';
let updated = 0, errors = 0, same = 0;

(async () => {
  for (let i = 0; i < remote.length; i += 50) {
    const chunk = remote.slice(i, i + 50);
    const out = `.tmp-chunk-${i}.json`;
    try {
      execSync(`npx base44@latest sandbox read ${chunk.join(' ')} --app-id ${APP} --branch main --json > ${out} 2>NUL`, { stdio: 'pipe', timeout: 120000 });
    } catch (e) { console.log(`CHUNK ${i} exec fail`); errors += chunk.length; continue; }
    let r;
    try {
      const raw = fs.readFileSync(out, 'utf8');
      r = JSON.parse(raw.slice(raw.indexOf('{')));
    } catch { console.log(`CHUNK ${i} bad json`); errors += chunk.length; continue; }
    for (const f of (r.files || [])) {
      if (f.error) { errors++; continue; }
      let cur = null;
      try { cur = fs.readFileSync(f.path, 'utf8'); } catch { }
      const a = cur === null ? null : cur.replace(/\r\n/g, '\n');
      const b = (f.content || '').replace(/\r\n/g, '\n');
      if (a === b) { same++; continue; }
      fs.writeFileSync(f.path, f.content);
      updated++;
    }
    fs.unlinkSync(out);
    console.log(`chunk ${i}-${i + chunk.length}: ok, updated=${updated} same=${same} err=${errors}`);
  }
  console.log(`DONE updated=${updated} same=${same} errors=${errors} total=${remote.length}`);
})();
