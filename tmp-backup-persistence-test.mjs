import fs from 'node:fs/promises';
import { transform } from 'esbuild';

async function loadSingletonModule() {
  const source = await fs.readFile('./base44/shared/globalSettingSingleton.ts', 'utf8');
  const out = await transform(source, { loader:'ts', format:'esm', target:'es2022' });
  const url = `data:text/javascript;base64,${Buffer.from(out.code).toString('base64')}`;
  return import(url);
}

const { loadGlobalSettingSingleton, saveGlobalSettingFromSnapshot } = await loadSingletonModule();
const clone = (v) => JSON.parse(JSON.stringify(v));
let seq = 0;
const mk = (key, value, id=`r${++seq}`) => ({ id, setting_key:key, setting_value:clone(value), created_date:`2026-09-10T18:00:${String(seq).padStart(2,'0')}Z`, updated_date:`v${seq}` });

function makeEntity(initial=[], mode='normal') {
  const rows = initial.map(clone); let creates=0, updates=0, deletes=0;
  return {
    rows,
    stats:()=>({creates,updates,deletes}),
    entity:{
      filter: async ({setting_key}) => rows.filter(r=>r.setting_key===setting_key).map(clone),
      create: async (payload) => {
        creates++;
        if (mode==='lost_create') { const r=mk(payload.setting_key,payload.setting_value); rows.push(r); throw new Error('lost create'); }
        if (mode==='duplicate_create') { const r=mk(payload.setting_key,payload.setting_value); rows.push(r,mk(payload.setting_key,payload.setting_value)); return clone(r); }
        const r=mk(payload.setting_key,payload.setting_value); rows.push(r); return clone(r);
      },
      updateMany: async (query, update) => {
        updates++;
        const i=rows.findIndex(r=>r.id===query.id && r.setting_key===query.setting_key && r.updated_date===query.updated_date);
        if (mode==='conflict_different' && i>=0) { rows[i]={...rows[i],setting_value:{value:'other'},updated_date:`v${++seq}`}; return {updated:0}; }
        if (mode==='conflict_same' && i>=0) { rows[i]={...rows[i],setting_value:clone(update.$set.setting_value),updated_date:`v${++seq}`}; return {updated:0}; }
        if (i<0) return {updated:0};
        rows[i]={...rows[i],...clone(update.$set),updated_date:`v${++seq}`};
        if (mode==='lost_update') throw new Error('lost update');
        if (mode==='impossible_multi') return {updated:2};
        return {updated:1};
      },
    }
  };
}

async function test(name, fn) { try { await fn(); console.log(`PASS ${name}`); return 1; } catch(e) { console.error(`FAIL ${name}: ${e.stack||e}`); return 0; } }
let pass=0,total=0;
const key='backupSettings'; const oldVal={schedule:'daily'}; const newVal={schedule:'weekly'};

