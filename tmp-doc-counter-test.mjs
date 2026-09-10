import fs from 'node:fs';
let src = fs.readFileSync('base44/functions/generateDocNumber/entry.ts','utf8');
src = src.replace(/^import .*?;\s*/s, '');
src = src.replace('export default async function (req)', 'async function handler(req)');
const clone = (x) => JSON.parse(JSON.stringify(x));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
function clientFor(Counter) { return { auth:{ me:async()=>({id:'u1'}) }, asServiceRole:{ entities:{ DocNumberCounter:Counter } } }; }
function loadHandler(client) { return new Function('createClientFromRequest', `${src}\nreturn handler;`)(() => client); }
async function invoke(handler, body) { const r = await handler({ json:async()=>body }); return { status:r.status, body:await r.json() }; }
function makeCounter({ next=7, updateMode='normal', initialRows=true }={}) {
  let row = initialRows ? { id:'counter-1', config_name:'default', next_seq:next, updated_date:'v1' } : null;
  let version=1;
  const Counter={
    async filter(){ return row ? [clone(row)] : []; },
    async get(id){ return row && row.id===id ? clone(row) : null; },
    async create(data){ if(row) throw new Error('already exists'); row={id:'counter-1',...data,updated_date:'v1'}; version=1; return clone(row); },
    async updateMany(query,op){
      if(!row || query.id!==row.id || query.updated_date!==row.updated_date || query.config_name!==row.config_name) return {updated:0};
      row={...row,...op.$set,updated_date:`v${++version}`};
      if(updateMode==='throw_after_write') throw new Error('response lost');
      if(updateMode==='invalid_after_write') return {};
      return {updated:1};
    },
    state:()=>clone(row),
  };
  return Counter;
}
let pass=0,total=0;
async function test(name,fn){ total++; try{await fn(); pass++; console.log('PASS',name);}catch(e){console.error('FAIL',name,'-',e.message);} }
await test('single allocation',async()=>{ const C=makeCounter(); const h=loadHandler(clientFor(C)); const r=await invoke(h,{doc_type:'estimate'}); assert(r.status===200,'status'); assert(r.body.number==='EST-00007','number'); assert(C.state().next_seq===8,'counter'); });
await test('batch allocation',async()=>{ const C=makeCounter({next:10}); const h=loadHandler(clientFor(C)); const r=await invoke(h,{doc_type:'order',count:3}); assert(JSON.stringify(r.body.numbers)===JSON.stringify(['INV-00010','INV-00011','INV-00012']),'numbers'); assert(C.state().next_seq===13,'counter'); });
await test('two concurrent requests unique',async()=>{ const C=makeCounter({next:20}); const client=clientFor(C); const h=loadHandler(client); const [a,b]=await Promise.all([invoke(h,{doc_type:'estimate'}),invoke(h,{doc_type:'estimate'})]); const nums=[a.body.number,b.body.number].sort(); assert(nums[0]!==nums[1],'duplicate returned'); assert(nums.includes('EST-00020')&&nums.includes('EST-00021'),`unexpected ${nums}`); assert(C.state().next_seq===22,'counter'); });
await test('lost response fails closed',async()=>{ const C=makeCounter({next:30,updateMode:'throw_after_write'}); const h=loadHandler(clientFor(C)); const r=await invoke(h,{doc_type:'estimate'}); assert(r.status===500,'must fail'); assert(!r.body.number,'uncertain number returned'); assert(C.state().next_seq===31,'durable write expected'); });
await test('invalid response fails closed',async()=>{ const C=makeCounter({next:40,updateMode:'invalid_after_write'}); const h=loadHandler(clientFor(C)); const r=await invoke(h,{doc_type:'order'}); assert(r.status===500,'must fail'); assert(!r.body.number,'uncertain number returned'); assert(C.state().next_seq===41,'durable write expected'); });
await test('missing singleton initializes',async()=>{ const C=makeCounter({initialRows:false}); const h=loadHandler(clientFor(C)); const r=await invoke(h,{doc_type:'estimate'}); assert(r.body.number==='EST-00001','number'); assert(C.state().next_seq===2,'counter'); });
await test('duplicate singleton fails closed',async()=>{ const rows=[{id:'a',config_name:'default',next_seq:1,updated_date:'v1'},{id:'b',config_name:'default',next_seq:2,updated_date:'v1'}]; const Counter={filter:async()=>clone(rows),get:async()=>null,create:async()=>null,updateMany:async()=>{throw new Error('must not write')}}; const h=loadHandler(clientFor(Counter)); const r=await invoke(h,{doc_type:'estimate'}); assert(r.status===500,'must fail'); assert(/Multiple default/.test(r.body.error),'error'); });
console.log(`RESULT ${pass}/${total}`);
if(pass!==total) process.exit(1);
