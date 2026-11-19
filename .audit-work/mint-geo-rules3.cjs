const fs=require('fs');
const creds=JSON.parse(fs.readFileSync('.permit-creds.json','utf8'));
const FN='https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
let TK;
const call=(fn,body)=>fetch(FN+'/'+fn,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,session_token:TK})}).then(r=>r.json());
// West Chester township centroid from cousub file
let wc={lat:null,lng:null};
for(const l of fs.readFileSync('.audit-work/gaz-cousub-oh.txt','utf8').split('\n')){
  const f=l.split('\t');if(/^West Chester township$/i.test(f[3]||''))wc={lat:+f[f.length-1],lng:+f[f.length-2]};
}
const targets=[
  {name:'Allen City',st:'KY',pick:'Allen',type:'city',ev:'Gazetteer: Allen city (2100946)'},
  {name:'WARRENSVL HTS',st:'OH',pick:'Warrensville Heights',type:'city',ev:'Gazetteer: Warrensville Heights city (3980990)'},
  {name:'West Chester Township',st:'OH',pick:'West Chester Township',type:'township',ev:`Cousub: West Chester township, Butler Co @ ${wc.lng},${wc.lat}`},
];
(async()=>{
  const t=await call('verifyLogin',{username:creds.user,password:creds.pass});TK=t.session_token||t.token;
  for(const x of targets){
    const rule={rule_type:'postal_city',state:x.st,jurisdiction_name:x.pick,jurisdiction_type:x.type,address_key:x.name.toLowerCase(),entered_name:x.name,postal_city:x.name,active:true,confidence:'auto-gazetteer',evidence:`Auto-minted (variant): "${x.name}" → ${x.pick}. ${x.ev}`};
    const j=await call('staffEntityWrite',{entity:'PermitResolutionRule',op:'create',data:rule});
    console.log(j?.success||j?.id?'MINTED':'FAIL',x.name,'→',x.pick,JSON.stringify(j).slice(0,80));
    await new Promise(r=>setTimeout(r,400));
  }
})();
