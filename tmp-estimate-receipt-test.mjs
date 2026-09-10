import fs from 'node:fs/promises';
import { transform } from 'esbuild';

let source=await fs.readFile('./base44/functions/ensureNewEstimate/entry.ts','utf8');
source=source.replace(/^import[^\n]*\n/,'');
source=source.replace('Deno.serve(async (req) => {','globalThis.__handler = async (req) => {');
source=source.replace(/\n\}\);\s*$/,'\n};');
const out=await transform(source,{loader:'ts',format:'esm',target:'es2022'});
const factory=new Function('createClientFromRequest',`${out.code}; return globalThis.__handler;`);

const clone=x=>JSON.parse(JSON.stringify(x));
let seq=0;
const baseEstimate={project_name:'Lobby Sign',client_name:'Acme',customer_id:'cust1',estimate_number:'EST-00007',status:'draft'};
const key='estimate-create-k1';
const mk=(id=`e${++seq}`,extra={})=>({id,created_date:`2026-09-10T19:00:${String(seq).padStart(2,'0')}Z`,updated_date:`v${seq}`,...clone(baseEstimate),creation_request_key:key,line_items:[],work_order_id:'',...clone(extra)});

function makeStore(mode='normal',{initial=[],referencedId='',protectLosing=false}={}){
  const rows=initial.map(clone);let createCalls=0,deletes=0,filters=0;
  const service={
    filter:async q=>{
      filters++;
      if((mode==='post_read_fail'||mode==='lost_read_fail')&&createCalls>0)throw new Error('receipt read down');
      if(q?.creation_request_key!==undefined)return rows.filter(r=>r.creation_request_key===q.creation_request_key).map(clone);
      if(q?.id!==undefined)return rows.filter(r=>r.id===q.id).map(clone);
      if(q?.estimate_id!==undefined)return referencedId===q.estimate_id?[{id:'ref'}]:[];
      return [];
    },
    get:async id=>rows.find(r=>r.id===id)?clone(rows.find(r=>r.id===id)):null,
    deleteMany:async q=>{const i=rows.findIndex(r=>r.id===q.id&&r.creation_request_key===q.creation_request_key&&r.updated_date===q.updated_date);if(i<0)return{deleted:0};rows.splice(i,1);deletes++;return{deleted:1};},
  };
  const userEntity={
    create:async payload=>{
      createCalls++;
      if(mode==='hard_fail')throw new Error('create failed');
      if(mode==='concurrent_current_loses' || mode==='concurrent_loser_protected') {
        const other=mk(undefined,payload);
        const own=mk(undefined,payload);
        const storedOwn=mode==='concurrent_loser_protected'
          ? {...own,line_items:protectLosing?[{id:'p1'}]:[],work_order_id:protectLosing?'wo1':''}
          : own;
        rows.push(other,storedOwn);
        return clone(own);
      }
      const own=mk(undefined,payload);
      if(mode==='lost_one'){rows.push(own);throw new Error('lost response');}
      if(mode==='lost_two'){rows.push(own,mk(undefined,payload));throw new Error('lost response');}
      if(mode==='lost_read_fail'){rows.push(own);throw new Error('lost response');}
      if(mode==='concurrent_current_wins'){rows.push(own,mk(undefined,payload));return clone(own);}
      rows.push(own);return clone(own);
    }
  };
  const emptyRef={filter:async q=>referencedId===q?.estimate_id?[{id:'ref'}]:[]};
  const serviceEntities=new Proxy({AllInOneEstimate:service},{get:(t,p)=>t[p]||emptyRef});
  const client={auth:{me:async()=>({id:'u1',email:'u@test.com'})},entities:{AllInOneEstimate:userEntity},asServiceRole:{entities:serviceEntities}};
  return{client,rows,stats:()=>({createCalls,deletes,filters})};
}
async function invoke(store,body={creation_key:key,estimate:baseEstimate}){const h=factory(()=>store.client);const res=await h(new Request('http://test.local',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));return{status:res.status,data:await res.json()};}
async function test(name,fn){try{await fn();console.log(`PASS ${name}`);return 1}catch(e){console.error(`FAIL ${name}: ${e.stack||e}`);return 0}}
let pass=0,total=0;

total++;pass+=await test('normal create',async()=>{const s=makeStore();const r=await invoke(s);if(r.status!==200||r.data.reused||s.rows.length!==1)throw new Error(JSON.stringify({r,rows:s.rows}))});
total++;pass+=await test('single existing receipt reused without create',async()=>{const s=makeStore('normal',{initial:[mk('old')]});const r=await invoke(s);if(r.status!==200||!r.data.reused||s.stats().createCalls!==0)throw new Error(JSON.stringify({r,stats:s.stats()}))});
total++;pass+=await test('mismatched existing receipt blocks create',async()=>{const s=makeStore('normal',{initial:[mk('bad',{project_name:'Different'})]});const r=await invoke(s);if(r.status!==409||s.stats().createCalls!==0)throw new Error(JSON.stringify(r))});
total++;pass+=await test('multiple existing receipt rows fail closed',async()=>{const s=makeStore('normal',{initial:[mk('a'),mk('b')]});const r=await invoke(s);if(r.status!==409||s.stats().createCalls!==0||s.rows.length!==2)throw new Error(JSON.stringify({r,stats:s.stats()}))});
total++;pass+=await test('lost create response recovers one durable draft',async()=>{const s=makeStore('lost_one');const r=await invoke(s);if(r.status!==200||!r.data.recovered_after_create_error||s.rows.length!==1)throw new Error(JSON.stringify(r))});
total++;pass+=await test('lost create response with two rows fails without cleanup',async()=>{const s=makeStore('lost_two');const r=await invoke(s);if(r.status!==409||s.stats().deletes!==0||s.rows.length!==2)throw new Error(JSON.stringify({r,stats:s.stats()}))});
total++;pass+=await test('lost response plus failed recovery read is explicit',async()=>{const s=makeStore('lost_read_fail');const r=await invoke(s);if(r.status!==409||!/Do not retry blindly/i.test(r.data.error||'')||s.rows.length!==1)throw new Error(JSON.stringify(r))});
total++;pass+=await test('known create plus failed verification is explicit',async()=>{const s=makeStore('post_read_fail');const r=await invoke(s);if(r.status!==409||!/Do not retry blindly/i.test(r.data.error||'')||s.rows.length!==1)throw new Error(JSON.stringify(r))});
total++;pass+=await test('current request canonical never deletes unknown concurrent draft',async()=>{const s=makeStore('concurrent_current_wins');const r=await invoke(s);if(r.status!==409||s.stats().deletes!==0||s.rows.length!==2)throw new Error(JSON.stringify({r,stats:s.stats()}))});
total++;pass+=await test('losing current request deletes only its own safe draft',async()=>{const s=makeStore('concurrent_current_loses');const r=await invoke(s);if(r.status!==200||!r.data.concurrent_duplicate_discarded||s.stats().deletes!==1||s.rows.length!==1)throw new Error(JSON.stringify({r,stats:s.stats(),rows:s.rows}))});
total++;pass+=await test('losing current draft with Products/WorkOrder is preserved',async()=>{const s=makeStore('concurrent_loser_protected',{protectLosing:true});const r=await invoke(s);if(r.status!==409||s.stats().deletes!==0||s.rows.length!==2)throw new Error(JSON.stringify({r,stats:s.stats(),rows:s.rows}))});
console.log(`RESULT ${pass}/${total}`);if(pass!==total)process.exit(1);
