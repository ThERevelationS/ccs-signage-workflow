const fs = require('fs');
const oldText1 = "const quickClock = readFileSync('src/components/timeclock/QuickClockSection.jsx', 'utf8');";
const newText1 = [
"const quickClock = readFileSync('src/components/timeclock/QuickClockSection.jsx', 'utf8');",
"const globalPause = readFileSync('src/components/timeclock/GlobalWorkPauseControl.jsx', 'utf8');",
].join('\n');
const oldText2 = 'assert.match(quickClock, /clearRequest\\("work_pause_start", email, requestId\\)/);';
const newText2 = [
'// Work Pause initiation lives in the toolbar pause menu; its acknowledgement',
'// path must still clear only the request ID it settled.',
'assert.match(globalPause, /paused \\? "work_pause_resume" : "work_pause_start"/);',
'assert.match(globalPause, /clearRequestId\\(action, email, requestId\\)/);',
].join('\n');
fs.writeFileSync('.tmp-edit-rf.json', JSON.stringify([
  { old_text: oldText1, new_text: newText1 },
  { old_text: oldText2, new_text: newText2 },
]));
console.log('built');
