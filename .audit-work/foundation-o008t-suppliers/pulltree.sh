#!/usr/bin/env bash
APP=68dfcc5e57bbbc35387da97c
cd "$(dirname "$0")"
mkdir -p testtree/src/components/estimator/foundation testtree/src/components/masterInventory
files=(
"src/components/estimator/foundation/wallCalculator.js"
"src/components/estimator/foundation/poleCalculator.js"
"src/components/estimator/foundation/wallCapCalculator.js"
"src/components/estimator/foundation/landscapeMaterials.js"
"src/components/estimator/foundation/foundationInputValidation.js"
"src/components/estimator/foundation/foundationCalc.js"
"src/components/estimator/foundation/foundationCatalogIntegrity.js"
"src/components/estimator/foundation/foundationConstructionChecks.js"
"src/components/estimator/foundation/foundationEquipmentBindings.js"
)
for f in "${files[@]}"; do
  out="testtree/${f}"
  npx base44@latest sandbox read "$f" --app-id $APP --branch main --json > /tmp/o008t_tree.json 2>/dev/null
  node extract.cjs /tmp/o008t_tree.json "$f" "$out"
done
echo "ALL DONE"
