// Prints a compact error/feed delta every 60s so the session stays live.
import { readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
const F='.live-events.jsonl';
const FAIL=new Set(['invoke','unresolved','office_error']);
const rd=f=>{try{return readFileSync(f,'utf8')}catch{return''}};
const queue=()=>{try{return JSON.parse(rd('.retry-failed.json')).length}catch{return 0}};
let off=statSync(F).size;
const seen=new Set();
setInterval(()=>{
  try{
    const st=statSync(F);if(st.size<=off)return;
    const buf=Buffer.alloc(st.size-off);const fd=openSync(F,'r');readSync(fd,buf,0,buf.length,off);closeSync(fd);off=st.size;
    const evs=buf.toString('utf8').split('\n').map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
    const fails=evs.filter(e=>FAIL.has(e.stage));
    for(const e of fails){const k=e.address; if(!seen.has(k)){seen.add(k);console.log(new Date(e.t).toISOString().slice(11,19),'NEWFAIL',e.stage,'|',e.address,'|',(e.detail||'').slice(0,70));}}
    const stages={};for(const e of evs)if(e.stage)stages[e.stage]=(stages[e.stage]||0)+1;
    console.log(new Date().toISOString().slice(11,19),'tick — new-events:',evs.length,'| new-fails:',fails.length,'| retry-queue:',queue(),'|',Object.entries(stages).map(([k,v])=>k+':'+v).join(' '));
  }catch(e){console.log('mon-err',String(e).slice(0,80))}
},60000);
console.log('monitor armed — prints new failures + deltas every 60s');
