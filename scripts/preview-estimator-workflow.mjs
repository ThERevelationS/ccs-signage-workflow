import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(resolve(tmpdir(), 'ccs-estimator-preview-'));
const products = resolve(root, 'src/components/estimator/aio/EstimateProductsList.jsx');
const details = resolve(root, 'src/components/estimator/aio/Step1EstimateDetails.jsx');
const entry = resolve(temp, 'entry.jsx');
const stubs = {
  '@/api/base44Client': 'export const base44 = { entities: {}, functions: { invoke: async () => { throw new Error("Synthetic preview: no API calls"); } } };',
  '@/components/staff/staffEntities': 'export const staffEntities = { Customer: { get: async () => ({ notes: "Synthetic customer note shown on hover." }) } };',
  'react-router-dom': 'import React from "react"; export const Link = ({to,children,...props}) => <a href={to} {...props}>{children}</a>;',
  '@/components/estimator/moduleRegistry': 'export const ESTIMATOR_MODULES = []; export const getModuleLabel = () => "Custom";',
  '@/components/estimator/customerPricing': 'export const acceptedCustomerUnitPrice = () => 250;',
  '@/components/estimator/aioPricing': 'export const money = (value) => "$" + Number(value).toFixed(2);',
  '@/components/estimator/productionProductTypes': 'export const loadProductionProductTypes = async () => [];',
  './ProductRow': `import React from "react"; export default function ProductRow({line}) { return <div className="rounded border border-gray-200 bg-white p-4 pl-9"><strong>{line.client_product_name}</strong><p className="text-xs text-gray-500">Synthetic product - no business data</p></div>; }`,
  './CustomerSearchDialog': 'export default function CustomerSearchDialog() { return null; }',
  './NewCustomerDialog': 'export default function NewCustomerDialog() { return null; }',
};
writeFileSync(entry, `
import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import Products from ${JSON.stringify(products)};
import Details from ${JSON.stringify(details)};
import EstimateCard from ${JSON.stringify(resolve(root, 'src/components/estimator/EstimateCard.jsx'))};
function Preview() {
  const [fail, setFail] = useState(true);
  const [created, setCreated] = useState("");
  const [saveSiteAsLocation, setSaveSiteAsLocation] = useState(false);
  const [form, setForm] = useState({client_name: "Synthetic Customer", customer_id: "recent-a", site_address: "123 Synthetic Way", tax_group: "Standard", tax_percent: 7.25});
  const demoCustomers = [{id:"recent-a",company_name:"Synthetic Customer"},{id:"recent-b",company_name:"Synthetic Facilities"}];
  return <main className="mx-auto max-w-5xl space-y-5 p-4">
    <header><h1 className="text-xl font-bold">Estimator workflow verification</h1><p className="text-sm text-gray-600">Synthetic-only preview. No network API calls or real records.</p></header>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/>Simulate create failure</label>
    <Products lines={[{line_id:"one",client_product_name:"Synthetic channel letters"},{line_id:"two",client_product_name:"Synthetic vinyl panel"}]} rawTotal={500} onSplit={async ids=>{
      await new Promise(resolve=>setTimeout(resolve,800));
      if(fail) throw new Error("Synthetic create failed. Your selection is preserved.");
      setCreated("Created synthetic draft with "+ids.length+" product(s)");
      return true;
    }}/>
    <p role="status">{created}</p>
    <section><h2 className="mb-2 font-bold">Estimate card note preview</h2><EstimateCard estimate={{id:"synthetic-estimate",customer_id:"synthetic-customer",project_name:"Synthetic storefront sign",client_name:"Synthetic Customer",quote_total:500,line_items:[]}}/></section>
    <section className="rounded border border-gray-200 bg-white p-3"><h2 className="mb-3 font-bold">Estimate details</h2><Details form={form} patch={patch=>setForm({...form,...patch})} customers={demoCustomers} recentCustomers={demoCustomers} onCustomerSelected={customer=>setCreated("Selected "+customer.company_name)} saveSiteAsLocation={saveSiteAsLocation} onSaveSiteAsLocationChange={setSaveSiteAsLocation} taxGroups={[{id:"tax",name:"Standard",tax_percent:7.25}]} users={[]} termsOptions={["Net 30"]} salesCenters={["Synthetic"]}/></section>
  </main>;
}
createRoot(document.getElementById("root")).render(<Preview/>);
`);
await build({
  entryPoints: [entry], bundle: true, platform: 'browser', format: 'esm',
  outfile: resolve(temp, 'bundle.js'), jsx: 'automatic',
  nodePaths: [resolve(root, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{
    name: 'synthetic-estimator-preview',
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => {
        if (Object.hasOwn(stubs, args.path)) return { path: args.path, namespace: 'synthetic' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, (args) => ({
        contents: stubs[args.path], loader: 'jsx', resolveDir: root,
      }));
    },
  }],
});
writeFileSync(resolve(temp, 'input.css'), '@tailwind base;\n@tailwind components;\n@tailwind utilities;\nbody{background:#f8fafc}');
execFileSync(process.execPath, [
  require.resolve('tailwindcss/lib/cli.js'), '--input', resolve(temp, 'input.css'),
  '--output', resolve(temp, 'style.css'), '--content', [entry, products, details].join(','),
], { cwd: root, stdio: 'pipe' });
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Estimator Synthetic Verification</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>';
const assets = {
  '/': ['text/html', Buffer.from(html)],
  '/bundle.js': ['text/javascript', readFileSync(resolve(temp, 'bundle.js'))],
  '/style.css': ['text/css', readFileSync(resolve(temp, 'style.css'))],
};
const server = createServer((request, response) => {
  if (request.url === '/favicon.ico') {
    response.writeHead(204);
    response.end();
    return;
  }
  const asset = assets[request.url];
  response.writeHead(asset ? 200 : 404, { 'Content-Type': asset?.[0] || 'text/plain' });
  response.end(asset?.[1] || 'Not found');
});
process.on('exit', () => rmSync(temp, { recursive: true, force: true }));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
server.listen(4177, '127.0.0.1', () => console.log('Synthetic estimator preview: http://127.0.0.1:4177'));
