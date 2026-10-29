const fs = require('fs');
const files = JSON.parse(fs.readFileSync('.tmp-remote-manifest.json', 'utf8'));
const e = require('esbuild');
for (const f of files) {
  try {
    const raw = fs.readFileSync('.tmp-remote/' + f.out, 'utf8');
    const content = JSON.parse(raw).content || '';
    const loader = f.jsx ? 'jsx' : 'ts';
    e.transformSync(content, { loader, jsx: 'automatic', target: 'es2022' });
    console.log('OK    ' + f.path + ' (' + content.length + 'b)');
  } catch (err) {
    console.log('BROKEN ' + f.path + ' :: ' + String(err.message || err).split('\n')[0]);
  }
}
