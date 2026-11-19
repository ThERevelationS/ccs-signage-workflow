const fs = require('fs');
const p = 'scripts/foundation-layout-browser-fixture.mjs';
let s = fs.readFileSync(p, 'utf8');
// 1) StrictMode
s = s.replace(
  "createRoot(document.getElementById('root')).render(React.createElement(App));",
  "createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode, null, React.createElement(App)));"
);
// 3) exact-origin guard
s = s.replace(/!r\.url\(\)\.startsWith\(ORIGIN\)/g, '(() => { try { return new URL(r.url()).origin !== ORIGIN; } catch { return true; } })()');
s = s.replace(/r\.request\(\)\.url\(\)\.startsWith\(ORIGIN\)/g, '(() => { try { return new URL(r.request().url()).origin === ORIGIN; } catch { return false; } })()');
// 2) flex-wrap CSS
s = s.replace(".overflow-auto{overflow:auto}", ".overflow-auto{overflow:auto}.flex-wrap{flex-wrap:wrap}.gap-2{gap:8px}");
fs.writeFileSync(p, s);
console.log('patched');
