// Runs INSIDE the sandbox (/app). Flags commits that look like a stale-copy
// overwrite: commit C removes >= MIN_REMOVED lines that its parent P had, and
// C's content is >= 97% line-contained in some OLDER version A of the file in
// which most of those removed lines are also absent (C reverted to ~A).
const { execFileSync } = require('child_process');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 << 20 });
const SINCE = process.argv[2] || '2026-11-03';
const MIN_REMOVED = 12;
const inScope = (p) => /^src\/components\/estimator\//.test(p) || /^src\/pages\/[^/]*(Estimat|CNCSettings)[^/]*\.jsx$/.test(p)
  || /^src\/(lib|components\/(workorders?|invoic\w*|sales))\//.test(p)
  || /^base44\/functions\/[^/]+\/entry\.ts$/.test(p) || /^base44\/shared\//.test(p) || /^base44\/entities\/[^/]+\.jsonc$/.test(p);
const files = git('ls-files').split('\n').filter(inScope);
const lines = (rev, p) => { try { return git('show', `${rev}:${p}`).replace(/\r/g, '').split('\n').map((l) => l.trim()).filter((l) => l.length > 3); } catch { return null; } };
const findings = [];
for (const p of files) {
  const revs = git('log', '--format=%h %cI', `--since=${SINCE}`, '--', p).trim().split('\n').filter(Boolean).map((l) => l.split(' '));
  if (revs.length < 2) continue;
  const older = git('log', '--format=%h %cI', '-40', '--', p).trim().split('\n').filter(Boolean).map((l) => l.split(' '));
  for (let i = 0; i < revs.length - 1; i++) {
    const [c, cd] = revs[i];
    const pi = older.findIndex(([h]) => h === c);
    const parent = older[pi + 1]; if (!parent) continue;
    const C = lines(c, p), P = lines(parent[0], p); if (!C || !P) continue;
    const cs = new Set(C);
    const removed = [...new Set(P.filter((l) => !cs.has(l)))];
    if (removed.length < MIN_REMOVED) continue;
    for (const [a, ad] of older.slice(pi + 2, pi + 25)) {
      const A = lines(a, p); if (!A) continue;
      const as = new Set(A);
      const contained = C.filter((l) => as.has(l)).length / C.length;
      const removedAbsentInA = removed.filter((l) => !as.has(l)).length / removed.length;
      if (contained >= 0.97 && removedAbsentInA >= 0.8) {
        findings.push({ file: p, commit: c, date: cd, parent: parent[0], removed: removed.length, revertedTo: a, revertedToDate: ad, contained: +contained.toFixed(3) });
        break;
      }
    }
  }
}
console.log(JSON.stringify({ scannedFiles: files.length, since: SINCE, findings }, null, 1));