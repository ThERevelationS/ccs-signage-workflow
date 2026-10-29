const fs = require('fs');
const t = fs.readFileSync('.tmp-merged/entry-timeclock.ts', 'utf8');
const lines = t.split('\n');
// helper block: 1279 .. end of trackerPaidMinutesForEntry — find next top-level
// 'function ' or 'const ' that isn't tracker-related after line 1360
let helperEnd = -1;
for (let i = 1360; i < lines.length; i++) {
  const l = lines[i];
  if (/^(async function|function|const|\/\/)/.test(l) && !/tracker|Tracker|TRACKER/.test(l)) {
    // find the actual start of the next declaration (walk back over blanks/comments?)
    helperEnd = i;
    break;
  }
}
console.log('helper block 1279..' + helperEnd + ' — lines around boundary:');
console.log(lines.slice(helperEnd - 6, helperEnd + 3).map((l, i) => (helperEnd - 6 + i + 1) + ': ' + l).join('\n'));
console.log('--- helper head context (1270-1280) ---');
console.log(lines.slice(1269, 1280).map((l, i) => (1270 + i) + ': ' + l).join('\n'));
console.log('--- tracker action block tail (3590-3600) ---');
console.log(lines.slice(3589, 3600).map((l, i) => (3590 + i) + ': ' + l).join('\n'));
console.log('--- wprm tail (6890-6902) ---');
console.log(lines.slice(6889, 6902).map((l, i) => (6890 + i) + ': ' + l).join('\n'));
