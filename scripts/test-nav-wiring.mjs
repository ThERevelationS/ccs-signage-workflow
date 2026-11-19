import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-nav-config.mjs');
buildSync({ entryPoints: [resolve(here, '../src/components/estimator/navConfig.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { ESTIMATOR_TABS, ESTIMATOR_RIGHT_TABS = [] } = await import(pathToFileURL(out).href);

// Collect registered routes: explicit <Route path="..."> plus keys of *_PAGES maps.
const app = readFileSync(resolve(here, '../src/App.jsx'), 'utf8');
const routes = new Set();
for (const m of app.matchAll(/path="([^"]+)"/g)) routes.add(m[1]);
for (const m of app.matchAll(/const\s+(\w+_PAGES)\s*=\s*\{([\s\S]*?)\};/g)) {
  for (const name of m[2].matchAll(/^\s*(\w+),?\s*$/gm)) routes.add(`/${name[1]}`);
}
// Base44's Pages map auto-registers every src/pages/*.jsx file by basename.
for (const f of readdirSync(resolve(here, '../src/pages'))) {
  if (f.endsWith('.jsx')) routes.add(`/${f.replace(/\.jsx$/, '')}`);
}

const base = (to) => `/${String(to || '').replace(/^\/+/, '').split(/[?#]/)[0]}`;
const links = [];
const collect = (items = []) => items.forEach((it) => { if (it?.to) links.push(it.to); });
for (const tab of [...ESTIMATOR_TABS, ...ESTIMATOR_RIGHT_TABS]) {
  if (tab?.to) links.push(tab.to);
  collect(tab?.items);
}

// #487 — also cover the EstimatorTools hub LINKS array (static links in the
// tools page itself, incl. admin surfaces like Pricing Admin, export and the
// audit-log deep link). Query strings are stripped by base().
const toolsSrc = readFileSync(resolve(here, '../src/pages/EstimatorTools.jsx'), 'utf8');
const toolsBlock = toolsSrc.match(/const\s+LINKS\s*=\s*\[([\s\S]*?)\];/);
assert.ok(toolsBlock, 'EstimatorTools LINKS array found');
const toolLinks = [...toolsBlock[1].matchAll(/to:\s*"([^"]+)"/g)].map((m) => m[1]);
assert.ok(toolLinks.length >= 6, `expected hub links, got ${toolLinks.length}`);
const brokenToolLinks = toolLinks.filter((to) => !routes.has(base(to)));
assert.deepEqual(brokenToolLinks, [], `dead EstimatorTools hub links: ${brokenToolLinks.join(', ')}`);

const broken = links.filter((to) => !routes.has(base(to)));
assert.equal(ESTIMATOR_TABS.length >= 5, true, 'estimator tabs registered');
assert.ok(links.length > 15, `expected a real nav surface, got ${links.length} links`);
assert.deepEqual(broken, [], `dead nav links: ${broken.join(', ')}`);

// Route-name sanity: every *_PAGES key should have a matching src/pages file
// import — either a static `import Name ...` or a lazy `import('./pages/Name')`.
const missingImport = [...app.matchAll(/const\s+\w+_PAGES\s*=\s*\{([\s\S]*?)\};/g)]
  .flatMap((m) => [...m[1].matchAll(/^\s*(\w+),?\s*$/gm)].map((n) => n[1]))
  .filter((name) => !new RegExp(`import\\s+${name}\\b`).test(app)
    && !new RegExp(`import\\(['"\`]\\./pages/${name}['"\`]\\)`).test(app));
assert.deepEqual(missingImport, [], `page map keys without imports: ${missingImport.join(', ')}`);

console.log(`PASS nav wiring (${links.length} links → ${routes.size} routes)`);
