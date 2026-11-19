import { login, read } from './cb-mm.mjs';
await login();
const r = await read({ entity: 'Customer', id: '6a958582ba45a19e9343fff7' }); const c = r.item || r.items?.[0] || r;
console.log(JSON.stringify({ n: c.company_name, tier: c.pricing_tier, st: c.customer_status, tax: c.tax_exempt, taxid: c.tax_id_number, email: c.contact_email, addr: c.billing_address_1, notes: c.notes }));
console.log('customers', (await read({ entity: 'Customer', count: true })).count);
