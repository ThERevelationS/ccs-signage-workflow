const fs=require('fs');
const creds=JSON.parse(fs.readFileSync('.permit-creds.json','utf8'));
const FN='https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
let TK;
const call=(fn,body)=>fetch(FN+'/'+fn,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,session_token:TK})}).then(r=>r.json());
const h=JSON.parse(fs.readFileSync('.audit-work/human-review-queue.json','utf8'));
const geo=(h.items||[]).filter(i=>i.surface==='geocode');
const cities=new Set(geo.map(i=>{const m=String(i.item||'').match(/,\s*([^,]+),\s*(OH|KY)\s+\d{5}/);return m?m[1].trim().toLowerCase()+'|'+m[2]:null}).filter(Boolean));
(async()=>{
  const t=await call('verifyLogin',{username:creds.user,password:creds.pass});TK=t.session_token||t.token;
  let all=[],skip=0;
  for(;;){
    const ex=await call('staffDataRead',{entity:'PermitResolutionRule',query:{active:true,rule_type:'postal_name_map'},limit:2000,skip});
    const items=ex.items||ex.rows||[];all=all.concat(items);
    if(items.length<2000)break;skip+=items.length;
    if(skip>20000)break;
  }
  const have=new Set(all.filter(r=>r.rule_type==='postal_name_map').map(r=>String(r.entered_name||'').toLowerCase()+'|'+r.state));
  const missing=[...cities].filter(c=>!have.has(c));
  console.log('queue cities:',cities.size,'| postal_name_map rules:',have.size,'| uncovered:',missing.length);
  for(const c of missing.slice(0,15))console.log('  uncovered:',c);
})();
