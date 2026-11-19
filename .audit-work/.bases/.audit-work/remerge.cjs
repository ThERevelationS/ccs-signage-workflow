// Runs in the sandbox: 3-way re-merge of clobbered work. result = HEAD + (P - A)
// where P = pre-clobber parent, A = old version the stale copy derived from.
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 << 20 });
const items = JSON.parse(process.argv[2]);
const dir = '.audit-work/remerge'; fs.mkdirSync(dir, { recursive: true });
const lf = (s) => s.replace(/\r\n/g, '\n');
for (const { file, parent, revertedTo } of items) {
  const tag = path.basename(file);
  const w = (n, s) => { const p = path.join(dir, `${tag}.${n}`); fs.writeFileSync(p, lf(s)); return p; };
  const head = w('HEAD', fs.readFileSync(file, 'utf8')), base = w('A', git('show', `${revertedTo}:${file}`)), rich = w('P', git('show', `${parent}:${file}`));
  const r = spawnSync('git', ['merge-file', '-p', '--diff3', '-L', 'HEAD', '-L', 'A-stale-base', '-L', 'P-pre-clobber', head, base, rich], { encoding: 'utf8', maxBuffer: 256 << 20 });
  fs.writeFileSync(path.join(dir, `${tag}.merged`), r.stdout);
  const n = (s) => s.split('\n').length;
  console.log(JSON.stringify({ file, conflicts: r.status, headLines: n(fs.readFileSync(head, 'utf8')), mergedLines: n(r.stdout), pLines: n(fs.readFileSync(rich, 'utf8')) }));
}