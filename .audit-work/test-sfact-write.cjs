const fs=require('fs');
const creds=JSON.parse(fs.readFileSync('.permit-creds.json','utf8'));
const FN='https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
(async()=>{
  const t=await fetch(FN+'/verifyLogin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:creds.user,password:creds.pass})}).then(r=>r.json());
  const tk=t.session_token||t.token;
  const j=await fetch(FN+'/staffPermittingDocWrite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_token:tk,entity:'SignageFact',op:'create',data:{jurisdiction_name:'__TEST__',state:'OH',sign_type:'general',fact_key:'permit_required',value_json:{value:true},evidence_quote:'test',confidence:'pattern',active:true,fact_identity:'test|general|permit_required|test'}})}).then(r=>r.json());
  console.log('write:',JSON.stringify(j).slice(0,200));
  if(j?.record?.id||j?.row?.id){
    const id=j.record?.id||j.row?.id;
    const d=await fetch(FN+'/staffPermittingDocWrite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_token:tk,entity:'SignageFact',op:'delete',id})}).then(r=>r.json()).catch(()=>({}));
    console.log('cleanup:',JSON.stringify(d).slice(0,100));
  }
})();
