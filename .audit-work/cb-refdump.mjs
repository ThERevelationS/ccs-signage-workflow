// Read-only dump of CoreBridge reference/list data via its own "Get*" web methods.
import { writeFileSync, mkdirSync } from 'node:fs';
import { post } from './cb-http.mjs';
import { scrub } from './cb-orderlib.mjs';
const DIR = 'imports/corebridge-2026-11-16/reference/'; mkdirSync(DIR, { recursive: true });
const unD = (t) => { let j; try { j = JSON.parse(t); } catch { return { raw: t.slice(0, 2000) }; } let d = j.d ?? j; if (typeof d === 'string') { try { d = JSON.parse(d); } catch {} } return d; };
async function call(path, body = {}) { const r = await post(path, body); return { status: r.status, data: scrub(unD(r.text), true) }; }
const dt = (len, start = 0, extra = {}) => ({ pageIndex: 1, iDisplayStart: start, iDisplayLength: len, sEcho: 1, sColumns: '', iColumns: 0, iSortCol_0: 0, sSortDir_0: 'asc', ...extra });
const out = {}; const log = (k, v) => { out[k] = v; const s = JSON.stringify(v); console.log(k, v.status, s.length); writeFileSync(DIR + k + '.json', JSON.stringify(v, null, 1)); };
const which = process.argv.slice(2);
const want = (k) => !which.length || which.includes(k);
if (want('users')) log('users', await call('/ManagementModule/Users/Users.asmx/GetUsers'));
if (want('time_activities')) log('time_activities', await call('/ManagementModule/Users/Users.asmx/GetActivity'));
if (want('timeclock_setting')) log('timeclock_setting', await call('/ManagementModule/Users/Users.asmx/GetTimeClockSetting'));
if (want('crm_events')) log('crm_events', await call('/SalesModule/Contacts/Contact.asmx/GetAllContactEvents'));
if (want('crm_contacts')) {
  const all = []; let total = null;
  for (let start = 0; ; start += 500) {
    const r = await call('/SalesModule/Contacts/Contact.asmx/GetAllContacts', { txSearch: '', sSearch_1: '', sSearch_2: '', sSearch_6: '', sSearch_7: '', sSearch_8: '', sSearch_9: '', pageIndex: Math.floor(start / 500) + 1, iDisplayStart: start, iDisplayLength: 500, includeInactiveCompanies: true, includeInactiveContacts: true, sEcho: 1, sColumns: '', iColumns: 0, iSortCol_0: 0, sSortDir_0: 'asc' });
    const rows = r.data?.aaData || []; total = r.data?.iTotalRecords ?? total; all.push(...rows);
    if (!rows.length || all.length >= (total || 0)) break;
  }
  log('crm_contacts', { status: 200, total, count: all.length, data: all });
}
if (want('locations')) log('locations', await call('/ManagementModule/Locations/EditViewLocation.asmx/GetActiveLocations'));
if (want('tax_groups')) log('tax_groups', await call('/ManagementModule/Locations/EditViewLocation.asmx/GetTaxgroups', { locationId: 2 }));
if (want('tax_agencies')) log('tax_agencies', await call('/ManagementModule/Locations/EditViewLocation.asmx/GetTaxAgencyList', { search: '', includeInactive: true, pageIndex: 1, iDisplayLength: 1000, sEcho: 1, iDisplayStart: 0, iSortCol_0: 0, sSortDir_0: 'asc' }));
if (want('part_categories')) log('part_categories', await call('/SalesModule/Orders/OrderEntry.asmx/GetPartCategories'));
if (want('product_categories')) {
  const pc = await call('/SalesModule/Orders/OrderEntry.asmx/GetProductCategories'); log('product_categories', pc);
  const cats = Array.isArray(pc.data) ? pc.data : (pc.data?.ProductCategories || pc.data?.Data || []);
  const qp = [];
  for (const c of cats) { const id = c.Id ?? c.Value ?? c.ProductCategoryId; const name = c.Name ?? c.Text; qp.push({ category: { id, name }, result: await call('/SalesModule/Orders/OrderEntry.asmx/GetPredefinedProducts', { productCategoryId: id, productCategoryText: name }) }); }
  log('quick_products', { status: 200, data: qp });
}
if (want('po_statuses')) log('po_statuses', await call('/PurchasingModule/PurchaseOrders/PurchaseOrderService.asmx/GetPurchaseOrderStatus', { isTenant: true }));
if (want('purchase_orders')) {
  const all = []; let total = null;
  for (let start = 0; ; start += 500) {
    const r = await call('/PurchasingModule/PurchaseOrders/PurchaseOrderService.asmx/GetPurchaseOrders', { accountId: 0, txSearch: '', ...dt(500, start), pageIndex: Math.floor(start / 500) + 1, dllStatus: '' });
    const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data; const rows = d?.aaData || []; total = d?.iTotalRecords ?? total; all.push(...rows);
    if (!rows.length || all.length >= (total || 0)) { if (!rows.length && !all.length) all.push({ first_response: d }); break; }
  }
  log('purchase_orders', { status: 200, total, count: all.length, data: all });
}
