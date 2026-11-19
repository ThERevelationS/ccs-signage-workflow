const { execSync } = require('child_process');
const APP='68dfcc5e57bbbc35387da97c';
const n = parseInt(process.argv[2]||'8',10);
let raw;
try {
  raw = execSync('npx base44@latest api fetch GET /api/apps/'+APP+'/app-checkpoints',
    {maxBuffer:64*1024*1024, shell:'cmd.exe', timeout:300000,
     env:{...process.env, MSYS_NO_PATHCONV:'1'}}).toString();
} catch(e){ raw=(e.stdout||'').toString(); if(!raw){console.error('FAIL',e.message);process.exit(1);} }
const start = raw.indexOf('[');
try {
  const j = JSON.parse(raw.slice(start));
  j.slice(0,n).forEach(c=>console.log(
    (c.created_date||'').slice(0,19),'|',(c.git_commit_hash||'').slice(0,9),'|',
    c.preview_status,'|',c.name,'| id:',c.id));
  // also report newest few matching a pattern
  const pat = process.argv[3];
  if (pat) {
    const hit = j.find(c=>(c.name||'').toLowerCase().includes(pat.toLowerCase()));
    console.log('MATCH['+pat+']:', hit ? JSON.stringify({name:hit.name,id:hit.id,hash:hit.git_commit_hash,created:hit.created_date,status:hit.preview_status}) : 'none');
  }
} catch(e){ console.error('PARSE-FAIL',e.message); process.exit(1); }
