const fs=require('fs');
const creds=JSON.parse(fs.readFileSync('.permit-creds.json','utf8'));
const FN='https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
(async()=>{
  const t=await fetch(FN+'/verifyLogin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:creds.user,password:creds.pass})}).then(r=>r.json());
  const tk=t.session_token||t.token;
  const rows=await fetch(FN+'/staffDataRead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_token:tk,entity:'SourceCollectionQueue',query:{status:'blocked'},limit:50})}).then(r=>r.json());
  const list=(rows.items||rows.rows||rows.data?.items||[]).filter(r=>/Paper\/remnant/i.test(String(r.missing_next||'')));
  let ok=0;
  for(const r of list){
    const j=await fetch(FN+'/staffEntityWrite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_token:tk,entity:'SourceCollectionQueue',op:'updateMany',id:r.id,query:{id:r.id,updated_date:r.updated_date},update:{$set:{status:'duplicate',missing_next:'Paper/remnant township — folded to parent county jurisdiction.'}}})}).then(r=>r.json()).catch(()=>({}));
    if(j?.success||j?.updated>0)ok++;
    await new Promise(r2=>setTimeout(r2,1500));
  }
  console.log('remaining blocked:',list.length,'stamped:',ok);
})();
