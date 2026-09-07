import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = '/app';
const entry = path.join(root, 'src/components/estimator/products/productRemovalService.js');
const outfile = path.join(root, '.tmp-product-removal-pagination-bundle.mjs');

const virtual = {
  '@/api/base44Client': `export const base44 = globalThis.__mockBase44;`,
  '@/components/estimator/moduleRegistry': `export const getModule = () => null;`,
  '@/components/estimator/builder/builderMutationRecovery': `
    export const pendingBuilderMutation = (line) => line?.price_acceptance_pending || null;
    export const builderMutationHash = (value) => {
      const s = JSON.stringify(value || {}); let h = 2166136261;
      for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h,16777619); }
      return (h>>>0).toString(16);
    };
  `,
  '@/components/estimator/estimateMutationGuard': `export async function assertEstimateProductMutationAllowed(){ return true; }`,
};

await esbuild.build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  plugins: [{
    name: 'aliases',
    setup(build) {
      build.onResolve({ filter: /^@\// }, args => {
        if (virtual[args.path]) return { path: args.path, namespace: 'virtual' };
        const rel = args.path.slice(2);
        const candidates = [
          path.join(root, 'src', rel),
          path.join(root, 'src', `${rel}.js`),
          path.join(root, 'src', `${rel}.jsx`),
        ];
        const found = candidates.find(fs.existsSync);
        if (!found) throw new Error(`Unresolved alias ${args.path}`);
        return { path: found };
      });
      build.onLoad({ filter: /.*/, namespace: 'virtual' }, args => ({ contents: virtual[args.path], loader: 'js' }));
    }
  }]
});

const mod = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);

function clone(v){ return v == null ? v : structuredClone(v); }
function makeState({ inject = null } = {}) {
  const estimate = {
    id: 'e1', updated_date: 'est-v1', status: 'draft',
    line_items: [{ line_id:'l1', builder_product_id:'b1', project_id:'', module_key:'foundation', owned:false, client_product_name:'Large Product' }],
  };
  const state = {
    estimate,
    builder: { id:'b1', estimate_id:'e1', estimate_line_id:'l1', updated_date:'b-v1' },
    parts: new Map(Array.from({length:575}, (_,i)=>[`p${i}`, {id:`p${i}`, builder_product_id:'b1', updated_date:`p-v${i}`, sort_order:i}])),
    groups: new Map(Array.from({length:65}, (_,i)=>[`g${i}`, {id:`g${i}`, builder_product_id:'b1', updated_date:`g-v${i}`, sort_order:i}])),
    revisions: new Map(Array.from({length:60}, (_,i)=>[`r${i}`, {id:`r${i}`, builder_product_id:'b1', updated_date:`r-v${i}`, revision_number:i+1}])),
    deletes: [], markerWritten:false, inject,
  };
  return state;
}

function entityForMap(state, mapName, { singleBuilder=false } = {}) {
  return {
    async get(id){
      if (singleBuilder) return id === state.builder?.id ? clone(state.builder) : null;
      return clone(state[mapName].get(id) || null);
    },
    async filter(query, sort, limit=50, skip=0){
      let rows = Array.from(state[mapName].values()).filter(r => !query?.builder_product_id || r.builder_product_id === query.builder_product_id);
      const field = String(sort || '').replace(/^-/, '');
      if (field) rows.sort((a,b)=>(a[field]??0)-(b[field]??0));
      return clone(rows.slice(skip, skip + limit));
    },
    async delete(id){
      state.deletes.push(`${mapName}:${id}`);
      if (singleBuilder) { if (state.builder?.id === id) state.builder = null; return; }
      state[mapName].delete(id);
    }
  };
}

function install(state) {
  globalThis.__mockBase44 = {
    entities: {
      AllInOneEstimate: {
        async get(id){ return id === 'e1' ? clone(state.estimate) : null; },
        async update(id, patch){
          if (id !== 'e1') throw new Error('bad estimate id');
          state.estimate = { ...state.estimate, ...clone(patch), updated_date: state.markerWritten ? 'est-v3' : 'est-v2' };
          if (!state.markerWritten && patch.line_items?.some(x => x.price_acceptance_pending?.kind === 'builder_product_remove')) {
            state.markerWritten = true;
            if (state.inject === 'new-late-part') {
              state.parts.set('p-new', { id:'p-new', builder_product_id:'b1', updated_date:'p-new-v1', sort_order:9999 });
            }
            if (state.inject === 'edit-late-part') {
              const row = state.parts.get('p574');
              state.parts.set('p574', { ...row, updated_date:'p574-concurrent' });
            }
          }
          return clone(state.estimate);
        }
      },
      BuilderProduct: entityForMap(state, 'builder', { singleBuilder:true }),
      BuilderPart: entityForMap(state, 'parts'),
      BuilderPartGroup: entityForMap(state, 'groups'),
      BuilderPriceRevision: entityForMap(state, 'revisions'),
    }
  };
}

let passed = 0;
function ok(cond, label){ if(!cond) throw new Error(`FAIL: ${label}`); console.log(`PASS ${label}`); passed++; }

// Normal removal: 575 Parts forces a second 500-row page.
{
  const state = makeState(); install(state);
  const result = await mod.removeProductFromEstimate({ estimateId:'e1', line: clone(state.estimate.line_items[0]), expectedEstimateUpdatedAt:'est-v1' });
  ok(result.removed === true, 'normal large Product removal completes');
  ok(state.parts.size === 0, 'all 575 Parts are deleted including page 2');
  ok(state.groups.size === 0, 'all 65 Groups are deleted');
  ok(state.revisions.size === 0, 'all 60 revisions are deleted');
  ok(state.builder === null, 'Builder Product is deleted after children');
  ok(state.estimate.line_items.length === 0, 'Estimate line is removed last');
}

// A new child after the marker must be discovered even though it is beyond the old 50-row boundary.
{
  const state = makeState({ inject:'new-late-part' }); install(state);
  let err = null;
  try { await mod.removeProductFromEstimate({ estimateId:'e1', line: clone(state.estimate.line_items[0]), expectedEstimateUpdatedAt:'est-v1' }); } catch (e) { err = e; }
  ok(/new Builder Part appeared/i.test(String(err?.message)), 'new later-page Part blocks recovery');
  ok(state.deletes.length === 0, 'new later-page Part blocks before any delete');
  ok(state.parts.size === 576, 'no child is deleted on new-child conflict');
}

// A concurrent edit to the final Part must also block before any delete.
{
  const state = makeState({ inject:'edit-late-part' }); install(state);
  let err = null;
  try { await mod.removeProductFromEstimate({ estimateId:'e1', line: clone(state.estimate.line_items[0]), expectedEstimateUpdatedAt:'est-v1' }); } catch (e) { err = e; }
  ok(/Builder Part changed while Product removal was pending/i.test(String(err?.message)), 'edited page-2 Part blocks recovery');
  ok(state.deletes.length === 0, 'edited page-2 Part blocks before any delete');
  ok(state.parts.size === 575, 'no child is deleted on later-page edit conflict');
}

console.log(`PRODUCT REMOVAL PAGINATION: ${passed} passed`);
fs.rmSync(outfile, { force:true });
fs.rmSync(path.join(root, '.tmp-product-removal-pagination-test.mjs'), { force:true });
