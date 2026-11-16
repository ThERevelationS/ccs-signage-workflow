// Runs in the sandbox. Clobber recovery for commit C (stale write) over P (rich):
//   A* = the historical version (older than P) with the smallest diff to C —
//        the true stale base, so C - A* is only the edit the writer intended;
//   R1 = merge3(ours=P, base=A*, theirs=C)   -> P + intended edit
//   R  = merge3(ours=R1, base=C, theirs=HEAD) -> + everything committed after C
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 << 20 });
const lf = (s) => s.replace(/\r\n/g, '\n');
const dir = '.audit-work/remerge2'; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const diffLines = (a, b) => { const r = spawnSync('git', ['diff', '--no-index', '--numstat', a, b], { encoding: 'utf8' }); const m = r.stdout.trim().split(/\s+/); return (+m[0] || 0) + (+m[1] || 0); };
const merge = (ours, base, theirs, labels) => spawnSync('git', ['merge-file', '-p', '--diff3', '-L', labels[0], '-L', labels[1], '-L', labels[2], ours, base, theirs], { encoding: 'utf8', maxBuffer: 256 << 20 });
for (const { file, commit: C, parent: P } of JSON.parse(process.argv[2])) {
  const tag = path.basename(file);
  const w = (n, s) => { const p = path.join(dir, `${tag}.${n}`); fs.writeFileSync(p, lf(s)); return p; };
  const pC = w('C', git('show', `${C}:${file}`)), pP = w('P', git('show', `${P}:${file}`)), pH = w('HEAD', fs.readFileSync(file, 'utf8'));
  const hist = git('log', '--format=%h', '-60', `${P}~1`, '--', file).trim().split('\n').filter(Boolean);
  let best = null;
  for (const h of hist) { const pa = w(`cand-${h}`, git('show', `${h}:${file}`)); const d = diffLines(pa, pC); if (!best || d < best.d) best = { h, d, pa }; }
  const pA = w('A', fs.readFileSync(best.pa, 'utf8'));
  for (const f of fs.readdirSync(dir)) if (f.startsWith(`${tag}.cand-`)) fs.unlinkSync(path.join(dir, f));
  const r1 = merge(pP, pA, pC, ['P-rich', 'A-stale-base', 'C-intended']); const pR1 = w('R1', r1.stdout);
  const r2 = merge(pR1, pC, pH, ['R1', 'C', 'HEAD-later']); w('merged', r2.stdout);
  console.log(JSON.stringify({ file: tag, staleBase: best.h, intendedEditLines: best.d, laterEditLines: diffLines(pC, pH), conflicts1: r1.status, conflicts2: r2.status, lines: { P: lf(fs.readFileSync(pP, 'utf8')).split('\n').length, HEAD: lf(fs.readFileSync(pH, 'utf8')).split('\n').length, merged: r2.stdout.split('\n').length } }));
}
