const { execSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const files = {
 'src/components/estimator/builder/partSync.js':'src__components__estimator__builder__partSync.js',
 'src/components/estimator/foundation/FoundationBOM.jsx':'src__components__estimator__foundation__FoundationBOM.jsx',
 'src/components/estimator/foundation/FoundationItemCard.jsx':'src__components__estimator__foundation__FoundationItemCard.jsx',
 'src/components/estimator/foundation/foundationCalc.js':'src__components__estimator__foundation__foundationCalc.js',
 'src/components/estimator/foundation/FoundationReinforcementProposalPanel.jsx':'src__components__estimator__foundation__FoundationReinforcementProposalPanel.jsx',
 'src/components/estimator/foundation/ReinforcementDraftGeometry.jsx':'src__components__estimator__foundation__ReinforcementDraftGeometry.jsx',
 'src/components/estimator/foundation/foundationReinforcementBasis.js':'src__components__estimator__foundation__foundationReinforcementBasis.js',
 'src/components/estimator/foundation/foundationReinforcementCost.js':'src__components__estimator__foundation__foundationReinforcementCost.js',
 'src/components/estimator/foundation/foundationReinforcementDraft.js':'src__components__estimator__foundation__foundationReinforcementDraft.js',
 'src/components/estimator/foundation/foundationReinforcementEditorSession.js':'src__components__estimator__foundation__foundationReinforcementEditorSession.js',
 'src/components/estimator/foundation/foundationReinforcementItemProjection.js':'src__components__estimator__foundation__foundationReinforcementItemProjection.js',
 'src/components/estimator/foundation/foundationReinforcementModel.js':'src__components__estimator__foundation__foundationReinforcementModel.js',
 'src/components/estimator/foundation/foundationReinforcementProposal.js':'src__components__estimator__foundation__foundationReinforcementProposal.js',
 'src/components/estimator/foundation/foundationReinforcementProjection.js':'src__components__estimator__foundation__foundationReinforcementProjection.js',
};
const newFiles = ['foundationReinforcementSupport.js','foundationReinforcementBOMRows.js','foundationReinforcementPartDescriptors.js','foundationReinforcementPreview3D.js','foundationReinforcementThreePreview.js','foundationReinforcementWorkOrderPart.js','foundationReinforcementFrozenPricing.js','foundationReinforcementCatalogMetadata.js','foundationReinforcementPrintMaterial.js','FoundationReinforcementCatalogMetadataFields.jsx','FoundationReinforcementPricingInfo.jsx'];
(async () => {
  const out = {};
  for (const [path, snap] of Object.entries(files)) {
    const base = `.audit-work/foundation-phaseb3/remote-fresh/${snap}`;
    try {
      const raw = execSync(`npx base44@latest sandbox read ${path} --app-id 68dfcc5e57bbbc35387da97c --branch main --json`, {encoding:'utf8',maxBuffer:50*1024*1024});
      const i = raw.indexOf('{'); const j = JSON.parse(raw.slice(i));
      const content = j.files[0].content;
      const baseline = fs.existsSync(base) ? fs.readFileSync(base,'utf8') : null;
      out[path] = baseline === null ? 'NO_BASELINE' : (md5(content) === md5(baseline) ? 'MATCH' : 'MOVED');
    } catch(e) { out[path] = 'ERR:'+e.message.slice(0,80); }
    console.log(path, '→', out[path]);
  }
  fs.writeFileSync('.audit-work/b3-drift.json', JSON.stringify(out,null,2));
})();
