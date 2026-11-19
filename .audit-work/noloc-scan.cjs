const fs=require('fs');const now=Date.now();const byJx={};const samples=[];
for(const l of fs.readFileSync('.live-events.jsonl','utf8').trim().split('\n').slice(-80000)){try{
const e=JSON.parse(l);if(e.stage!=='located_no_locality')continue;
const jx=String(e.jurisdiction||e.detail||'').slice(0,50)||'?';
byJx[jx]=(byJx[jx]||0)+1;
if(samples.length<5)samples.push({a:String(e.address||'').slice(0,55),d:String(e.detail||'').slice(0,120),jx:jx});
}catch{}}
console.log('clusters:',Object.entries(byJx).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([k,v])=>v+'x '+k).join('\n  '));
console.log('samples:',JSON.stringify(samples,null,1).slice(0,1200));
