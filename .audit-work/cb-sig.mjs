import { get } from './cb-http.mjs';
for (const p of process.argv.slice(2)) {
  const t = (await get(p)).text;
  const sigs = [...t.matchAll(/([A-Za-z0-9_]+):function\(([^)]*)\)\s*\{[^}]*?_invoke\(this\._get_path\(\),\s*'([A-Za-z0-9_]+)',(true|false)/g)].map((m) => `${m[3]}(${m[2].split(',').filter((x) => !/^(succeededCallback|failedCallback|userContext)$/.test(x)).join(',')}) ${m[4] === 'true' ? 'GET' : 'POST'}`);
  console.log('== ' + p + ' ' + sigs.length + '\n' + sigs.join('\n'));
}
