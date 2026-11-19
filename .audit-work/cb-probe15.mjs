import { get, post } from './cb-http.mjs';
const h = (await get('/ManagementModule/Machines/MachinesManagement.aspx')).text;
const m = h.match(/<input[^>]*hfClientTag[^>]*>/); console.log(m && m[0]);
const ct = 'A8131DF0-BE44-47E4-A157-C5366252BD0B';
const r = await post('/ManagementModule/Machines/MachinesManagement.asmx/GetMachineCategoryPaneContents', { prodMachineCategoryName: 'All Machines', isLibraryProductionMachine: false, includeInactive: true, clientTag: ct });
console.log(r.status, r.text.length, r.text.slice(0, 600));
