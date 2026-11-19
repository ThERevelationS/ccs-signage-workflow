// Activation09 remote apply driver: read baseline -> verify vs remote08 -> edit/write -> readback hash.
// No checkpoints. Stops on drift or any mutation failure.
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';

const CLI = 'C:/Users/BrettHeinlein/AppData/Local/npm-cache/_npx/6b34a5aeb6ed42d9/node_modules/base44/bin/run.js';
const APP = '68dfcc5e57bbbc35387da97c';
const BR = 'main';
const OUT = '.audit-work/foundation-activation09';
const R08 = '.audit-work/foundation-remote08/files';
const log = [];
const say = (m) => { log.push(m); console.log(m); };
const sameContent = (a, b) => {
  const NL = String.fromCharCode(10);
  if (a === b || a === b + NL || b === a + NL) return true; // remote write strips trailing newline
  try { return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b)); } catch { return false; }
};

const cliJson = (args, input) => {
  const raw = execFileSync('node', [CLI, ...args, '--app-id', APP, '--branch', BR, '--json'], { input, encoding: 'utf8', timeout: 120000 });
  const i = raw.indexOf('{'), j = raw.lastIndexOf('}');
  return JSON.parse(raw.slice(i, j + 1));
};
const cli = (args, input) => execFileSync('node', [CLI, ...args, '--app-id', APP, '--branch', BR, '--json'], { input, encoding: 'utf8', timeout: 120000 });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const lf = (s) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

const readRemote = (path) => {
  try {
    const j = cliJson(['sandbox', 'read', path]);
    const f = j.files?.[0];
    if (!f || f.error || f.content === undefined) return { found: false, body: null, err: JSON.stringify(f?.error || j).slice(0, 200) };
    return { found: true, body: f.content };
  } catch (e) {
    return { found: false, body: null, err: String(e).slice(0, 300) };
  }
};

const existing = [
  ['src/components/estimator/foundation/foundationTemplateService.js', 'foundationTemplateService.js', 'src/components/estimator/foundation/foundationTemplateService.js'],
  ['src/components/estimator/foundation/FoundationPolesPanel.jsx', 'FoundationPolesPanel.jsx', 'src/components/estimator/foundation/FoundationPolesPanel.jsx'],
  ['src/components/estimator/foundation/FoundationWallCapsPanel.jsx', 'FoundationWallCapsPanel.jsx', 'src/components/estimator/foundation/FoundationWallCapsPanel.jsx'],
  ['src/components/estimator/foundation/FoundationWallsPanel.jsx', 'FoundationWallsPanel.jsx', 'src/components/estimator/foundation/FoundationWallsPanel.jsx'],
  ['src/components/estimator/foundation/SignageCabinetsPanel.jsx', 'SignageCabinetsPanel.jsx', 'src/components/estimator/foundation/SignageCabinetsPanel.jsx'],
  ['src/components/estimator/foundation/FoundationTemplateDialog.jsx', 'FoundationTemplateDialog.jsx', 'src/components/estimator/foundation/FoundationTemplateDialog.jsx'],
  ['base44/entities/FoundationProject.jsonc', 'FoundationProject.jsonc', 'base44/entities/FoundationProject.jsonc'],
  ['src/pages/FoundationEstimator.jsx', 'FoundationEstimator.jsx', 'src/pages/FoundationEstimator.jsx'],
];
const newFiles = [
  ['src/components/estimator/foundation/foundationAssemblyModel.js', 'src/components/estimator/foundation/foundationAssemblyModel.js'],
  ['src/components/estimator/foundation/foundationTemplateModel.js', 'src/components/estimator/foundation/foundationTemplateModel.js'],
];

const results = [];
let aborted = null;

