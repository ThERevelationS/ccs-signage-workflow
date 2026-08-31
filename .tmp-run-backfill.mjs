import path from 'node:path';
import { createServer } from 'vite';

class MemoryStorage {
  constructor(){ this.map = new Map(); }
  getItem(k){ return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k,v){ this.map.set(k,String(v)); }
  removeItem(k){ this.map.delete(k); }
  clear(){ this.map.clear(); }
}
const location = { search:'', href:'http://localhost/', pathname:'/', hash:'', origin:'http://localhost' };
globalThis.window = {
  localStorage: new MemoryStorage(), location,
  history: { replaceState(){} },
  addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return true; },
};
globalThis.location = location;
globalThis.document = { title:'', visibilityState:'visible', addEventListener(){}, removeEventListener(){}, body:{}, documentElement:{} };
globalThis.navigator = { userAgent:'node', sendBeacon(){ return false; } };

const vite = await createServer({
  configFile: false,
  root: process.cwd(),
  appType: 'custom',
  logLevel: 'error',
  resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
  server: { middlewareMode: true, hmr: false },
});
try {
  const { base44 } = await vite.ssrLoadModule('/src/api/base44Client.js');
  const { ensureEstimateBuilderProducts } = await vite.ssrLoadModule('/src/components/estimator/builder/builderService.js');
  const estimate = await base44.entities.AllInOneEstimate.get('6a95bbea560340539f568b94');
  const before = await base44.entities.BuilderProduct.filter({ estimate_id: estimate.id });
  const converted = await ensureEstimateBuilderProducts(estimate);
  const after = await base44.entities.BuilderProduct.filter({ estimate_id: estimate.id });
  console.log(JSON.stringify({ before: before.length, after: after.length, lines: converted.line_items?.length || 0, allLinked: (converted.line_items || []).every(x => x.builder_product_id && x.line_id) }));
} finally {
  await vite.close();
}
