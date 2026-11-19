// Apply generated edits to remote baseline bytes and compare with candidate bytes.
// Usage: node verify-edits.cjs <remoteFile> <candidateFile> <editsJsonFile>
const fs = require("fs");
const [remotePath, candPath, editsPath] = process.argv.slice(2);
let content = fs.readFileSync(remotePath, "utf8");
const cand = fs.readFileSync(candPath, "utf8");
const edits = JSON.parse(fs.readFileSync(editsPath, "utf8"));
for (const [i, e] of edits.entries()) {
  const count = content.split(e.old_text).length - 1;
  if (count !== 1) { console.log(`FAIL edit ${i}: old_text occurs ${count}x`); process.exit(1); }
  content = content.replace(e.old_text, e.new_text);
}
if (content === cand) console.log("ROUNDTRIP-OK");
else {
  fs.writeFileSync("_mismatch.out", content);
  console.log("ROUNDTRIP-MISMATCH (wrote _mismatch.out)");
  process.exit(1);
}
