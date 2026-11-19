// Generate sandbox-edit ops from diff -U0 hunks between remote baseline and candidate.
// Usage: node gen-edits.cjs <remoteFile> <candidateFile>
// Emits JSON array of {old_text,new_text} with context padding for uniqueness.
// CRLF preserved: diff emits lines with their \r intact.
const fs = require("fs");
const { execSync } = require("child_process");

const [remotePath, candPath] = process.argv.slice(2);
const remote = fs.readFileSync(remotePath, "utf8");
const rLines = remote.split("\n"); // keep \r on ends

let diffOut;
try {
  diffOut = execSync(`diff -U0 "${remotePath}" "${candPath}"`, { encoding: "utf8" });
} catch (e) {
  diffOut = e.stdout; // diff exits 1 on differences
}

const hunks = [];
for (const line of diffOut.split("\n")) {
  const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
  if (m) {
    hunks.push({ rStart: +m[1], rLen: +(m[2] ?? 1), cStart: +m[3], cLen: +(m[4] ?? 1), del: [], add: [] });
  } else if (hunks.length && line.startsWith("-")) {
    hunks[hunks.length - 1].del.push(line.slice(1));
  } else if (hunks.length && line.startsWith("+")) {
    hunks[hunks.length - 1].add.push(line.slice(1));
  }
}

const edits = [];
for (const h of hunks) {
  // Semantics (verified):
  //  rLen>0: replace remote lines rStart..rStart+rLen-1 (1-based) with h.add.
  //  rLen=0: insert h.add AFTER remote line rStart (1-based). remote[rStart-1] precedes insertion.
  const ins0 = h.rStart - 1;                    // 0-based idx of first replaced line (or anchor line for pure-add)
  const repEnd0 = h.rLen > 0 ? ins0 + h.rLen - 1 : ins0; // 0-based idx of last line kept before insertion point
  let ctxBefore = 1, ctxAfter = 1, old_text = "", new_text = "", unique = false;
  for (let widen = 0; widen < 40; widen++) {
    const b = Math.max(0, ins0 - ctxBefore);
    const a = Math.min(rLines.length - 1, repEnd0 + ctxAfter);
    const oldSeg = rLines.slice(b, a + 1);
    const keptEnd = h.rLen > 0 ? repEnd0 : ins0; // last index included verbatim before add
    const newSeg = [...rLines.slice(b, ins0), ...(h.rLen > 0 ? [] : [rLines[ins0]]),
                    ...h.add, ...rLines.slice(repEnd0 + 1, a + 1)];
    old_text = oldSeg.join("\n");
    new_text = newSeg.join("\n");
    if (remote.split(old_text).length - 1 === 1) { unique = true; break; }
    ctxBefore += 1; ctxAfter += 1;
  }
  if (!unique) console.error(`WARN: old_text not unique for hunk @@ -${h.rStart},${h.rLen}`);
  edits.push({ old_text, new_text });
}
console.log(JSON.stringify(edits));
