const { execFileSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const CLI = 'C:/Users/BrettHeinlein/AppData/Local/npm-cache/_npx/6b34a5aeb6ed42d9/node_modules/base44/bin/run.js';
const APP = '68dfcc5e57bbbc35387da97c';
const OUT = '.audit-work/foundation-layout10/remote-sync';
const args0 = ['--app-id', APP, '--branch', 'main', '--json'];
const run = (a, input) => execFileSync('node', [CLI, ...a, ...args0], { input, encoding: 'utf8', timeout: 120000 });
const jparse = (raw) => { const i = raw.indexOf('{'), j = raw.lastIndexOf('}'); return JSON.parse(raw.slice(i, j + 1)); };
const read = (path) => {
  const j = jparse(run(['sandbox', 'read', path]));
  const f = j.files?.[0];
  if (!f || f.error || f.content === undefined) return { found: false };
  return { found: true, body: f.content };
};
const lf = (s) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const log = [];
const PANEL = 'src/components/estimator/foundation/FoundationLayoutCanvas.jsx';
const HELPER = 'src/components/estimator/foundation/foundationLayoutModel.js';

// 1) baseline compare
const fresh = read(PANEL);
if (!fresh.found) { console.log('STOP: panel read failed'); process.exit(2); }
const baseline = lf(fs.readFileSync('.audit-work/foundation-layout10/before.jsx', 'utf8'));
if (lf(fresh.body) !== baseline) { console.log('STOP: FOREIGN DRIFT panel', sha(lf(fresh.body)).slice(0, 12), 'vs', sha(baseline).slice(0, 12)); process.exit(2); }
log.push('panel baseline match ' + sha(lf(fresh.body)).slice(0, 12));
// 2) helper must be NOT_FOUND
const h = read(HELPER);
const helperLocal = lf(fs.readFileSync(HELPER, 'utf8'));
if (h.found) { console.log('STOP: helper exists remote', sha(lf(h.body)).slice(0, 12), 'local', sha(helperLocal).slice(0, 12)); process.exit(2); }
log.push('helper NOT_FOUND confirmed');
// 3) write helper
const w = run(['sandbox', 'write', HELPER], helperLocal);
fs.writeFileSync(`${OUT}/mut-write-model.json`, w);
log.push('helper written');
// 4) edit panel: dry-run first (LF then CRLF), then real
const panelLocal = lf(fs.readFileSync(PANEL, 'utf8'));
let oldText = fresh.body;
const mk = (o) => JSON.stringify([{ old_text: o, new_text: panelLocal, replace_all: false }]);
try { run(['sandbox', 'edit', PANEL, '--dry-run'], mk(oldText)); }
catch (e) {
  if (!/old_text not found/.test(String(e) + String(e.stdout || ''))) throw e;
  oldText = fresh.body.split('\n').join('\r\n');
  const d = run(['sandbox', 'edit', PANEL, '--dry-run'], mk(oldText));
  fs.writeFileSync(`${OUT}/mut-dryrun-canvas-crlf.json`, d);
}
const e2 = run(['sandbox', 'edit', PANEL], mk(oldText));
fs.writeFileSync(`${OUT}/mut-edit-canvas.json`, e2);
log.push('panel edited');
// 5) readback verify
for (const [path, local] of [[PANEL, panelLocal], [HELPER, helperLocal]]) {
  const b = read(path);
  const ok = b.found && (lf(b.body) === local || lf(b.body) === local.replace(/\n$/, '') || lf(b.body) + '\n' === local);
  log.push(`${ok ? 'OK' : 'FAIL'} readback ${path} remote=${b.found ? sha(lf(b.body)).slice(0, 16) : 'NF'} local=${sha(local).slice(0, 16)}`);
  if (!ok) { console.log('STOP: readback mismatch ' + path); fs.writeFileSync(`${OUT}/log.txt`, log.join('\n')); process.exit(2); }
}
fs.writeFileSync(`${OUT}/log.txt`, log.join('\n'));
console.log(log.join('\n'));
