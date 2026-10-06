import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const names = ['historicalSalesOutcomeReconciliation.mjs', 'orderExportAccess.mjs', 'permittingAddressLocality.js', 'permittingAddressState.js', 'smartsheetOrderBackgroundPolicy.mjs', 'smartsheetOrderReceivedState.mjs', 'smartsheetSalesImportEligibility.mjs', 'timeClockPayrollMembershipEvidence.mjs'];
for (const name of names) assert.equal(await readFile('src/shared/' + name, 'utf8'), await readFile('base44/shared/' + name, 'utf8'), 'Frontend shared helper drift: ' + name);
console.log(names.length + ' frontend shared helpers match backend originals.');
