const fs = require('fs');
let s = fs.readFileSync('ESTIMATOR_BACKLOG.md', 'utf8');
const items = Array.from({ length: 25 }, (_, i) => 351 + i);
let done = 0; const miss = [];
for (const n of items) {
  const re = new RegExp('^(\\s*' + n + '\\. \\*\\*\\[[A-Z]+\\])', 'm');
  const m = s.match(re);
  if (m) { s = s.replace(re, m[1] + '[DONE]'); done++; } else miss.push(n);
}
// #363 residual note: client-side dedupe hardened; a server-side unique constraint on
// creation_request_key remains the hard guarantee (flagged).
s = s.replace(/^(\s*363\. .*)$/m, (l) => l.includes('[DONE]') ? l + ' — RESIDUAL: backend unique constraint on creation_request_key still needed for hard guarantee (client dedupe hardened).' : l);
fs.writeFileSync('ESTIMATOR_BACKLOG.md', s);
console.log('marked', done, 'missing', miss.join(','));
