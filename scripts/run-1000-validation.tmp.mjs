// Chain: wait for the wide fixture -> sample 1000 spread across both states
// -> fresh token -> live validation.
import { readFileSync, writeFileSync, existsSync, openSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { permitCreds } from './lib/permit-creds.mjs';
const SRCS=['.fixture-business-1000-src.json','.fixture-business-1000-src2.json'];
console.log('waiting for fixtures…');
while (SRCS.some(f=>!existsSync(f))) await new Promise(r=>setTimeout(r,15000));
await new Promise(r=>setTimeout(r,3000));
const seen=new Set(), pool=[];
for (const f of SRCS) for (const a of JSON.parse(readFileSync(f,'utf8'))) { const k=String(a).toLowerCase(); if(!seen.has(k)){seen.add(k);pool.push(a);} }
console.log('merged pool: '+pool.length);
if (pool.length < 1000) { console.log('fixture too small: '+pool.length); process.exit(1); }
// seeded shuffle so the run order is random but reproducible
let seed = 20261101;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const shuffle = a => { const x=[...a]; for(let i=x.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[x[i],x[j]]=[x[j],x[i]];} return x; };
const oh = shuffle(pool.filter(a=>/, OH\b| OH \d/.test(a)));
const ky = shuffle(pool.filter(a=>/, KY\b| KY \d/.test(a)));
console.log(`pool ${pool.length} — OH ${oh.length}, KY ${ky.length}`);
const picked=[];
for(let i=0;picked.length<1000&&(oh[i]||ky[i]);i++){ if(oh[i])picked.push(oh[i]); if(ky[i]&&picked.length<1000)picked.push(ky[i]); }
writeFileSync('.fixture-business-1000.json', JSON.stringify(picked,null,1));
console.log('sampled '+picked.length+' (OH '+picked.filter(a=>/ OH\b| OH \d/.test(a)).length+' / KY '+(picked.length-picked.filter(a=>/ OH\b| OH \d/.test(a)).length)+') — fresh token');
const APP='68dfcc5e57bbbc35387da97c';
const t = await fetch(`https://base44.app/api/apps/${APP}/functions/verifyLogin`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ username: permitCreds().user, password: permitCreds().pass })}).then(r=>r.json());
if (!t?.token) { console.log('no token'); process.exit(1); }
writeFileSync('.permit-token.txt', t.token);
console.log('launching validation of '+picked.length);
const logFd = openSync('.validation-1000.log','w');
execFileSync('node', ['scripts/permitting-address-validation.mjs','--file','.fixture-business-1000.json','--json','.validation-1000.json'], {env:{...process.env,PERMIT_SESSION_TOKEN:t.token},stdio:['ignore',logFd,logFd]});
