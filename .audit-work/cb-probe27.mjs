import { login, call } from './cb-mm.mjs';
await login();
const r = await call('staffDataRead', { entity: 'Customer', query: { company_name: 'Minnillo Law Group Co, LPA' }, limit: 2 });
const c = r.items?.[0]; console.log('customer', c?.id, c?.company_name);
const h = await call('customerHistoryFeed', { action: 'get', customer_id: c.id });
console.log(h.totals, h.estimates.slice(0, 2), h.invoices.slice(0, 2), h.jobs.slice(0, 1));
