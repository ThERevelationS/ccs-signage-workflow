import { readFileSync } from 'node:fs';
const app = readFileSync('src/App.jsx', 'utf8');
const cfg = readFileSync('src/pages.config.js', 'utf8');
const nav = readFileSync('src/components/estimator/navConfig.js', 'utf8');
const rr = readFileSync('src/components/kit/recordRoutes.js', 'utf8');
const pal = readFileSync('src/components/CommandPalette.jsx', 'utf8');
const lay = readFileSync('src/Layout.jsx', 'utf8');

const registered = new Set();
const est = app.match(/const ESTIMATOR_PAGES = \{([\s\S]*?)\};/)[1];
for (const k of est.matchAll(/^\s*(\w+),?\s*$/gm)) registered.add(k[1]);
const fl = app.match(/const FLEET_PAGES = \{([\s\S]*?)\};/)[1];
for (const k of fl.matchAll(/^\s*(\w+),?\s*$/gm)) registered.add(k[1]);
for (const k of cfg.matchAll(/^\s*"?([A-Za-z_][\w]*)"?\s*:/gm)) registered.add(k[1]);
for (const m of app.matchAll(/path="\/(\w+)"/g)) registered.add(m[1]);
registered.add('');

const targets = new Map();
const addT = (raw, file) => {
  const path = raw.split('?')[0].replace(/^\//, '');
  if (path && !path.includes('${') && !path.includes('http')) {
    if (!targets.has(path)) targets.set(path, []);
    targets.get(path).push(file);
  }
};
for (const m of nav.matchAll(/to:\s*"([^"]+)"/g)) addT(m[1], 'navConfig');
for (const m of rr.matchAll(/path:\s*"\/([^"?]+)"/g)) addT('/' + m[1], 'recordRoutes');
for (const m of lay.matchAll(/(?:href|to)="\/([^"?]+)[^"]*"/g)) addT('/' + m[1], 'Layout');

const extra = pal.match(/EXTRA_PAGE_NAMES = \[([\s\S]*?)\]/)[1];
const missingPages = [...extra.matchAll(/"([A-Za-z][\w]*)"/g)].map(m => m[1]).filter(n => !registered.has(n));

const dead = [...targets.keys()].filter(t => !registered.has(t));
console.log('registered:', registered.size);
console.log('nav/record/layout targets:', targets.size);
console.log('dead targets:', JSON.stringify(dead));
console.log('palette names unregistered:', JSON.stringify(missingPages));
