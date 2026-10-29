const fs = require('fs');
const edits = [{
  old_text: '    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">',
  new_text: '    <div className={`rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3 glow-card ${activeLabor ? "glow-info" : ""}`}>',
}];
fs.writeFileSync('.tmp-cwc.json', JSON.stringify(edits));
console.log('ok');
