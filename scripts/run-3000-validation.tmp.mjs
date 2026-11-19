// Chain: wait for fixture -> fresh token -> live 3000-address validation.
import { readFileSync, writeFileSync, existsSync, openSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { permitCreds } from './lib/permit-creds.mjs';
const FIXTURE='.fixture-business-3000.json';
console.log('waiting for fixture…');
while (!existsSync(FIXTURE)) await new Promise(r=>setTimeout(r,15000));
const addrs = JSON.parse(readFileSync(FIXTURE,'utf8'));
if (addrs.length < 2500) { console.log('fixture too small: '+addrs.length); process.exit(1); }
console.log('fixture ready: '+addrs.length+' addresses — fetching fresh token');
const APP='68dfcc5e57bbbc35387da97c';
const t = await fetch(`https://base44.app/api/apps/${APP}/functions/verifyLogin`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ username: permitCreds().user, password: permitCreds().pass })}).then(r=>r.json());
if (!t?.token) { console.log('no token'); process.exit(1); }
writeFileSync('.permit-token.txt', t.token);
console.log('token fresh — launching validation');
const logFd = openSync('.validation-3000.log','w');
execFileSync('node', ['scripts/permitting-address-validation.mjs','--file',FIXTURE,'--json','.validation-3000.json'], {env:{...process.env,PERMIT_SESSION_TOKEN:t.token},stdio:['ignore',logFd,logFd]});