// Phase 0: fresh baseline compare for every existing file
for (const [remotePath, baseName, localPath] of existing) {
  const fresh = readRemote(remotePath);
  if (!fresh.found) { aborted = `baseline read failed for ${remotePath}: ${fresh.err}`; break; }
  const expected = fs.readFileSync(`${R08}/${baseName}`, 'utf8');
  const local = lf(fs.readFileSync(localPath, 'utf8'));
  if (lf(fresh.body) !== lf(expected)) {
    if (sameContent(lf(fresh.body), local)) { results.push({ path: remotePath, phase: 'baseline', skipped: 'already-applied' }); continue; }
    aborted = `FOREIGN DRIFT ${remotePath}: remote hash ${sha(lf(fresh.body)).slice(0, 12)} vs baseline ${sha(lf(expected)).slice(0, 12)}`;
    break;
  }
  results.push({ path: remotePath, phase: 'baseline', remoteHash: sha(lf(fresh.body)), localHash: sha(local), willEdit: fresh.body !== local });
}
if (!aborted) {
  // Phase 1: new helpers — verify NOT_FOUND then write (skip if already applied+matching)
  for (const [remotePath, localPath] of newFiles) {
    const fresh = readRemote(remotePath);
    const local = lf(fs.readFileSync(localPath, 'utf8'));
    if (fresh.found && sameContent(lf(fresh.body), local)) { results.push({ path: remotePath, phase: 'write-new', skipped: 'already-applied' }); continue; }
    if (fresh.found) { aborted = `${remotePath} unexpectedly exists with DIFFERENT content; refusing overwrite`; break; }
    const out = cli(['sandbox', 'write', remotePath], local);
    fs.writeFileSync(`${OUT}/mut-write-${remotePath.split('/').pop()}.json`, out);
    results.push({ path: remotePath, phase: 'write-new', localHash: sha(local) });
  }
}
if (!aborted) {
  // Phase 2: schema then panels/service/dialog/page — ordered list = helpers, schema first, then UI
  const order = ['base44/entities/FoundationProject.jsonc',
    'src/components/estimator/foundation/foundationAssemblyModel.js',
    'src/components/estimator/foundation/foundationTemplateModel.js',
    'src/components/estimator/foundation/FoundationPolesPanel.jsx',
    'src/components/estimator/foundation/FoundationWallCapsPanel.jsx',
    'src/components/estimator/foundation/FoundationWallsPanel.jsx',
    'src/components/estimator/foundation/SignageCabinetsPanel.jsx',
    'src/components/estimator/foundation/foundationTemplateService.js',
    'src/components/estimator/foundation/FoundationTemplateDialog.jsx',
    'src/pages/FoundationEstimator.jsx'];
  for (const remotePath of order) {
    if (newFiles.some(n => n[0] === remotePath)) continue; // helpers already written
    const fresh = readRemote(remotePath);
    if (!fresh.found) { aborted = `pre-edit read failed ${remotePath}`; break; }
    const [, baseName, localPath] = existing.find(e => e[0] === remotePath);
    const expected = lf(fs.readFileSync(`${R08}/${baseName}`, 'utf8'));
    if (lf(fresh.body) !== expected && !sameContent(lf(fresh.body), lf(fs.readFileSync(localPath, 'utf8')))) { aborted = `FOREIGN DRIFT ${remotePath}`; break; }
    const local = lf(fs.readFileSync(localPath, 'utf8'));
    if (sameContent(lf(fresh.body), local)) { results.push({ path: remotePath, phase: 'edit', skipped: 'already-equal' }); continue; }
    // stored bytes may be CRLF while read returns LF: try LF, then CRLF-encoded old_text
    let oldText = fresh.body;
    const mk = (o) => JSON.stringify([{ old_text: o, new_text: local, replace_all: false }]);
    try { cli(['sandbox', 'edit', remotePath, '--dry-run'], mk(oldText)); }
    catch (e1) {
      const eText = String(e1) + String(e1.stdout || '') + String(e1.stderr || '');
      if (!/old_text not found/.test(eText)) throw e1;
      oldText = fresh.body.split('\n').join('\r\n');
      const dry2 = cli(['sandbox', 'edit', remotePath, '--dry-run'], mk(oldText));
      fs.writeFileSync(`${OUT}/mut-dryrun-${remotePath.split('/').pop()}.json`, dry2);
    }
    const out = cli(['sandbox', 'edit', remotePath], mk(oldText));
    fs.writeFileSync(`${OUT}/mut-edit-${remotePath.split('/').pop()}.json`, out);
    results.push({ path: remotePath, phase: 'edit', localHash: sha(local) });
  }
}
if (!aborted) {
  // Phase 3: readback verify all 10
  const manifest = [];
  for (const [remotePath, , localPath] of existing.concat(newFiles.map(n => [n[0], '', n[1]]))) {
    const back = readRemote(remotePath);
    const local = lf(fs.readFileSync(localPath, 'utf8'));
    const ok = back.found && sameContent(lf(back.body), local);
    manifest.push({ path: remotePath, remoteSha256: ok ? sha(lf(back.body)) : 'UNVERIFIED', expectedSha256: sha(local), match: ok });
    if (!ok) aborted = `readback mismatch ${remotePath}`;
  }
  fs.writeFileSync(`${OUT}/remote-hash-manifest.json`, JSON.stringify(manifest, null, 1));
  say(JSON.stringify(manifest.map(m => `${m.match ? 'OK ' : 'FAIL'} ${m.path} ${m.remoteSha256.slice(0, 12)}`), null, 0));
}
fs.writeFileSync(`${OUT}/apply-results.json`, JSON.stringify({ aborted, results }, null, 1));
if (aborted) { say('ABORTED: ' + aborted); process.exit(2); }
say('ALL_MUTATIONS_VERIFIED');
