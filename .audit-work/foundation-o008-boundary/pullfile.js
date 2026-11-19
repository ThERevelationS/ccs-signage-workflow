const { execFileSync } = require('child_process');
const fs = require('fs');
const APP='68dfcc5e57bbbc35387da97c';
const path = process.argv[2];
const out = 'remote/' + path.replace(/[\/\]/g,'__');
let raw;
try {
  raw = execFileSync('npx',['base44@latest','sandbox','read',path,'--app-id',APP,'--branch','main','--json'],{maxBuffer:64*1024*1024}).toString();
} catch(e){ raw = (e.stdout||'').toString(); if(!raw){ console.error('FAIL-EXEC',path); process.exit(1);} }
const start = raw.indexOf('{');
try {
  const j = JSON.parse(raw.slice(start));
  const f = (j.files||[]).find(f=>f.path===path) || j.files?.[0];
  if(!f || typeof f.content!=='string'){ console.error('FAIL-NOCONTENT',path); process.exit(1); }
  fs.writeFileSync(out, f.content);
  console.log('OK', path, '->', out, f.content.length, 'bytes');
} catch(e){ console.error('FAIL-PARSE',path,e.message); process.exit(1); }
