// Pull CURRENT remote files for Phase B-3 rebase check.
// Writes .audit-work/foundation-phaseb3/remote-fresh/<flattened-name>
// and _manifest.json. Missing remote files recorded ok:false/absent:true.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP = '68dfcc5e57bbbc35387da97c';
const BRANCH = 'main';
const OUT = path.join(__dirname, 'remote-fresh');
fs.mkdirSync(OUT, { recursive: true });

const FILES = [
  // Baseline-pulled files
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
  // Tree deps that may have moved
  'src/components/estimator/foundation/Foundation3DPreview.jsx',
  'src/components/estimator/foundation/foundationReinforcementCatalogMetadata.js',
  'src/components/estimator/foundation/foundationReinforcementPrintMaterial.js',
  'src/components/estimator/foundation/foundationAiReview.js',
  'src/components/estimator/foundation/foundationAssemblyModel.js',
  'src/components/estimator/foundation/foundationBuilderRecovery.js',
  'src/components/estimator/foundation/foundationEquipmentBindings.js',
  'src/components/estimator/foundation/foundationSaveSession.js',
  'src/components/estimator/foundation/foundationSellPricing.js',
  'src/components/estimator/foundation/foundationSyncRecovery.js',
  'src/components/estimator/foundation/foundationTemplateModel.js',
  'src/components/estimator/foundation/foundationTemplateService.js',
  'src/components/estimator/foundation/legacyFoundationCalc.js',
  'src/components/estimator/foundation/poleCalculator.js',
  'src/components/estimator/foundation/wallCalculator.js',
  'src/components/estimator/foundation/wallCapCalculator.js',
  'src/components/estimator/foundation/landscapeMaterials.js',
  'src/components/estimator/foundation/FoundationTemplateDialog.jsx',
  'src/components/estimator/foundation/FoundationToolbar.jsx',
  // NEW candidate files — must confirm absent (or collision) on remote
  'src/components/estimator/foundation/foundationReinforcementSupport.js',
  'src/components/estimator/foundation/foundationReinforcementBOMRows.js',
  'src/components/estimator/foundation/foundationReinforcementFrozenPricing.js',
  'src/components/estimator/foundation/foundationReinforcementPartDescriptors.js',
  'src/components/estimator/foundation/foundationReinforcementPreview3D.js',
  'src/components/estimator/foundation/foundationReinforcementThreePreview.js',
  'src/components/estimator/foundation/foundationReinforcementWorkOrderPart.js',
  'src/components/estimator/foundation/FoundationReinforcementCatalogMetadataFields.jsx',
  'src/components/estimator/foundation/FoundationReinforcementPricingInfo.jsx',
];

const results = [];
for (const f of FILES) {
  const flat = f.replace(/[\\/]/g, '__');
  const dest = path.join(OUT, flat);
  try {
    const out = execFileSync('npx', ['base44@latest', 'sandbox', 'read', f,
      '--app-id', APP, '--branch', BRANCH, '--json'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, shell: true, timeout: 90000 });
    let content = out, absent = false;
    try {
      const j = JSON.parse(out);
      if (j.error || j.ok === false) absent = true;
      content = j.content ?? j.source ?? j.stdout ?? out;
      if (typeof content !== 'string') { content = out; }
      if (/not found|does not exist|ENOENT|404/i.test(String(j.error || j.message || ''))) absent = true;
    } catch { /* raw text */ }
    if (absent) {
      results.push({ file: f, ok: false, absent: true });
      console.log(`ABSENT ${f}`);
    } else {
      fs.writeFileSync(dest, content, 'utf8');
      results.push({ file: f, bytes: content.length, ok: true });
      console.log(`OK ${f} (${content.length} bytes)`);
    }
  } catch (e) {
    const msg = String(e.message || e).slice(0, 300);
    const absent = /not found|does not exist|ENOENT|404/i.test(msg);
    results.push({ file: f, ok: false, absent, err: msg });
    console.log(`${absent ? 'ABSENT' : 'FAIL'} ${f}: ${msg.slice(0, 160)}`);
  }
}
fs.writeFileSync(path.join(OUT, '_manifest.json'), JSON.stringify(results, null, 2));
console.log(`\nDone: ${results.filter(r => r.ok).length}/${results.length} pulled`);
