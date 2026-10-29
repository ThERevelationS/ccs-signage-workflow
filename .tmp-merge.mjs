// Applies a .tmp-edit-*.json payload to a remote file copy.
// usage: node .tmp-merge.mjs <remote-file> <payload.json> <out-file>
import { readFileSync, writeFileSync } from "node:fs";

const [remoteFile, payloadFile, outFile] = process.argv.slice(2);
let text = readFileSync(remoteFile, "utf8");
const edits = JSON.parse(readFileSync(payloadFile, "utf8"));
let applied = 0;
for (const [i, e] of edits.entries()) {
  const count = text.split(e.old_text).length - 1;
  if (e.replace_all) {
    if (count === 0) { console.error(`edit ${i + 1}: old_text not found`); process.exit(1); }
    text = text.split(e.old_text).join(e.new_text);
  } else {
    if (count !== 1) { console.error(`edit ${i + 1}: old_text found ${count} times`); process.exit(1); }
    text = text.replace(e.old_text, e.new_text);
  }
  applied += 1;
}
writeFileSync(outFile, text);
console.log(`merged ${applied} edit(s) -> ${outFile} (${text.length} bytes)`);
