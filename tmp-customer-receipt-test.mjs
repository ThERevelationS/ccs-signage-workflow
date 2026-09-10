import fs from 'node:fs/promises';
import { transform } from 'esbuild';

async function loadHandler(path) {
  let source = await fs.readFile(path, 'utf8');
  source = source.replace(/^import[^\n]*\n/, '');
  source = source.replace('Deno.serve(async (req) => {', 'globalThis.__handler = async (req) => {');
  source = source.replace(/\n\}\);\s*$/, '\n};');
  const out = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
  const factory = new Function('createClientFromRequest', `${out.code}; return globalThis.__handler;`);
  return (client) => factory(() => client);
}

const loadNew = await loadHandler('./base44/functions/ensureNewCustomer/entry.ts');
const loadEstimate = await loadHandler('./base44/functions/ensureEstimateCustomer/entry.ts');
const req = (body) => new Request('http://test.local', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) });
const clone = (x) => JSON.parse(JSON.stringify(x));
let seq = 0;
function row(payload, id = `c${++seq}`) { return { id, created_date:`2026-09-10T18:00:${String(seq).padStart(2,'0')}Z`, updated_date:`v${seq}`, ...clone(payload) }; }
function makeStore({ mode = 'normal', initial = [], listRows = null, reference = false } = {}) {
  const rows = initial.map(clone); let filters = 0; let deletes = 0; let createCalls = 0;
  const filter = async (query) => {
    filters++;
    if ((mode === 'post_read_fail' || mode === 'lost_read_fail') && createCalls > 0) throw new Error('receipt read down');
    if (query?.id) return rows.filter(r => r.id === query.id);
    const key = query?.creation_request_key ?? query?.estimator_creation_key;
    if (key !== undefined) return rows.filter(r => (r.creation_request_key ?? r.estimator_creation_key) === key);
    if (query?.customer_id) return reference ? [{id:'ref'}] : [];
    return [];
  };
  const create = async (payload) => {
    createCalls++;
    if (mode === 'hard_fail') throw new Error('create failed');
    if (mode === 'lost_one' || mode === 'lost_read_fail') { const r=row(payload); rows.push(r); throw new Error('lost response'); }
    if (mode === 'lost_two') { rows.push(row(payload),row(payload)); throw new Error('lost response'); }
    if (mode === 'concurrent_current_wins') { const own=row(payload); rows.push(own,row(payload)); return clone(own); }
    if (mode === 'concurrent_current_loses') { const other=row(payload); rows.push(other); const own=row(payload); rows.push(own); return clone(own); }
    const r=row(payload); rows.push(r); return clone(r);
  };
  const get = async (id) => rows.find(r=>r.id===id) ? clone(rows.find(r=>r.id===id)) : null;
  const updateMany = async (query, update) => { const i=rows.findIndex(r=>r.id===query.id && r.updated_date===query.updated_date); if(i<0)return {updated:0}; rows[i]={...rows[i],...(update?.$set||{}),updated_date:`u${++seq}`}; return {updated:1}; };
  const deleteMany = async (query) => { const i=rows.findIndex(r=>r.id===query.id && (!query.updated_date || r.updated_date===query.updated_date)); if(i<0)return {deleted:0}; rows.splice(i,1); deletes++; return {deleted:1}; };
  const entity = { filter, create, get, updateMany, deleteMany, list: async () => listRows === null ? [] : clone(listRows) };
  return { entity, rows, stats:()=>({filters,deletes,createCalls}) };
}
function clientFor(store) {
  const empty = { filter: async()=>[] };
  const entities = new Proxy({ Customer: store.entity }, { get:(t,p)=>t[p]||empty });
  return { auth:{me:async()=>({id:'u1',email:'a@test.com'})}, entities:{Customer:store.entity}, asServiceRole:{entities} };
}
async function invoke(loader, store, body) { const h=loader(clientFor(store)); const res=await h(req(body)); return {status:res.status, data:await res.json()}; }
async function test(name, fn) { try { await fn(); console.log(`PASS ${name}`); return 1; } catch(e) { console.error(`FAIL ${name}: ${e.stack||e}`); return 0; } }
const newBody={creation_key:'k1',customer:{company_name:'Acme',pricing_tier:1}};
const estBody={company_name:'Acme',fields:{contact_email:'x@acme.test'},update_existing:true};
let pass=0,total=0;

for (const [name, loader, body, keyField] of [
  ['NewCustomer',loadNew,newBody,'creation_request_key'],
  ['EstimateCustomer',loadEstimate,estBody,'estimator_creation_key'],
]) {
  total++; pass+=await test(`${name} normal create`, async()=>{const s=makeStore();const r=await invoke(loader,s,body);if(r.status!==200||r.data.reused)throw new Error(JSON.stringify(r));});
  total++; pass+=await test(`${name} receipt retry reuses one`, async()=>{const key=name==='NewCustomer'?'k1':'estimate_customer:acme';const payload=name==='NewCustomer'?{company_name:'Acme',pricing_tier:1,customer_status:'prospect',is_active:true,[keyField]:key}:{company_name:'Acme',customer_status:'prospect',[keyField]:key,contact_email:'x@acme.test'};const s=makeStore({initial:[row(payload)]});const r=await invoke(loader,s,body);if(r.status!==200||!r.data.reused||s.stats().createCalls!==0)throw new Error(JSON.stringify({r,stats:s.stats()}));});
  total++; pass+=await test(`${name} lost response recovers one`, async()=>{const s=makeStore({mode:'lost_one'});const r=await invoke(loader,s,body);if(r.status!==200||!r.data.recovered_after_create_error||s.rows.length!==1)throw new Error(JSON.stringify({r,rows:s.rows}));});
  total++; pass+=await test(`${name} lost response with two rows fails closed`, async()=>{const s=makeStore({mode:'lost_two'});const r=await invoke(loader,s,body);if(r.status===200||s.stats().deletes!==0||s.rows.length!==2)throw new Error(JSON.stringify({r,stats:s.stats(),rows:s.rows.length}));});
  total++; pass+=await test(`${name} known create plus failed verification is explicit`, async()=>{const s=makeStore({mode:'post_read_fail'});const r=await invoke(loader,s,body);if(r.status===200||!/Do not retry blindly/i.test(r.data.error||'')||s.rows.length!==1)throw new Error(JSON.stringify(r));});
  total++; pass+=await test(`${name} lost response plus failed recovery read is explicit`, async()=>{const s=makeStore({mode:'lost_read_fail'});const r=await invoke(loader,s,body);if(r.status===200||!/Do not retry blindly/i.test(r.data.error||'')||s.rows.length!==1)throw new Error(JSON.stringify(r));});
  total++; pass+=await test(`${name} current request canonical does not delete unknown concurrent row`, async()=>{const s=makeStore({mode:'concurrent_current_wins'});const r=await invoke(loader,s,body);if(r.status===200||s.stats().deletes!==0||s.rows.length!==2)throw new Error(JSON.stringify({r,stats:s.stats(),rows:s.rows.length}));});
  total++; pass+=await test(`${name} losing current request deletes only its own row`, async()=>{const s=makeStore({mode:'concurrent_current_loses'});const r=await invoke(loader,s,body);if(r.status!==200||!r.data.concurrent_duplicate_discarded||s.stats().deletes!==1||s.rows.length!==1)throw new Error(JSON.stringify({r,stats:s.stats(),rows:s.rows}));});
}
console.log(`RESULT ${pass}/${total}`); if(pass!==total)process.exit(1);
