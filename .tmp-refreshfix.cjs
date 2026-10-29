const fs = require('fs');

// 1) Settings: carry saved prefs in the event detail.
let s = fs.readFileSync('src/components/timeclock/TimeTrackerSettings.jsx', 'utf8');
s = s.replace(
  'window.dispatchEvent(new Event("ccs:timeTrackerRefresh"));',
  'window.dispatchEvent(new CustomEvent("ccs:timeTrackerRefresh", { detail: { prefs: next } }));'
);
if (!s.includes('CustomEvent("ccs:timeTrackerRefresh"')) {
  // dispatch may appear inside save() with different formatting — locate any plain dispatch
  s = s.replace(
    'new Event("ccs:timeTrackerRefresh")',
    'new CustomEvent("ccs:timeTrackerRefresh", { detail: { prefs: next } })'
  );
}
fs.writeFileSync('src/components/timeclock/TimeTrackerSettings.jsx', s);
console.log('settings dispatched detail:', s.includes('detail: { prefs: next }'));

// 2) Tracker: apply event.detail.prefs optimistically, then force-refresh.
let t = fs.readFileSync('src/components/timeclock/TimeTracker.jsx', 'utf8');
const oldOnChange = 'const onChange = () => {';
const i = t.indexOf('const onChange = () =>');
if (i === -1) { console.log('onChange not found'); process.exit(1); }
// show surrounding context for a precise patch
console.log('--- context ---');
console.log(t.substring(i, i + 320));
