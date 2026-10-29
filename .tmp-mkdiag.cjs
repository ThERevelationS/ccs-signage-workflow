const fs = require('fs');
let t = fs.readFileSync('scripts/test-timeclock-subtabs-browser.mjs', 'utf8');
t = t.replace(
  'const bodyText = await page.locator("body").innerText();',
  'const bodyText = await page.locator("body").innerText();\n    if (pageErrors.length) console.error(`${label} pageerrors:`, pageErrors);'
);
t = t.replace(
  'for (const [tab, label] of [["reports", "Reports"], ["pto", "PTO"], ["overtime", "Overtime"]])',
  'for (const [tab, label] of [["reports", "Reports"]])'
);
fs.writeFileSync('.tmp-subtabs-diag.mjs', t);
console.log('written');
