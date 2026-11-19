const fs = require('fs');
const raw = fs.readFileSync(process.argv[2], 'utf8');
const path = process.argv[3];
const out = process.argv[4];
const start = raw.indexOf('{');
try {
  const j = JSON.parse(raw.slice(start));
  const f = (j.files || []).find(f => f.path === path) || (j.files || [])[0];
  if (!f || typeof f.content !== 'string') { console.error('FAIL-NOCONTENT', path); process.exit(1); }
  fs.writeFileSync(out, f.content);
  console.log('OK', path, '->', out, f.content.length, 'bytes');
} catch (e) { console.error('FAIL-PARSE', path, e.message); process.exit(1); }
