#!/bin/bash
APP=68dfcc5e57bbbc35387da97c
files=(
"src/components/estimator/foundation/wallCalculator.js"
"src/components/estimator/foundation/poleCalculator.js"
"src/components/estimator/foundation/wallCapCalculator.js"
"src/components/estimator/foundation/landscapeMaterials.js"
"src/components/estimator/foundation/foundationCatalogIntegrity.js"
"src/components/estimator/foundation/foundationEquipmentBindings.js"
"src/components/estimator/foundation/foundationConstructionChecks.js"
"src/components/estimator/foundation/foundationLayoutModel.js"
"src/pages/FoundationEstimator.jsx"
"src/components/estimator/foundation/FoundationEquipmentTab.jsx"
"src/components/estimator/foundation/FoundationPolesPanel.jsx"
"src/components/estimator/foundation/FoundationWallsPanel.jsx"
"src/components/masterInventory/inventorySources.jsx"
)
for f in "${files[@]}"; do
  out="remote/${f//\//__}"
  npx base44@latest sandbox read "$f" --app-id $APP --branch main --json > /tmp/o008_pull2.json 2>/dev/null
  node extract.cjs /tmp/o008_pull2.json "$f" "$out"
done
echo DONE
