const fs = require('fs');
// Focus refreshes now arrive through the shared context version; the overlay's
// own invalidation signal is the work-pause-changed event, which forces the
// same signed status read the test exercises.
const oldText = "await act(async () => { listeners.get('focus')(); });";
const newText = "await act(async () => { listeners.get('ccs-timeclock-work-pause-changed')({ type: 'ccs-timeclock-work-pause-changed' }); });";
fs.writeFileSync('.tmp-edit-wpo3.json', JSON.stringify([
  { old_text: oldText, new_text: newText, replace_all: true },
]));
console.log('built');
