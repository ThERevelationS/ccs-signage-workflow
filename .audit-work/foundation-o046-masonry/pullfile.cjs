const { execSync } = require('child_process');
const fs = require('fs');
const APP='68dfcc5e57bbbc35387da97c';
const p = process.argv[2];
const out = 'remote/' + p.split('/').join('__');
let raw;
try {
  raw = execSync('npx base44@latest sandbox read "' + p + '" --app-id ' + APP + ' --branch main --json',
    {maxBuffer:64*1024*1024, shell:'cmd.exe', timeout:300000}).toString();
} catch(e){ raw = (e.stdout||'').toString(); if(!raw){ console.error('FAIL-EXEC',p, e.message); process.exit(1);} }
const start = raw.indexOf('{');
try {
  const j = JSON.parse(raw.slice(start));
  const f = (j.files||[]).find(f=>f.path===p) || j.files[0];
  if(!f || typeof f.content!=='string'){ console.error('FAIL-NOCONTENT',p); process.exit(1); }
  fs.writeFileSync(out, f.content);
  console.log('OK', p, '->', out, f.content.length, 'bytes');
} catch(e){ console.error('FAIL-PARSE',p,e.message); process.exit(1); }
