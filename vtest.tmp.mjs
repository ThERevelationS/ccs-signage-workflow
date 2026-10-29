import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
const root = process.cwd();
const scratch = realpathSync(await mkdtemp(path.join(tmpdir(), 'vtest-')));
await writeFile(path.join(scratch, 'mock.js'), 'export const base44={};export const useAuth=()=>({});');
const { symlinkSync } = await import('node:fs');
symlinkSync(path.join(root, 'node_modules'), path.join(scratch, 'node_modules'), 'junction');
const vite = await createServer({ configFile: false, root: scratch, plugins: [react()],
  resolve: { modules: [path.join(root, 'node_modules'), 'node_modules'], alias: [
    { find: '@/api/base44Client', replacement: path.join(scratch, 'mock.js') },
    { find: '@/components/auth/EmailGate', replacement: path.join(scratch, 'mock.js') },
    { find: /^@\//, replacement: path.join(root, 'src') + '/' },
    { find: /^react\/jsx-dev-runtime$/, replacement: path.join(root, 'node_modules/react/jsx-dev-runtime.js') },
  ]},
  server: { fs: { allow: [root, scratch] } }, logLevel: 'info' });
const fileUrl = '/@fs/' + path.join(root, 'src/components/timeclock/TimeClockAdmin.jsx').split(path.sep).join('/');
console.log('transforming', fileUrl);
try {
  const res = await vite.transformRequest(fileUrl);
  console.log('transform OK, length', res && res.code && res.code.length);
} catch (e) {
  console.log('TRANSFORM ERROR:', (e.message || String(e)).slice(0, 3000));
}
await vite.close();
