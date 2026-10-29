const fs = require('fs');
const p = '.tmp-wpo-test/src/components/timeclock/WorkPauseOverlay.jsx';
let t = fs.readFileSync(p, 'utf8');
const a = '  if (disabled || pauseStateScope !== scopeKey || !pauseState?.active_work_pause?.started_at || !showResumePrompt) return null;';
if (!t.includes(a)) throw new Error('anchor missing');
const dbg = '  console.log("GATE", JSON.stringify({ disabled, pauseStateScope, scopeKey, awp: pauseState && pauseState.active_work_pause && pauseState.active_work_pause.id, started: pauseState && pauseState.active_work_pause && pauseState.active_work_pause.started_at, showResumePrompt }));\n';
t = t.replace(a, dbg + a);
fs.writeFileSync(p, t);
console.log('instrumented');
