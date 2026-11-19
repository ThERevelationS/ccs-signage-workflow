// Pull remaining tree dep files fresh for drift check.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const APP = '68dfcc5e57bbbc35387da97c';
const BRANCH = 'main';
const OUT = path.join(__dirname, 'remote-fresh');
fs.mkdirSync(OUT, { recursive: true });

const FILES = [
  'src/api/base44Client.js',
  'src/components/auth/EmailGate.jsx',
  'src/components/estimator/brick/brickCalc.js',
  'src/components/estimator/builder/builderEntityPersistence.js',
  'src/components/estimator/builder/builderMutationRecovery.js',
  'src/components/estimator/builder/builderPartGroupPersistence.js',
  'src/components/estimator/builder/builderPartPersistence.js',
  'src/components/estimator/builder/builderProductPersistence.js',
  'src/components/estimator/builder/builderService.js',
  'src/components/estimator/builder/sourceProjectPersistence.js',
  'src/components/estimator/customerPricing.js',
  'src/components/estimator/estimateMutationGuard.js',
  'src/components/estimator/estimatePersistence.js',
  'src/components/estimator/idempotentEntityCreate.js',
  'src/components/estimator/loadAllEntityRows.js',
  'src/components/estimator/parts/partState.js',
  'src/components/masterInventory/foundationFieldSchema.js',
  'src/components/masterInventory/inventoryNormalization.js',
  'src/components/signMaintenance/maintenanceCalculator.js',
  'src/components/staff/staffEntities.js',
  'src/components/vinylEstimator/vinylNestingCalculator.js',
  'src/components/estimator/foundation/FoundationSyncConflictDialog.jsx',
];

for (const f of FILES) {
  const flat = f.replace(/[\\/]/g, '__');
  const dest = path.join(OUT, flat);
  try {
    const out = execFileSync('npx', ['base44@latest', 'sandbox', 'read', f,
      '--app-id', APP, '--branch', BRANCH, '--json'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, shell: true, timeout: 90000 });
    const start = out.indexOf('{');
    const j = JSON.parse(out.slice(start));
    if (j.files && j.files[0] && j.files[0].error) {
      console.log(`ABSENT ${f}`);
    } else if (j.files && j.files[0] && typeof j.files[0].content === 'string') {
      fs.writeFileSync(dest, j.files[0].content, 'utf8');
      console.log(`OK ${f} (${j.files[0].content.length})`);
    } else {
      console.log(`UNPARSED ${f}`);
    }
  } catch (e) {
    console.log(`FAIL ${f}: ${String(e.message || e).slice(0, 140)}`);
  }
}
console.log('done');
