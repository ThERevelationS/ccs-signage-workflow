import fs from 'fs'; import crypto from 'crypto';
const files = process.argv.slice(2);
const out = {};
for (const p of files) {
  try { out[p] = crypto.createHash('md5').update(fs.readFileSync(p,'utf8').replace(/\s/g,'')).digest('hex'); } catch {}
}
console.log(JSON.stringify(out));
