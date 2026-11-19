const fs=require('fs');const now=Date.now();const kinds={};const errs={};const marks={};
for(const l of fs.readFileSync('.live-events.jsonl','utf8').trim().split('\n').slice(-40000)){try{const e=JSON.parse(l);if(now-e.t>45*60000)continue;
const w=String(e.worker||'');if(!/valid|geocode|resolver|parcel|feed|addr/.test(w))continue;
const st=String(e.stage||'');marks[st]=(marks[st]||0)+1;
if(/err|fail|needs_review|unresolved|miss|denied/i.test(st+String(e.detail||''))){const k=w+'|'+st+'|'+String(e.detail||'').slice(0,50);errs[k]=(errs[k]||0)+1;}}catch{}}
console.log('address stages last 45min:',JSON.stringify(marks));
console.log('\nissues:');
for(const[k,v]of Object.entries(errs).sort((a,b)=>b[1]-a[1]).slice(0,15))console.log(' ',v,'x',k);
