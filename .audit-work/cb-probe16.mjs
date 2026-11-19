import { post } from './cb-http.mjs';
for (const b of [{ prefixText: 'a', includeInactive: true, limit: 50 }, { prefixText: 's', includeInactive: false, limit: 50 }]) { const r = await post('/AutoComplete.asmx/GetVendorSuggestions', b); console.log(r.status, r.text.slice(0, 400)); }
const r2 = await post('/AutoComplete.asmx/GetAccountSuggestions', { prefixText: 'a', limit: 5 }); console.log('acct', r2.status, r2.text.slice(0, 300));
