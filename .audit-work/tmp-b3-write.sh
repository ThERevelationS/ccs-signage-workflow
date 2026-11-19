#!/usr/bin/bash
cd "$(dirname "$0")/.."
CAND=".audit-work/foundation-phaseb3/candidates"
FB="src/components/estimator/foundation"
for f in foundationReinforcementSupport.js foundationReinforcementBOMRows.js foundationReinforcementPartDescriptors.js foundationReinforcementPreview3D.js foundationReinforcementThreePreview.js foundationReinforcementWorkOrderPart.js foundationReinforcementFrozenPricing.js; do
  out=$(cat "$CAND/$f" | npx base44@latest sandbox write "$FB/$f" --overwrite --app-id 68dfcc5e57bbbc35387da97c --branch main --json 2>&1)
  echo "NEW $f :: $(echo "$out" | tail -3 | tr '\n' '|')"
done
for f in foundationCalc.js foundationReinforcementBasis.js foundationReinforcementCost.js foundationReinforcementDraft.js foundationReinforcementEditorSession.js foundationReinforcementItemProjection.js foundationReinforcementModel.js foundationReinforcementProposal.js foundationReinforcementProjection.js FoundationBOM.jsx FoundationItemCard.jsx FoundationReinforcementProposalPanel.jsx ReinforcementDraftGeometry.jsx; do
  out=$(cat "$CAND/$f" | npx base44@latest sandbox write "$FB/$f" --overwrite --app-id 68dfcc5e57bbbc35387da97c --branch main --json 2>&1)
  echo "MOD $f :: $(echo "$out" | tail -3 | tr '\n' '|')"
done
out=$(cat "$CAND/partSync.js" | npx base44@latest sandbox write "src/components/estimator/builder/partSync.js" --overwrite --app-id 68dfcc5e57bbbc35387da97c --branch main --json 2>&1)
echo "MOD partSync.js :: $(echo "$out" | tail -3 | tr '\n' '|')"
