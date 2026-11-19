const fs=require('fs');
const creds=JSON.parse(fs.readFileSync('.permit-creds.json','utf8'));
const FN='https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const q=JSON.parse(fs.readFileSync('.audit-work/mirrors/queue.json','utf8')).rows||[];
const b=q.filter(r=>r.status==='blocked'&&/Paper\/remnant/i.test(String(r.missing_next||'')));
(async()=>{
  const t=await fetch(FN+'/verifyLogin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:creds.user,password:creds.pass})}).then(r=>r.json());
  const tk=t.session_token||t.token;let ok=0,miss=0;
  for(const r of b){
    const j=await fetch(FN+'/staffEntityWrite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_token:tk,entity:'SourceCollectionQueue',op:'updateMany',id:r.id,query:{id:r.id,updated_date:r.updated_date},update:{$set:{status:'duplicate',missing_next:'Paper/remnant township — folded to parent county jurisdiction.'}}})}).then(r=>r.json()).catch(()=>({}));
    if(j?.success||j?.updated>0)ok++;else{miss++;if(miss===1)console.log('err:',JSON.stringify(j).slice(0,150));}
    await new Promise(r2=>setTimeout(r2,300));
  }
  console.log('stamped:',ok,'missed:',miss);
})();
