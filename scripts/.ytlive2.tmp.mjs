import { permitCreds } from './lib/permit-creds.mjs';
const APP='68dfcc5e57bbbc35387da97c';
const t=await fetch(`https://base44.app/api/apps/${APP}/functions/verifyLogin`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ username: permitCreds().user, password: permitCreds().pass })}).then(r=>r.json());
const r=await fetch(`https://base44.app/api/apps/${APP}/functions/resolvePermittingAddress`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_token:t.token,address:'15 West Midlothian Boulevard, Youngstown, OH 44507'})});
const txt=await r.text();
console.log('HTTP',r.status,'|',txt.slice(0,600));
