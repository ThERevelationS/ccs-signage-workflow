import { readFileSync, writeFileSync } from "node:fs";
const [remoteJson, localFile, rawOut] = process.argv.slice(2);
const v = JSON.parse(readFileSync(remoteJson, "utf8"));
const t = v.content || "";
const merged = readFileSync(localFile, "utf8");
if (rawOut) writeFileSync(rawOut, t);
const tl = t.split("\n"), ml = merged.split("\n");
console.log("remote lines:", tl.length, "local lines:", ml.length);
let diffs = [], r = 0, m = 0;
while (r < tl.length && m < ml.length && diffs.length < 80) {
  if (tl[r] === ml[m]) { r++; m++; continue; }
  let ra = -1, mb = -1;
  for (let k = 1; k < 80 && ra < 0; k++) {
    if (tl[r + k] === ml[m]) ra = k;
    if (ml[m + k] === tl[r]) mb = k;
  }
  if (ra > 0 && (mb < 0 || ra <= mb)) {
    for (let i = 0; i < ra; i++) diffs.push(["R" + (r + i + 1), tl[r + i].substring(0, 110)]);
    r += ra;
  } else if (mb > 0) {
    for (let i = 0; i < mb; i++) diffs.push(["M" + (m + i + 1), ml[m + i].substring(0, 110)]);
    m += mb;
  } else {
    diffs.push(["?r" + (r + 1) + "/m" + (m + 1), (tl[r] || "").substring(0, 80) + " || " + (ml[m] || "").substring(0, 80)]);
    r++; m++;
  }
}
if (r < tl.length) diffs.push(["TAIL-R+" + (tl.length - r), tl[r]?.substring(0, 100) || ""]);
if (m < ml.length) diffs.push(["TAIL-M+" + (ml.length - m), ml[m]?.substring(0, 100) || ""]);
console.log("diff lines:", diffs.length);
for (const d of diffs.slice(0, 70)) console.log(d[0], d[1]);
