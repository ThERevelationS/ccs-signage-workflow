const { spawnSync } = require('child_process');
const RUN = 'C:/Users/BrettHeinlein/AppData/Local/npm-cache/_npx/ebe492f4494510c0/node_modules/base44/bin/run.js';
const oldText = "    if (action === 'status') {\n      const unresolvedPunchReview = await unresolvedPunchReviewSummary({\n        entryEntity, correctionRequestEntity, punchExceptionEntity, userEmail: target.email,\n      });\n      const correctedShiftReview = await correctedShiftReviewSummary({\n        entryEntity, correctionRequestEntity, punchExceptionEntity, auditEntity, userEmail: target.email,\n      });";
const newText = "    if (action === 'status') {\n      const isManagerSession = actor.role === 'admin';\n      const unresolvedPunchReview = isManagerSession ? await unresolvedPunchReviewSummary({\n        entryEntity, correctionRequestEntity, punchExceptionEntity, userEmail: target.email,\n      }) : null;\n      const correctedShiftReview = isManagerSession ? await correctedShiftReviewSummary({\n        entryEntity, correctionRequestEntity, punchExceptionEntity, auditEntity, userEmail: target.email,\n      }) : null;";
const editsJson = JSON.stringify([{ old_text: oldText, new_text: newText }]);
const r = spawnSync(process.execPath, [RUN, 'sandbox', 'edit', 'base44/functions/timeClockAction/entry.ts', '--edits-json', editsJson, '--app-id', '68dfcc5e57bbbc35387da97c', '--branch', 'main', '--json'], { encoding: 'utf8', timeout: 120000 });
console.log(r.stdout.slice(0, 500));
if (r.stderr) console.log('ERR', r.stderr.slice(0, 300));
