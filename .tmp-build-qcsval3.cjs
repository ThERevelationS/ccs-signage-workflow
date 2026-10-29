const fs = require('fs');
const path = '.tmp-remote/v-qcs-val.mjs';
const lines = fs.readFileSync(path, 'utf8').split('\n');
const start = lines.findIndex((l) => l.includes('A delayed duplicate Work Pause acknowledgement cannot re-pause'));
const end = lines.findIndex((l, i) => i > start && l.includes('pauseFenceRenderer.unmount'));
if (start < 0 || end < 0) throw new Error('bounds not found ' + start + ' ' + end);
const oldText = lines.slice(start, end + 1).join('\n');
const newText = [
'// Work Pause initiation moved to the toolbar pause menu; the kiosk view only',
'// reflects authoritative pause state. A paused status arms the Resume guard',
'// and a verified resume acknowledgement releases it.',
'let pauseFenceRenderer;',
'await act(async () => {',
'  pauseFenceRenderer = TestRenderer.create(React.createElement(QuickClockSection, {',
"    allUsers:[first,second], employeeSessionToken:'pause-fence-session', employeeSessionUser:first,",
'  }));',
'});',
'const pauseFenceStatusIndex = calls.length - 1;',
'await act(async () => {',
'  calls[pauseFenceStatusIndex].resolve({ data: {',
"    success:true, user:first, status:'clocked_in',",
"    entry:{id:'pause-fence-shift',user_email:first.email,status:'clocked_in',clock_in:'2026-10-13T12:00:00.000Z'},",
"    break_status:'working', work_pause_status:'working', work_pause_allowed:true,",
'  }});',
'});',
'const pauseFenceOverlay = () => pauseFenceRenderer.root.findAll((node) =>',
"  typeof node.props?.onResumed === 'function')[0];",
'assert.ok(pauseFenceOverlay());',
"assert.equal(pauseFenceOverlay().props.disabled, true,",
"  'A working employee must not see an armed pause guard');",
"await act(async () => { events.get('focus')(); });",
'const pauseSeedIndex = calls.length - 1;',
"assert.equal(calls[pauseSeedIndex].payload.action,'status');",
'await act(async () => {',
'  calls[pauseSeedIndex].resolve({ data: {',
"    success:true, user:first, status:'clocked_in',",
"    entry:{id:'pause-fence-shift',user_email:first.email,status:'clocked_in',clock_in:'2026-10-13T12:00:00.000Z'},",
"    break_status:'working', work_pause_status:'paused',",
"    active_work_pause:{id:'wp-1',user_email:first.email,time_entry_id:'pause-fence-shift',status:'active'},",
"    work_pause_summary:{count:1,total_minutes:0}, work_pause_allowed:true,",
'  }});',
'});',
"assert.equal(pauseFenceOverlay().props.disabled, false,",
"  'An authoritative paused status must arm the Resume guard');",
'await act(async () => {',
"  pauseFenceOverlay().props.onResumed({ success:true, user:first, status:'clocked_in',",
"    work_pause_status:'working', work_pause_summary:{count:1,total_minutes:5},",
"    entry:{id:'pause-fence-shift',user_email:first.email}, work_pause_allowed:true });",
'});',
"assert.equal(pauseFenceOverlay().props.disabled, true,",
"  'A verified Resume acknowledgement must release the pause guard');",
"console.log('PASS paused status arms the Work Pause overlay and a verified resume releases it');",
'await act(async () => { pauseFenceRenderer.unmount(); });',
].join('\n');
fs.writeFileSync('.tmp-edit-qcsval3.json', JSON.stringify([{ old_text: oldText, new_text: newText }]));
console.log('built, old block lines ' + (end - start + 1));
