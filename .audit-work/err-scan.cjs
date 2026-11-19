const fs=require('fs');const now=Date.now();const errs={};const sf={};
for(const l of fs.readFileSync('.live-events.jsonl','utf8').trim().split('\n').slice(-15000)){try{const e=JSON.parse(l);if(now-e.t>20*60000)continue;
if(/err|fail|blocked/.test(String(e.stage||''))){const k=e.worker+':'+String(e.detail||'').slice(0,45);errs[k]=(errs[k]||0)+1;}
if(String(e.worker||'').startsWith('sfacts'))sf[e.stage]=(sf[e.stage]||0)+1;}catch{}}
console.log('errors last 20min:');for(const[k,v]of Object.entries(errs).sort((a,b)=>b[1]-a[1]).slice(0,10))console.log(' ',v,'x',k);
console.log('sfacts:',JSON.stringify(sf));
