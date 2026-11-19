// Pull fresh remote copies of O-014u target + reference files into remote/
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const APP = '68dfcc5e57bbbc35387da97c';
const ROOT = '.audit-work/foundation-o014u-fixes';
const files = [
  // O-014u targets
  'src/components/estimator/moduleShared/moduleTemplateService.js',
  'src/components/estimator/moduleShared/ModuleTemplateDialog.jsx',
  'src/components/estimator/products/clipboardService.js',
  'src/components/estimator/aio/ClipboardManagerModal.jsx',
  'src/pages/EstimatorQueues.jsx',
  'src/components/estimator/aio/BuilderPartsPanel.jsx',
  'src/components/estimator/useSectionSync.js',
  // O-014u lint targets
  'src/components/estimator/paint/paintPricingAvailability.js',
  'src/components/masterInventory/MasterConcreteStoneTab.jsx',
  'src/components/masterInventory/MasterSuppliesTab.jsx',
  'src/components/masterInventory/inventorySources.jsx',
  'src/pages/FoundationEstimator.jsx',
  'src/components/estimator/foundation/foundationCatalogIntegrity.js',
  // O-014 reference pair (landed fix patterns to mirror)
  'src/components/estimator/foundation/foundationTemplateService.js',
  'src/components/estimator/foundation/FoundationTemplateDialog.jsx',
];
const cmd = `npx base44@latest sandbox read ${files.join(' ')} --app-id ${APP} --branch main --json`;
const out = execSync(cmd, { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
const j = JSON.parse(out);
let pulled = 0;
for (const f of (j.files || [])) {
  if (f.error) { console.log(`ERR ${f.path}: ${JSON.stringify(f.error).slice(0,160)}`); continue; }
  const dest = join(ROOT, 'remote', f.path);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, f.content);
  pulled++;
  console.log(`OK ${f.path} (${f.content.length} bytes)`);
}
console.log(`DONE pulled=${pulled}/${files.length}`);
