const fs=require('fs');
const creds=JSON.parse(fs.readFileSync('.permit-creds.json','utf8'));
const FN='https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
let TK;
const call=(fn,body)=>fetch(FN+'/'+fn,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,session_token:TK})}).then(r=>r.json());
(async()=>{
  const t=await call('verifyLogin',{username:creds.user,password:creds.pass});TK=t.session_token||t.token;
  const ex=await call('staffDataRead',{entity:'PermitResolutionRule',query:{active:true},limit:2000});
  const all=ex.items||ex.rows||ex.data?.items||[];
  const mine=all.filter(r=>r.rule_type==='postal_city'&&r.confidence==='auto-gazetteer');
  console.log('total active rules:',all.length,'| my postal_city:',mine.length);
  let n=0;
  for(const r of mine){
    const j=await call('staffEntityWrite',{entity:'PermitResolutionRule',op:'update',data:{id:r.id,active:false}});
    if(j?.success)n++;else console.log('fail',JSON.stringify(j).slice(0,100));
    await new Promise(r=>setTimeout(r,400));
  }
  console.log('retired:',n);
})();
