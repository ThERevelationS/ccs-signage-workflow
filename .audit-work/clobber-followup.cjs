// Runs in the sandbox: for each flagged commit, are the lines it removed back in HEAD?
const { execFileSync } = require('child_process');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 << 20 });
const L = (rev, p) => git('show', `${rev}:${p}`).replace(/\r/g, '').split('\n').map((l) => l.trim()).filter((l) => l.length > 3);
const items = JSON.parse(process.argv[2]);
const out = [];
for (const [p, c, parent] of items) {
  const C = new Set(L(c, p)), P = L(parent, p), H = new Set(L('HEAD', p));
  const removed = [...new Set(P.filter((l) => !C.has(l)))];
  const back = removed.filter((l) => H.has(l));
  const after = git('log', '--format=%h %cI', `${c}..HEAD`, '--', p).trim().split('\n').filter(Boolean);
  out.push({ file: p, commit: c, removed: removed.length, presentInHead: back.length, laterCommits: after.length,
    missingSample: removed.filter((l) => !H.has(l)).slice(0, 6).map((l) => l.slice(0, 110)) });
}
console.log(JSON.stringify(out, null, 1));
