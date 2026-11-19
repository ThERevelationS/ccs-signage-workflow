const FN='https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const t=await fetch(FN+'/verifyLogin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'bheinlein',password:'Heinlein56!!'})}).then(r=>r.json());
if(!t?.token){console.log('no token');process.exit(1)}
const addrs=[
 '1 South Court Street, Athens, OH 45701',
 '9840 Brewster Lane, Powell, OH 43065',
 '657 West Main Street, Blanchester, OH 45107',
 '88 Miller Drive, Sunbury, OH 43074',
];
for(const address of addrs){
  let out=null;
  for(let i=0;i<6;i++){
    const r=await fetch(FN+'/resolvePermittingAddress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_token:t.token,address})});
    const j=await r.json().catch(()=>({}));
    if(r.status===200){out={http:r.status,res:j.location_resolution?.status,tgt:(j.location_resolution?.targets||[]).map(x=>x.name+'/'+x.type).join('+')};break}
    out={http:r.status,err:String(j.error||j.error_detail||'').slice(0,110)};
    await sleep(3000+i*2000);
  }
  console.log(address,'→',JSON.stringify(out));
  await sleep(800);
}
