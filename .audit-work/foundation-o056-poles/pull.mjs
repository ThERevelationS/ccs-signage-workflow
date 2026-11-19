// Pull remote files into .audit-work/foundation-o056-poles/remote/
// Usage: node pull.mjs <path1> <path2> ...
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = '68dfcc5e57bbbc35387da97c';
const DIR = join(dirname(fileURLToPath(import.meta.url)), 'remote');

for (const p of process.argv.slice(2)) {
  try {
    const out = execFileSync('npx', ['base44@latest', 'sandbox', 'read', p, '--app-id', APP, '--branch', 'main', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: true });
    const j = JSON.parse(out);
    const f = (j.files || [])[0];
    if (!f || f.error) { console.log('ERR', p, f && f.error); continue; }
    const dest = join(DIR, p.replace(/\//g, '__'));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, f.content);
    console.log('OK', p, f.content.length, 'chars', f.truncated ? 'TRUNCATED' : '');
  } catch (e) {
    console.log('FAIL', p, String(e.message || e).slice(0, 200));
  }
}
