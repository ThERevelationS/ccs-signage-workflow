import { login, call } from './cb-mm.mjs';
await login();
const cid = (await call('staffDataRead', { entity: 'AllInOneEstimate', query: { estimate_number: 'EST-14766' }, limit: 1 })).items?.[0]?.customer_id;
console.log('cid', cid);
for (const t of [
  { query: { customer_id: cid }, fields: ['estimate_number', 'status'] },
  { query: { customer_id: cid }, fields: ['estimate_number'], sort: '-created_date' },
  { fields: ['estimate_number'] },
  { query: { customer_id: cid }, cursor: undefined, fields: ['id', 'estimate_number'] },
  { entity: 'WorkOrder', query: { customer_id: cid }, fields: ['title'] },
]) { try { const r = await call('staffDataRead', { entity: 'AllInOneEstimate', limit: 5, ...t }); console.log('OK', JSON.stringify(t).slice(0, 90), (r.items || []).length, JSON.stringify(r.items?.[0]).slice(0, 150)); } catch (e) { console.log('ERR', JSON.stringify(t).slice(0, 90), String(e.message).slice(0, 200)); } }
