const fs = require('fs');
let raw = '';
try { raw = fs.readFileSync('.tmp-remote/entry-check.json', 'utf8'); } catch {}
let content = '';
try { content = JSON.parse(raw).content || ''; } catch { content = raw; }
console.log('bytes:', content.length);
console.log('expanded default:', content.includes("size: 'expanded'"));
console.log('minimal bg:', content.includes("background_style: 'minimal'"));
console.log('old compact still:', content.includes("size: 'compact'"));
