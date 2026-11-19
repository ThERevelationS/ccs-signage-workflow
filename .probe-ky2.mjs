const FN='https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const token=process.env.T;
for(const address of ['215 W 3rd St, Tompkinsville, KY 42167','5 Orphanage Rd, Fort Mitchell, KY 41017']){
  let out=null;
  for(let i=0;i<4;i++){
    const r=await fetch(FN+'/resolvePermittingAddress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_token:token,address,diagnostic:true})});
    const j=await r.json().catch(()=>({}));
    if(r.status===200){const lr=j.location_resolution||{};out={http:r.status,status:lr.status,reason:String(lr.reason||'').slice(0,90),err:String(lr.error||'').slice(0,150),tgts:(lr.targets||[]).map(x=>x.name+'/'+x.type).join('+'),srcs:(lr.sources||[]).length};break}
    out={http:r.status,err:String(j.error||j.error_detail||'').slice(0,120)};
    await sleep(4000+i*3000);
  }
  console.log(address,'\n →',JSON.stringify(out));
}
