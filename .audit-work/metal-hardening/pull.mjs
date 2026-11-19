// Pull remote files from Base44 sandbox into .audit-work/channel-letter-hardening/remote/
// Usage: node pull.mjs <file-list.txt>
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = '68dfcc5e57bbbc35387da97c';
const BRANCH = 'main';

const listFile = process.argv[2] || join(HERE, 'files.txt');
const paths = readFileSync(listFile, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

let ok = 0, fail = 0;
for (const p of paths) {
  try {
    const out = execSync(
      `npx base44@latest sandbox read "${p}" --app-id ${APP} --branch ${BRANCH} --json`,
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const json = JSON.parse(out);
    const f = (json.files || [])[0];
    if (!f || f.error) {
      console.error(`ERR ${p}: ${f ? f.error : 'no file entry'}`);
      fail++;
      continue;
    }
    const dest = join(HERE, 'remote', p);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, f.content);
    console.log(`OK  ${p} (${f.content.length} chars)`);
    ok++;
  } catch (e) {
    console.error(`ERR ${p}: ${e.message.slice(0, 200)}`);
    fail++;
  }
}
console.log(`\n${ok} ok, ${fail} failed`);
