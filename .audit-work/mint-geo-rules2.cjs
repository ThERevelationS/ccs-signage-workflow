const fs=require('fs');
const creds=JSON.parse(fs.readFileSync('.permit-creds.json','utf8'));
const FN='https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
let TK;
const call=(fn,body)=>fetch(FN+'/'+fn,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,session_token:TK})}).then(r=>r.json());
const norm=s=>s.toLowerCase().trim().replace(/^mt[\s.]/,'mount ').replace(/\bhts\b/,'heights').replace(/,/g,'').replace(/\s+/g,' ');
const gaz=new Map();
for(const [file,st] of [['.audit-work/gaz-oh.txt','OH'],['.audit-work/gaz-ky.txt','KY']]){
  for(const l of fs.readFileSync(file,'utf8').split('\n').slice(1)){const f=l.split('\t');if(f.length<12)continue;
    const base=norm(String(f[3]).replace(/\s+(city|village|CDP|township)$/i,''));
    const type=(String(f[3]).match(/\b(city|village|CDP|township)$/i)||[,'city'])[1].toLowerCase().replace('cdp','city');
    const k=st+'|'+base;
    if(!gaz.has(k))gaz.set(k,[]);
    gaz.get(k).push({type,lat:+f[10],lng:+f[11],full:f[3]});
  }
}
// Manual aliases for the known variants
const ALIAS={'oh|greenfield township':['greenfield','madison township'],'oh|west chester township':['west chester'],'ky|allen city':['allen'],'ky|chavies':['chavies cdp','chavies']};
const targets=['Greenfield Township, OH','West Chester Township, OH','Mt Sterling, OH','Mt Washington, KY','Allen City, KY','WARRENSVL HTS, OH','Mt Vernon, KY','Chavies, KY','Mt Orab, OH'];
(async()=>{
  const t=await call('verifyLogin',{username:creds.user,password:creds.pass});TK=t.session_token||t.token;
  for(const label of targets){
    const m=label.match(/^(.+?),\s*(OH|KY)$/);const name=m[1].trim(),st=m[2];
    const keys=[st+'|'+norm(name),...(ALIAS[st+'|'+norm(name)]||[]).map(a=>st+'|'+norm(a))];
    let hit=null;
    for(const k of keys){const g=gaz.get(k);if(g&&g.length===1){hit={g:g[0],key:k};break;}if(g&&g.length>1){console.log('AMBIG',label,'→',k,g.length);break;}}
    if(!hit){console.log('NO-MATCH',label);continue;}
    const disp=hit.g.full.replace(/\s+(city|village|CDP)$/i,'');
    const rule={rule_type:'postal_city',state:st,jurisdiction_name:disp,jurisdiction_type:hit.g.type,address_key:norm(name),entered_name:name,postal_city:name,active:true,confidence:'auto-gazetteer',evidence:`Auto-minted (variant): "${name}" → ${hit.g.full} @ ${hit.g.lat},${hit.g.lng}`};
    const j=await call('staffEntityWrite',{entity:'PermitResolutionRule',op:'create',data:rule});
    console.log(j?.success||j?.id?'MINTED':'FAIL',label,'→',disp);
    await new Promise(r=>setTimeout(r,400));
  }
})();
