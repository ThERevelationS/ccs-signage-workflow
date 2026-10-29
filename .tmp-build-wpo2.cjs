const fs = require('fs');
const oldText1 = "const module = { exports: {} };";
const newText1 = [
"// Stable context stub: refresh identity churn would re-run the overlay's",
'// status effect and reset pause state on every render.',
"const statusContextStub = { isFallback: true, version: 0, refresh: async () => null, sharedStatus: null };",
"const module = { exports: {} };",
].join('\n');
const oldText2 = "    '@/components/timeclock/TimeClockStatusContext': { useTimeClockStatus: () => ({ isFallback: true, version: 0, refresh: async () => null, sharedStatus: null }) },";
const newText2 = "    '@/components/timeclock/TimeClockStatusContext': { useTimeClockStatus: () => statusContextStub },";
fs.writeFileSync('.tmp-edit-wpo2.json', JSON.stringify([
  { old_text: oldText1, new_text: newText1 },
  { old_text: oldText2, new_text: newText2 },
]));
console.log('built');
