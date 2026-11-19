// Upgrade the 15 draft-shaped records to real multi-office records.
import { jurisdictionToPermitLocality, normalizePermitJurisdictionName } from '../src/components/permitting/jurisdictionPermitBridge.js';
import { permitCreds } from './lib/permit-creds.mjs';
const APP='68dfcc5e57bbbc35387da97c';
const FN=`https://base44.app/api/apps/${APP}/functions`;
const t=await fetch(`${FN}/verifyLogin`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ username: permitCreds().user, password: permitCreds().pass })}).then(r=>r.json());
const call=async(fn,body)=>{for(let i=0;i<6;i++){const r=await fetch(`${FN}/${fn}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_token:t.token,...body})});const j=await r.json().catch(()=>({}));if(r.status!==429&&j?.error!=='traffic volume')return j;await new Promise(s=>setTimeout(s,4000+i*3000));}return{};};
const locs=(await call('staffDataRead',{entity:'PermitLocality',query:{},limit:500})).items||[];
const stale=locs.filter(l=>(l.offices||[]).some(o=>/drafted from the jurisdiction repository/i.test(o.contact_notes||'')));
console.log('stale draft-shaped records:',stale.length);
for(const l of stale){
 const prof=l.jurisdiction_profile_id?(await call('staffDataRead',{entity:'JurisdictionProfile',query:{id:l.jurisdiction_profile_id},limit:1})).items?.[0]:null;
 if(!prof){console.log(' skip',l.name,'— no profile');continue;}
 const payload=jurisdictionToPermitLocality(prof);
 const res=await call('staffEntityWrite',{entity:'PermitLocality',op:'update',id:l.id,data:{offices:payload.offices}});
 console.log(' ',l.name,'→',res?.success===false?'FAIL '+(res.error||'').slice(0,80):`${payload.offices.length} real offices`);
 await new Promise(r=>setTimeout(r,1200));
}
