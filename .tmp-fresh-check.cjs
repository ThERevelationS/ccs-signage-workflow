const fs = require('fs');
// Verify remote still matches the pre-edit state (old anchors present, new
// markers absent) — i.e., nobody else edited these files since the sync.
const qcs = JSON.parse(fs.readFileSync('.tmp-remote/qcs-fresh.json', 'utf8')).content || '';
console.log('QCS old reveal line:', qcs.includes('setShowClockOut(status?.work_pause_status !== "paused")'));
console.log('QCS has clockOutDismissedRef:', qcs.includes('clockOutDismissedRef'));
const css = JSON.parse(fs.readFileSync('.tmp-remote/css-fresh.json', 'utf8')).content || '';
console.log('CSS has mci-slider:', css.includes('mci-slider'));
console.log('CSS has punch-sheen:', css.includes('punch-sheen'));
const mci = JSON.parse(fs.readFileSync('.tmp-remote/mci-fresh.json', 'utf8')).content || '';
console.log('MCI has mci-slider:', mci.includes('mci-slider'), '| has datetime-local:', mci.includes('datetime-local'));
