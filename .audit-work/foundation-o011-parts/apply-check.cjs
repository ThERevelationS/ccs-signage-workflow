#!/usr/bin/env node
// O-011 transport helper — verify anchors + produce expected post-edit content.
// usage: node apply-check.cjs <remote-before-file> <edits.json> <expected-out-file>
const fs = require('fs');
const [,, beforePath, editsPath, outPath] = process.argv;
const before = fs.readFileSync(beforePath, 'utf8');
const edits = JSON.parse(fs.readFileSync(editsPath, 'utf8'));
let content = before;
const report = [];
edits.forEach((e, i) => {
  const count = content.split(e.old_text).length - 1;
  if (e.replace_all) {
    if (count === 0) { console.error(`edit ${i}: replace_all old_text NOT FOUND`); process.exit(2); }
    content = content.split(e.old_text).join(e.new_text);
    report.push({ i, mode: 'all', count });
  } else {
    if (count === 0) { console.error(`edit ${i}: old_text NOT FOUND`); process.exit(3); }
    if (count > 1) { console.error(`edit ${i}: old_text matched ${count}x (not unique)`); process.exit(4); }
    content = content.replace(e.old_text, e.new_text);
    report.push({ i, mode: 'once', count: 1 });
  }
});
fs.writeFileSync(outPath, content);
console.log(JSON.stringify({ ok: true, edits: report, outLen: content.length }));
