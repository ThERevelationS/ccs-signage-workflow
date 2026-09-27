import fs from 'node:fs';
const src=fs.readFileSync('src/components/sales/SalesPipelineSpreadsheet.jsx','utf8');
const checks=[
 ['selected row membership is checked', /filteredWorkOrders\.findIndex\(\(row\) => row\.id === selectedWorkOrder\.id\)/],
 ['matching selected row preserves queue index', /if \(currentIndex >= 0\) \{\s*selectedQueueIndexRef\.current = currentIndex;\s*return;/s],
 ['filtered selected row closes opportunity', /setSelectedWorkOrder\(null\)/],
 ['filtered selected row closes full details', /setShowFullWorkOrderDetails\(false\)/],
 ['filtered selected row closes status transition', /setStatusTransition\(null\)/],
 ['filtered selected row closes follow up', /setFollowUpCompletion\(null\)/],
 ['filtered selected row closes Est Inv dialog', /setCorbridgeDialog\(\{ open: false, workOrder: null \}\)/],
 ['filtered selected row clears Est Inv draft', /setCorbridgeDraft\(\{ invoiceNumber: "", link: "" \}\)/],
 ['filtered selected row clears Est Inv error', /setCorbridgeSaveError\(""\)/],
 ['filtered selected row clears navigation anchor', /selectedQueueIndexRef\.current = null;/],
 ['effect responds to filtered queue changes', /\}, \[selectedWorkOrder\?\.id, filteredWorkOrders\]\);/],
];
let pass=0; for(const [name,re] of checks){if(re.test(src)) pass++; else {console.error('FAIL:',name); process.exitCode=1;}}
console.log(`Sales filtered-detail isolation: ${pass}/${checks.length} PASS.`);
