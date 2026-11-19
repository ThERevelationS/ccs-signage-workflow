const fs = require("fs");
const files = [
  "src/components/timeclock/faceScanRuntime.js",
  "src/components/timeclock/FaceRecognition.jsx",
  "src/components/timeclock/QuickClockSection.jsx",
  "src/pages/AdminSettings.jsx",
  "scripts/validate-timeclock-face-scan.mjs",
];
const map = new Map([
  ["ΓöÇ", "-"],   // mojibake ─
  ["ΓÇö", "-"],   // mojibake —
  ["ΓÇô", "-"],   // mojibake –
  ["ΓåÆ", "->"],  // mojibake →
  ["ΓÇª", "..."], // mojibake …
  ["ΓÇó", "-"],   // mojibake •
  ["ΓÇ£", '"'], ["ΓÇ", '"'], ["ΓÇÖ", "'"], // mojibake quotes
  ["—", "-"], ["–", "-"], ["→", "->"], ["…", "..."], ["•", "-"],
  ["“", '"'], ["”", '"'], ["‘", "'"], ["’", "'"],
]);
for (const p of files) {
  let s = fs.readFileSync(p, "utf8");
  for (const [bad, good] of map) s = s.split(bad).join(good);
  const left = s.match(/[^\x00-\x7F]+/g);
  fs.writeFileSync(p, s);
  console.log(p, left ? "STILL HAS: " + JSON.stringify([...new Set(left)]) : "ascii-clean");
}
