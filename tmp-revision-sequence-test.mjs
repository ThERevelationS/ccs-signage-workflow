import fs from 'node:fs';
import { transformSync } from 'esbuild';

const clone = (x) => JSON.parse(JSON.stringify(x));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

function loadFunction(path, fnName) {
  let src = fs.readFileSync(path, 'utf8').replace(/^import .*?;\s*/s, '');
  src += `\n;globalThis.__testedFn = ${fnName};`;
  const out = transformSync(src, { loader:'ts', format:'iife', target:'es2020' }).code;
  const oldDeno = globalThis.Deno;
  globalThis.Deno = { serve() {} };
  try { (0,eval)(out); return globalThis.__testedFn; }
  finally { globalThis.Deno = oldDeno; delete globalThis.__testedFn; }
}

function makeRevisionEntity(rows) {
  let version = 10;
  let data = rows.map(clone);
  return {
    async filter(query) {
      return data.filter(r => Object.entries(query || {}).every(([k,v]) => r[k] === v)).map(clone);
    },
    async get(id) { const r=data.find(x=>x.id===id); return r?clone(r):null; },
    async updateMany(query, op) {
      const i=data.findIndex(r=>Object.entries(query||{}).every(([k,v])=>r[k]===v));
      if(i<0) return {updated:0};
      data[i]={...data[i],...op.$set,updated_date:`v${++version}`};
      return {updated:1};
    },
    rows:()=>data.map(clone),
  };
}

let pass=0,total=0;
async function test(name, fn){ total++; try{await fn(); pass++; console.log('PASS',name);}catch(e){console.error('FAIL',name,'-',e.message);} }

const settleBuilder = loadFunction('base44/functions/ensureBuilderPriceRevision/entry.ts','settleRevisionNumber');
const settleOpen = loadFunction('base44/functions/ensureOpenEstimateRevision/entry.ts','settleCreatedRevisionNumber');

await test('Builder revision with no collision stays unchanged', async()=>{
  const E=makeRevisionEntity([{id:'r1',builder_product_id:'b1',revision_number:1,created_date:'2026-01-01T00:00:00Z',updated_date:'v1'}]);
  const r=await settleBuilder(E,'b1',E.rows()[0]); assert(r.revision_number===1,'renumbered unexpectedly');
});
await test('Later Builder revision collision is renumbered', async()=>{
  const E=makeRevisionEntity([
    {id:'r1',builder_product_id:'b1',revision_number:2,created_date:'2026-01-01T00:00:00Z',updated_date:'v1'},
    {id:'r2',builder_product_id:'b1',revision_number:2,created_date:'2026-01-01T00:00:01Z',updated_date:'v2'},
  ]);
  const r=await settleBuilder(E,'b1',E.rows()[1]); assert(r.revision_number===3,`expected 3 got ${r.revision_number}`); const nums=E.rows().map(x=>x.revision_number); assert(new Set(nums).size===2,'collision remains');
});
await test('Earlier Builder collision winner keeps number', async()=>{
  const E=makeRevisionEntity([
    {id:'r1',builder_product_id:'b1',revision_number:4,created_date:'2026-01-01T00:00:00Z',updated_date:'v1'},
    {id:'r2',builder_product_id:'b1',revision_number:4,created_date:'2026-01-01T00:00:01Z',updated_date:'v2'},
  ]);
  const r=await settleBuilder(E,'b1',E.rows()[0]); assert(r.revision_number===4,'winner changed');
});
await test('Open Estimate revision no collision stays unchanged', async()=>{
  const E=makeRevisionEntity([{id:'e1',estimate_id:'est1',revision_status:'open',revision_number:1,created_date:'2026-01-01T00:00:00Z',updated_date:'v1'}]);
  const r=await settleOpen(E,'est1',E.rows()[0]); assert(r.revision_number===1,'renumbered unexpectedly');
});
await test('Open revision colliding with completed lifecycle revision is renumbered', async()=>{
  const E=makeRevisionEntity([
    {id:'e1',estimate_id:'est1',revision_status:'completed',revision_number:5,created_date:'2026-01-01T00:00:00Z',updated_date:'v1'},
    {id:'e2',estimate_id:'est1',revision_status:'open',revision_number:5,created_date:'2026-01-01T00:00:01Z',updated_date:'v2'},
  ]);
  const r=await settleOpen(E,'est1',E.rows()[1]); assert(r.revision_number===6,`expected 6 got ${r.revision_number}`); const nums=E.rows().map(x=>x.revision_number); assert(new Set(nums).size===2,'collision remains');
});
console.log(`RESULT ${pass}/${total}`);
if(pass!==total) process.exit(1);
