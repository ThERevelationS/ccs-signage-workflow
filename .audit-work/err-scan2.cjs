const fs=require('fs');const now=Date.now();const errs={};const workers={};
for(const l of fs.readFileSync('.live-events.jsonl','utf8').trim().split('\n').slice(-25000)){try{const e=JSON.parse(l);if(now-e.t>30*60000)continue;
workers[e.worker]=(workers[e.worker]||0)+1;
if(/err|fail|blocked|denied|timeout|exceeded/i.test(String(e.stage||'')+String(e.detail||''))){const k=(e.worker||'?')+'|'+e.stage+'|'+String(e.detail||'').slice(0,50);errs[k]=(errs[k]||0)+1;}}catch{}}
console.log('error kinds last 30min:');
for(const[k,v]of Object.entries(errs).sort((a,b)=>b[1]-a[1]).slice(0,15))console.log(' ',v,'x',k);
