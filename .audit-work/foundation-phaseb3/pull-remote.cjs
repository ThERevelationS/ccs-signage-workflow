// Batch-pull remote files for Phase B-3 (rebar support model, O-022..O-028).
// Saves each to .audit-work/foundation-phaseb3/remote/<flattened-name>.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP = '68dfcc5e57bbbc35387da97c';
const BRANCH = 'main';
const OUT = path.join(__dirname, 'remote');
fs.mkdirSync(OUT, { recursive: true });

const FILES = [
  'src/components/estimator/foundation/foundationReinforcementModel.js',
  'src/components/estimator/foundation/foundationReinforcementCost.js',
  'src/components/estimator/foundation/foundationReinforcementProjection.js',
  'src/components/estimator/foundation/foundationReinforcementItemProjection.js',
  'src/components/estimator/foundation/foundationReinforcementBasis.js',
  'src/components/estimator/foundation/foundationReinforcementBasisKey.js',
  'src/components/estimator/foundation/foundationReinforcementDraft.js',
  'src/components/estimator/foundation/foundationReinforcementProposal.js',
  'src/components/estimator/foundation/foundationReinforcementEditorSession.js',
  'src/components/estimator/foundation/useFoundationReinforcementEditor.js',
  'src/components/estimator/foundation/ReinforcementDraftField.jsx',
  'src/components/estimator/foundation/ReinforcementDraftGeometry.jsx',
  'src/components/estimator/foundation/ReinforcementDraftList.jsx',
  'src/components/estimator/foundation/ReinforcementDraftMaterial.jsx',
  'src/components/estimator/foundation/FoundationReinforcementProposalPanel.jsx',
  'src/components/estimator/foundation/foundationGeometryInputs.js',
  'src/components/estimator/foundation/foundationInputValidation.js',
  'src/components/estimator/foundation/foundationCalc.js',
  'src/components/estimator/foundation/FoundationBOM.jsx',
  'src/components/estimator/foundation/FoundationItemCard.jsx',
  'src/components/estimator/foundation/foundationCatalogIntegrity.js',
  'src/components/estimator/foundation/foundationConstructionChecks.js',
  'src/components/estimator/foundation/foundationDraftRecovery.js',
  'src/components/estimator/builder/partSync.js',
  'src/pages/FoundationEstimator.jsx',
  'src/pages/FoundationInventory.jsx',
  'base44/entities/FoundationInventory.jsonc',
];

const results = [];
for (const f of FILES) {
  const flat = f.replace(/[\\/]/g, '__');
  const dest = path.join(OUT, flat);
  try {
    const out = execFileSync('npx', ['base44@latest', 'sandbox', 'read', f,
      '--app-id', APP, '--branch', BRANCH, '--json'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, shell: true, timeout: 60000 });
    let content = out;
    try {
      const j = JSON.parse(out);
      content = j.content ?? j.source ?? j.stdout ?? out;
      if (j.content === undefined && j.source === undefined && j.stdout === undefined) content = out;
    } catch { /* raw text */ }
    fs.writeFileSync(dest, content, 'utf8');
    results.push({ file: f, bytes: content.length, ok: true });
    console.log(`OK ${f} -> ${flat} (${content.length} bytes)`);
  } catch (e) {
    results.push({ file: f, ok: false, err: String(e.message || e).slice(0, 300) });
    console.log(`FAIL ${f}: ${String(e.message || e).slice(0, 200)}`);
  }
}
fs.writeFileSync(path.join(OUT, '_manifest.json'), JSON.stringify(results, null, 2));
console.log(`\nDone: ${results.filter(r => r.ok).length}/${results.length} pulled`);
