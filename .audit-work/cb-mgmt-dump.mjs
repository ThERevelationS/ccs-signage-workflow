// Read-only archive of CoreBridge catalog + settings: inventory, modifiers, machines, parts (raw pages),
// pricing templates, and every management/settings page (raw HTML gz + text).
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { get, post } from './cb-http.mjs';
import { scrub, textOf } from './cb-orderlib.mjs';
const DIR = 'imports/corebridge-2026-11-16/catalog/'; mkdirSync(DIR + 'pages', { recursive: true });
const unD = (t) => { let j; try { j = JSON.parse(t); } catch { return { raw: t.slice(0, 500) }; } let d = j.d ?? j; if (typeof d === 'string') { try { d = JSON.parse(d); } catch {} } return d; };
const save = (k, v) => { writeFileSync(DIR + k + '.json', JSON.stringify(v, null, 1)); console.log(k, JSON.stringify(v).length); };
const savePage = async (name, path) => { const f = DIR + 'pages/' + name + '.html.gz'; if (existsSync(f)) return null; const r = await get(path); writeFileSync(f, gzipSync(r.text)); return { name, path, status: r.status, title: ((r.text.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim(), text: textOf(r.text).slice(0, 200000) }; };
const which = process.argv.slice(2); const want = (k) => !which.length || which.includes(k);
if (want('inventory')) {
  const all = []; let total;
  for (let start = 0; ; start += 500) {
    const d = unD((await post('/PurchasingModule/Inventory/InventoryService.asmx/GetInventoryItems', { sEcho: 1, iDisplayStart: start, iDisplayLength: 500, iSortCol_0: 1, sSortDir_0: 'asc', pageIndex: Math.floor(start / 500) + 1, category: '0', status: 0, search: '', partTypeId: '0', hideNotKeptInStock: false })).text);
    const rows = d?.aaData || []; total = d?.iTotalRecords; all.push(...rows); if (!rows.length || all.length >= total) break;
  }
  save('inventory', { total, count: all.length, data: scrub(all, true) });
}
if (want('modifiers')) {
  const cats = unD((await post('/SalesModule/Orders/Order.asmx/GetModifierCategories', {})).text);
  const act = unD((await post('/SalesModule/Orders/Order.asmx/SearchModifiers', { showDeactivatedOnly: false })).text);
  const deact = unD((await post('/SalesModule/Orders/Order.asmx/SearchModifiers', { showDeactivatedOnly: true })).text);
  const list = [...(act?.SearchResults || []).map((x) => ({ ...x, active: true })), ...(deact?.SearchResults || []).map((x) => ({ ...x, active: false }))];
  const pages = [];
  for (const m of list) pages.push(await savePage('modifier-' + m.Id, `/ManagementModule/Modifiers/ManageEditModifier.aspx?ModifierId=${m.Id}`));
  save('modifiers', { categories: cats, count: list.length, data: list, pages: pages.filter(Boolean).map(({ text, ...p }) => ({ ...p, text_len: text.length })) });
  save('modifier-pages-text', pages.filter(Boolean));
}
if (want('machines')) {
  const ct = 'A8131DF0-BE44-47E4-A157-C5366252BD0B';
  const html = [];
  for (const inc of [false, true]) html.push(unD((await post('/ManagementModule/Machines/MachinesManagement.asmx/GetMachineCategoryPaneContents', { prodMachineCategoryName: 'All Machines', isLibraryProductionMachine: false, includeInactive: inc, clientTag: ct })).text));
  const ids = [...new Set(html.join(' ').match(/machineId_(\d+)/g) || [])].map((s) => s.split('_')[1]);
  const hrefs = [...new Set(html.join(' ').match(/MachinesManagement\.aspx\?[^"'\\]+/g) || [])];
  const pages = []; for (const h of hrefs) pages.push(await savePage('machine-' + h.replace(/[^0-9]/g, ''), '/ManagementModule/Machines/' + h.replace(/&amp;/g, '&')));
  save('machines', { ids, hrefs, pane_text: html.map(textOf), pages: pages.filter(Boolean) });
}
if (want('parts_raw')) {
  const { readFileSync } = await import('node:fs');
  const parts = JSON.parse(readFileSync('imports/corebridge-2026-11-16/part-tier-charts.json', 'utf8')).parts;
  let n = 0; for (const p of parts) { await savePage('part-' + p.part_id, `/ManagementModule/Parts/ManageEditPart.aspx?PartId=${p.part_id}`); if (++n % 100 === 0) console.log('parts', n); }
  for (let id = 1; id <= 60; id++) await savePage('pricing-template-' + id, `/ManagementModule/Parts/ManageEditPricingTemplate.aspx?PricingTemplateId=${id}`);
}
if (want('settings')) {
  const P = ['/ManagementModule/GlobalSettings/SystemSettings.aspx', '/ManagementModule/GlobalSettings/PricingSettings.aspx', '/ManagementModule/GlobalSettings/OrderingRulesSettings.aspx', '/ManagementModule/GlobalSettings/DomainSettings.aspx', '/ManagementModule/GlobalSettings/AccountingSettings.aspx', '/ManagementModule/GlobalSettings/ProductStatusSettings.aspx', '/ManagementModule/GlobalSettings/ProductionSettings.aspx', '/ManagementModule/GlobalSettings/Services.aspx', '/ManagementModule/Locations/ManageLocations.aspx', '/ManagementModule/Locations/ManageTaxGroups.aspx', '/ManagementModule/Locations/MultiLocation.aspx', '/ManagementModule/Goals/ManageGoals.aspx', '/ManagementModule/Users/Commissions.aspx', '/ManagementModule/Users/TimeTracking.aspx', '/ManagementModule/Users/ManageUsers.aspx', '/ManagementModule/Overrides/Overrides.aspx', '/ManagementModule/Customers/Customers.aspx', '/ManagementModule/Customers/CustomerModule.aspx', '/ManagementModule/Customers/Statements.aspx', '/ManagementModule/Customers/Tracking.aspx', '/ManagementModule/Customers/CRM.aspx', '/ManagementModule/Vendors/Communication.aspx', '/ManagementModule/Vendors/Statements.aspx', '/ManagementModule/Vendors/Tracking.aspx', '/ManagementModule/Parts/PricingTemplateManagement.aspx', '/AccountingModule/ManageAccountsPage.aspx', '/AccountingModule/Reconciliation.aspx', '/PurchasingModule/Vendors/SearchVendors.aspx', '/SalesModule/MyProducts/PredefinedProducts.aspx'];
  const out = []; for (const p of P) out.push(await savePage('settings' + p.replace(/[\/.]/g, '_'), p));
  save('settings-pages-text', out.filter(Boolean));
}
