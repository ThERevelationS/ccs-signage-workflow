const fs = require("fs"), path = require("path");
let fixed = 0, files = 0;
function walk(d, o = []) {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    const s = fs.statSync(p);
    if (s.isDirectory()) { if (!/node_modules|\.git|dist/.test(n)) walk(p, o); }
    else if (/\.jsx$/.test(n)) o.push(p);
  }
  return o;
}
for (const f of walk("src")) {
  const src = fs.readFileSync(f, "utf8");
  const out = src.replace(/<button(\s+)(?![^>]*?type=)/gs, '<button type="button"$1');
  if (out !== src) {
    fs.writeFileSync(f, out);
    files++;
    fixed += (src.match(/<button\s+(?![^>]*?type=)/gs) || []).length;
  }
}
console.log("patched", fixed, "buttons in", files, "files");
