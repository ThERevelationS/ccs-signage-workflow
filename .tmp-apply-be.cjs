const fs = require('fs');
const mer = fs.readFileSync('.tmp-merged/entry-timeclock.ts', 'utf8');
const mLines = mer.split('\n');
const cur = fs.readFileSync('base44/functions/timeClockAction/entry.ts', 'utf8').replace(/\r\n/g, '\n');
const EOL = '\n'; // remote code storage is LF even though the local checkout is CRLF
const crlf = (s) => s.replace(/\r?\n/g, EOL);

const edits = [];
const need = (name, s) => {
  const n = cur.split(s).length - 1;
  if (n !== 1) throw new Error(`${name} anchor count=${n}`);
};

// 1) tracker helper block: merged lines 1279..1380 (1-based)
const helpers = crlf(mLines.slice(1278, 1380).join('\n'));
const anchor1 = 'async function ensureState(stateEntity: any, target: any) {';
need('ensureState', anchor1);
edits.push({ old_text: anchor1, new_text: helpers + anchor1 });

// 2) prefsEntity declaration
const anchor2 = '    const ptoBalanceEntity = base44.asServiceRole.entities.UserPTOBalance;';
need('ptoBalanceEntity', anchor2);
edits.push({
  old_text: anchor2,
  new_text: anchor2 + EOL + '    const prefsEntity = base44.asServiceRole.entities.TimeClockEmployeePreference;',
});

// 3) tracker action block: merged 3446..3598, insert before status handler
const trackerBlock = crlf(mLines.slice(3445, 3598).join('\n'));
const anchor3 = "    if (action === 'status') {";
need('status-action', anchor3);
edits.push({ old_text: anchor3, new_text: trackerBlock + EOL + EOL + anchor3 });

// 4) work_pause_report_missed block: merged 6785..6899
const wprmBlock = crlf(mLines.slice(6784, 6899).join('\n'));
const anchor4 = "    if (action === 'time_off_request_create' || action === 'time_off_request_update') {";
need('timeoff-anchor', anchor4);
edits.push({ old_text: anchor4, new_text: wprmBlock + EOL + anchor4 });

// 5) recover_missed_clock_in handler — accept report_missed_clock_in, gate the 3PM rule
const old5 = crlf("    if (action === 'recover_missed_clock_in') {\n      const serverNow = new Date();\n      const companyMinutes = minutesOfDayInCompanyTime(serverNow.toISOString());\n      if (!Number.isInteger(companyMinutes) || companyMinutes < 15 * 60) {");
need('recover-cond', old5);
edits.push({
  old_text: old5,
  new_text: crlf("    if (action === 'recover_missed_clock_in' || action === 'report_missed_clock_in') {\n      const serverNow = new Date();\n      const companyMinutes = minutesOfDayInCompanyTime(serverNow.toISOString());\n      if (action === 'recover_missed_clock_in' && (!Number.isInteger(companyMinutes) || companyMinutes < 15 * 60)) {"),
});

// 6) resolution_note conditional
const old6 = "            resolution_note: 'Employee reconstructed a missing Clock In after the 3:00 PM late-day check; completed shift requires manager review.',";
need('resnote', old6);
edits.push({
  old_text: old6,
  new_text: crlf("            resolution_note: action === 'report_missed_clock_in'\n              ? 'Employee self-reported a missed Clock In from the Quick Clock arrival-time prompt; shift requires manager review.'\n              : 'Employee reconstructed a missing Clock In after the 3:00 PM late-day check; completed shift requires manager review.',"),
});

// 7) reason conditional
const old7 = "          reason: 'Employee reported a missing Clock In during the late-day pre-clockout review',";
need('reason', old7);
edits.push({
  old_text: old7,
  new_text: crlf("          reason: action === 'report_missed_clock_in'\n            ? 'Employee reported a missed Clock In from the Quick Clock arrival-time prompt'\n            : 'Employee reported a missing Clock In during the late-day pre-clockout review',"),
});

fs.writeFileSync('.tmp-edit-be-restore.json', JSON.stringify(edits));
console.log('built', edits.length, 'edits, eol=' + (EOL === '\r\n' ? 'CRLF' : 'LF'));
