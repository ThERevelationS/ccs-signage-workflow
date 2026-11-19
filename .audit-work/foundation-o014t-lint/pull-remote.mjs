// Pull scoped remote files into .audit-work/foundation-o014t-lint/remote/ (read-only audit mirror)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const APP = '68dfcc5e57bbbc35387da97c';
const ROOT = '.audit-work/foundation-o014t-lint';
const files = readFileSync(`${ROOT}/scope-files.txt`, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
const BATCH = 30;
let pulled = 0, failed = [];
for (let i = 0; i < files.length; i += BATCH) {
  const batch = files.slice(i, i + BATCH);
  const cmd = `npx base44@latest sandbox read ${batch.join(' ')} --app-id ${APP} --branch main --json`;
  let out;
  try {
    out = execSync(cmd, { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
  } catch (e) {
    console.log(`BATCH ${i}: exec fail ${String(e.message).slice(0, 200)}`);
    failed.push(...batch);
    continue;
  }
  let j;
  try { j = JSON.parse(out); } catch (e) {
    console.log(`BATCH ${i}: json parse fail; len=${out.length}; head=${out.slice(0,200)}`);
    failed.push(...batch);
    continue;
  }
  for (const f of (j.files || [])) {
    if (f.error) { failed.push(f.path); console.log(`ERR ${f.path}: ${f.error.code || JSON.stringify(f.error).slice(0,120)}`); continue; }
    const dest = join(ROOT, 'remote', f.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, f.content);
    pulled++;
  }
  console.log(`batch ${i}-${i + batch.length}: pulled=${pulled}`);
}
console.log(`DONE pulled=${pulled} failed=${failed.length}`);
if (failed.length) console.log('FAILED:\n' + failed.join('\n'));
