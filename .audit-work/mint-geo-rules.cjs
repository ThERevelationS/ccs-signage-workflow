const fs=require('fs');
const creds=JSON.parse(fs.readFileSync('.permit-creds.json','utf8'));
const FN='https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const call=(fn,body)=>fetch(FN+'/'+fn,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,session_token:TK})}).then(r=>r.json());
let TK;
// Gazetteer lookup — name+state -> {type,lat,lng}
const gaz=new Map();
for(const [file,st] of [['.audit-work/gaz-oh.txt','OH'],['.audit-work/gaz-ky.txt','KY']]){
  const lines=fs.readFileSync(file,'utf8').split('\n').slice(1);
  for(const l of lines){const f=l.split('\t');if(f.length<12)continue;
    const base=String(f[3]).replace(/\s+(city|village|CDP|township)$/i,'').toLowerCase().trim();
    const type=(String(f[3]).match(/\b(city|village|CDP|township)$/i)||[,'city'])[1].toLowerCase().replace('cdp','city');
    const k=st+'|'+base;
    if(!gaz.has(k))gaz.set(k,[]);
    gaz.get(k).push({type,lat:+f[10],lng:+f[11],full:f[3]});
  }
}
const h=JSON.parse(fs.readFileSync('.audit-work/human-review-queue.json','utf8'));
const geo=(h.items||[]).filter(i=>i.surface==='geocode');
// Unique jurisdictions: "Name, ST zip" -> pick "Name"
const uniq=new Map();
for(const it of geo){
  const m=String(it.jurisdiction||'').match(/^(.+?),\s*(OH|KY)\b/i);if(!m)continue;
  const name=m[1].trim(),st=m[2].toUpperCase();
  if(!uniq.has(st+'|'+name.toLowerCase()))uniq.set(st+'|'+name.toLowerCase(),{name,st,items:0});
  uniq.get(st+'|'+name.toLowerCase()).items++;
}
console.log('unique jurisdictions:',uniq.size);
(async()=>{
  const t=await call('verifyLogin',{username:creds.user,password:creds.pass});TK=t.session_token||t.token;
  const ex=await call('staffDataRead',{entity:'PermitResolutionRule',query:{active:true},limit:2000});
  const have=new Set((ex.items||ex.rows||[]).map(r=>String(r.jurisdiction_name||'').toLowerCase()+'|'+r.state));
  let minted=0,skipped=0,ambiguous=0,nogaz=0;
  for(const {name,st,items} of uniq.values()){
    if(have.has(name.toLowerCase()+'|'+st)){skipped++;continue;}
    const g=gaz.get(st+'|'+name.toLowerCase());
    if(!g){nogaz++;continue;}
    if(g.length>1){ambiguous++;continue;} // same-name places — never guess
    const rule={rule_type:'postal_city',state:st,jurisdiction_name:name,jurisdiction_type:g[0].type,address_key:name.toLowerCase(),entered_name:name,postal_city:name,active:true,confidence:'auto-gazetteer',evidence:`Auto-minted from Census Gazetteer centroid ${g[0].lat},${g[0].lng} — ${items} flagged address(es) resolved.`};
    const j=await call('staffEntityWrite',{entity:'PermitResolutionRule',op:'create',data:rule});
    if(j?.success||j?.id){minted++;}else{console.log('fail',name,JSON.stringify(j).slice(0,120));}
    await new Promise(r=>setTimeout(r,400));
  }
  console.log(`minted:${minted} covered:${skipped} ambiguous:${ambiguous} not-in-gazetteer:${nogaz}`);
})();
