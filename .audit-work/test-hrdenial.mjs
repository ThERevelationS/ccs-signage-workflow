import { build } from 'esbuild';
const res = await build({ entryPoints: ['base44/functions/staffDataRead/entry.ts'], bundle: true, write: false, format: 'esm', external: ['npm:*', 'base44:*'], platform: 'neutral' });
let handler;
const mod = `const Deno={serve:(h)=>{globalThis.__h=h}};const createClientFromRequest=()=>({});const withEntityRateLimitRetry=(x)=>x;
${res.outputFiles[0].text}
`;
// stub imports by rewriting them away
const src = mod.replace(/^import .*$/gm, '');
new Function(src)();
