const fs = require('fs');
const s = fs.readFileSync('.audit-work/foundation-reinforcement22/merge-result-foundationCalc.js', 'utf8');
const checks = [
  'deliveryCheck',
  'deliveryCheck.pricingUnavailable',
  'catalogIssues.push(...deliveryCheck.issues)',
  'calcSignageCabinetPricing',
  'signageCabinetCostTotal',
  'landscapeCalc',
  'landscapePricing',
  'total_signage_cabinet_cost',
  'total_landscape_cost',
  'signageCabinetPricing',
  'kind === "foundation" && issue.index',
];
let ok = true;
for (const c of checks) {
  const has = s.includes(c);
  if (!has) ok = false;
  console.log((has ? 'OK   ' : 'MISS ') + c);
}
console.log('trailing NL:', s.endsWith('\n'));
console.log('len:', s.length);
process.exit(ok ? 0 : 1);