total++; pass+=await test('singleton load blocks duplicates', async()=>{const s=makeEntity([mk(key,oldVal),mk(key,oldVal)]);let err;try{await loadGlobalSettingSingleton({entity:s.entity,settingKey:key,label:'Backup settings'});}catch(e){err=e}if(!err||!/2 records/.test(err.message))throw new Error(err?.message||'no error');});
total++; pass+=await test('singleton create normal', async()=>{const s=makeEntity();const r=await saveGlobalSettingFromSnapshot({entity:s.entity,settingKey:key,settingValue:newVal,settleMs:0,label:'Backup settings'});if(r.status!=='created'||s.rows.length!==1)throw new Error(JSON.stringify(r));});
total++; pass+=await test('lost create response recovers one row', async()=>{const s=makeEntity([],'lost_create');const r=await saveGlobalSettingFromSnapshot({entity:s.entity,settingKey:key,settingValue:newVal,settleMs:0,label:'Backup settings'});if(r.status!=='recovered_after_create_error'||s.rows.length!==1)throw new Error(JSON.stringify(r));});
total++; pass+=await test('simultaneous duplicate create fails closed without deletion', async()=>{const s=makeEntity([],'duplicate_create');let err;try{await saveGlobalSettingFromSnapshot({entity:s.entity,settingKey:key,settingValue:newVal,settleMs:0,label:'Backup settings'});}catch(e){err=e}if(!err||s.rows.length!==2)throw new Error(err?.message||'missing error');});
total++; pass+=await test('concurrent absent-to-existing same value converges', async()=>{const s=makeEntity([mk(key,newVal)]);const r=await saveGlobalSettingFromSnapshot({entity:s.entity,settingKey:key,settingValue:newVal,label:'Backup settings'});if(r.status!=='concurrent_existing'||s.stats().updates!==0)throw new Error(JSON.stringify(r));});
total++; pass+=await test('concurrent absent-to-existing different value is preserved', async()=>{const s=makeEntity([mk(key,oldVal)]);let err;try{await saveGlobalSettingFromSnapshot({entity:s.entity,settingKey:key,settingValue:newVal,label:'Backup settings'});}catch(e){err=e}if(!err||s.rows[0].setting_value.schedule!=='daily'||s.stats().updates!==0)throw new Error(err?.message||'missing conflict');});
total++; pass+=await test('conditional update normal', async()=>{const row=mk(key,oldVal);const s=makeEntity([row]);const r=await saveGlobalSettingFromSnapshot({entity:s.entity,settingKey:key,settingValue:newVal,expectedId:row.id,expectedUpdatedDate:row.updated_date,label:'Backup settings'});if(r.status!=='updated'||s.rows[0].setting_value.schedule!=='weekly')throw new Error(JSON.stringify(r));});
total++; pass+=await test('stale version different value blocks overwrite', async()=>{const row=mk(key,oldVal);const s=makeEntity([{...row,updated_date:'newer',setting_value:{schedule:'monthly'}}]);let err;try{await saveGlobalSettingFromSnapshot({entity:s.entity,settingKey:key,settingValue:newVal,expectedId:row.id,expectedUpdatedDate:row.updated_date,label:'Backup settings'});}catch(e){err=e}if(!err||s.rows[0].setting_value.schedule!=='monthly')throw new Error(err?.message||'missing conflict');});
total++; pass+=await test('lost update response recovers desired row', async()=>{const row=mk(key,oldVal);const s=makeEntity([row],'lost_update');const r=await saveGlobalSettingFromSnapshot({entity:s.entity,settingKey:key,settingValue:newVal,expectedId:row.id,expectedUpdatedDate:row.updated_date,label:'Backup settings'});if(r.status!=='recovered_after_update_error'||s.rows[0].setting_value.schedule!=='weekly')throw new Error(JSON.stringify(r));});
total++; pass+=await test('CAS loser converges when other session wrote same value', async()=>{const row=mk(key,oldVal);const s=makeEntity([row],'conflict_same');const r=await saveGlobalSettingFromSnapshot({entity:s.entity,settingKey:key,settingValue:newVal,expectedId:row.id,expectedUpdatedDate:row.updated_date,label:'Backup settings'});if(r.status!=='already_desired')throw new Error(JSON.stringify(r));});
total++; pass+=await test('CAS loser preserves different concurrent value', async()=>{const row=mk(key,oldVal);const s=makeEntity([row],'conflict_different');let err;try{await saveGlobalSettingFromSnapshot({entity:s.entity,settingKey:key,settingValue:newVal,expectedId:row.id,expectedUpdatedDate:row.updated_date,label:'Backup settings'});}catch(e){err=e}if(!err||s.rows[0].setting_value.value!=='other')throw new Error(err?.message||'missing conflict');});
total++; pass+=await test('impossible multi-update result fails closed', async()=>{const row=mk(key,oldVal);const s=makeEntity([row],'impossible_multi');let err;try{await saveGlobalSettingFromSnapshot({entity:s.entity,settingKey:key,settingValue:newVal,expectedId:row.id,expectedUpdatedDate:row.updated_date,label:'Backup settings'});}catch(e){err=e}if(!err||!/impossible/.test(err.message))throw new Error(err?.message||'missing impossible result');});

async function loadBackupHandler(client) {
  let source=await fs.readFile('./base44/functions/backupToGoogleDrive/entry.ts','utf8');
  source=source.replace(/^import .*$/gm,'');
  source=source.replace('Deno.serve(async (req) => {','globalThis.__backupHandler = async (req) => {');
  source=source.replace(/\n\}\);\s*$/,'\n};');
  const out=await transform(source,{loader:'ts',format:'esm',target:'es2022'});
  const factory=new Function('createClientFromRequest','XLSX','loadAllEntityRows','loadGlobalSettingSingleton','saveGlobalSettingFromSnapshot',`${out.code}; return globalThis.__backupHandler;`);
  return factory(()=>client,{},async()=>[],loadGlobalSettingSingleton,saveGlobalSettingFromSnapshot);
}
async function invokeBackup(client,body){const h=await loadBackupHandler(client);const res=await h(new Request('http://test.local',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));return {status:res.status,data:await res.json()};}
const connectorCounter=()=>{let calls=0;return {obj:{getConnection:async()=>{calls++;throw new Error('not connected')}},calls:()=>calls};};

total++; pass+=await test('unauthenticated interactive settings call blocked before Drive access',async()=>{const c=connectorCounter();const client={auth:{me:async()=>{throw new Error('no auth')}},asServiceRole:{connectors:c.obj}};const r=await invokeBackup(client,{action:'getSettings'});if(r.status!==403||c.calls()!==0)throw new Error(JSON.stringify(r));});
total++; pass+=await test('unauthenticated manual backup args blocked before Drive access',async()=>{const c=connectorCounter();const client={auth:{me:async()=>{throw new Error('no auth')}},asServiceRole:{connectors:c.obj}};const r=await invokeBackup(client,{dataTypes:['users']});if(r.status!==403||c.calls()!==0)throw new Error(JSON.stringify(r));});
total++; pass+=await test('non-admin interactive caller blocked',async()=>{const c=connectorCounter();const client={auth:{me:async()=>({role:'user'})},asServiceRole:{connectors:c.obj}};const r=await invokeBackup(client,{action:'getHistory'});if(r.status!==403||c.calls()!==0)throw new Error(JSON.stringify(r));});
total++; pass+=await test('empty unauthenticated scheduled payload still reaches Drive connection path',async()=>{const c=connectorCounter();const client={auth:{me:async()=>{throw new Error('no auth')}},asServiceRole:{connectors:c.obj}};const r=await invokeBackup(client,{});if(r.status!==400||c.calls()!==1||!/not connected/i.test(r.data.error||''))throw new Error(JSON.stringify(r));});

console.log(`RESULT ${pass}/${total}`); if(pass!==total)process.exit(1);
