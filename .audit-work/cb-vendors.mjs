// Vendors: enumerate via autocomplete (all prefixes, incl. inactive), then archive each vendor page.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { get, post } from './cb-http.mjs';
import { textOf } from './cb-orderlib.mjs';
const DIR = 'imports/corebridge-2026-11-16/reference/'; mkdirSync(DIR + 'vendor-pages', { recursive: true });
const unD = (t) => { let j; try { j = JSON.parse(t); } catch { return t; } let d = j.d ?? j; if (typeof d === 'string') { try { d = JSON.parse(d); } catch {} } return d; };
const seen = new Map();
for (const p of [...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''), ' ', '-', '&', '.']) {
  const d = unD((await post('/AutoComplete.asmx/GetVendorSuggestions', { prefixText: p, includeInactive: true, limit: 5000 })).text);
  for (const v of Array.isArray(d) ? d : []) { const k = typeof v === 'string' ? v : JSON.stringify(v); seen.set(k, v); }
}
const vendors = [...seen.values()];
console.log('vendors', vendors.length, JSON.stringify(vendors.slice(0, 3)));
const ids = vendors.map((v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); const m = s.match(/"(?:Second|Id|VendorId|Value)"\s*:\s*"?(\d+)/) || s.match(/\|(\d+)$/) || s.match(/(\d+)/); return m ? m[1] : null; });
const pages = [];
const h = (await get('/PurchasingModule/Vendors/SearchVendors.aspx')).text;
const link = [...new Set(h.match(/[A-Za-z\/]*Vendor[A-Za-z]*\.aspx\?[A-Za-z]+=/g) || [])];
console.log('vendor links on search page', link);
writeFileSync(DIR + 'vendors.json', JSON.stringify({ count: vendors.length, data: vendors, ids }, null, 1));
