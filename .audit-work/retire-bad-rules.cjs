const fs=require('fs');
const creds=JSON.parse(fs.readFileSync('.permit-creds.json','utf8'));
const FN='https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
let TK;
const call=(fn,body)=>fetch(FN+'/'+fn,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,session_token:TK})}).then(r=>r.json());
(async()=>{
  const t=await call('verifyLogin',{username:creds.user,password:creds.pass});TK=t.session_token||t.token;
  const ex=await call('staffDataRead',{entity:'PermitResolutionRule',query:{active:true,rule_type:'postal_city'},limit:100});
  const mine=(ex.items||ex.rows||[]).filter(r=>r.confidence==='auto-gazetteer');
  let n=0;
  for(const r of mine){
    const j=await call('staffEntityWrite',{entity:'PermitResolutionRule',op:'update',data:{id:r.id,active:false,evidence:(r.evidence||'')+' [retired: wrong rule_type schema]'}});
    if(j?.success)n++;
    await new Promise(r=>setTimeout(r,400));
  }
  console.log('retired:',n,'of',mine.length);
})();
