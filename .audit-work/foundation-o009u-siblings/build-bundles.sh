#!/usr/bin/env bash
# O-009u bundle staging (run from .audit-work/foundation-o009u-siblings/)
# remote/ = verbatim sandbox pulls; candidates/ = this unit's edits.
set -e
mkdir -p bundle/foundation bundle/components/masterInventory \
         bundle-remote/foundation bundle-remote/components/masterInventory
# Candidate graph: fresh remote + candidates substituted
cp remote/foundationCalc.js remote/legacyFoundationCalc.js \
   remote/foundationCatalogIntegrity.js remote/foundationInputValidation.js \
   remote/foundationConstructionChecks.js remote/landscapeMaterials.js \
   remote/foundationGeometryInputs.js remote/foundationReinforcementModel.js \
   bundle/foundation/
cp candidates/poleCalculator.js candidates/wallCalculator.js \
   candidates/wallCapCalculator.js candidates/foundationEquipmentBindings.js \
   bundle/foundation/
cp remote/inventoryNormalization.js bundle/components/masterInventory/
# Remote-baseline graph: same, with untouched emitters
cp -r bundle/foundation/. bundle-remote/foundation/
cp remote/poleCalculator.js remote/wallCalculator.js remote/wallCapCalculator.js \
   remote/foundationEquipmentBindings.js bundle-remote/foundation/
cp remote/inventoryNormalization.js bundle-remote/components/masterInventory/
# Harness stub (v1-only through calcProject)
cat > bundle/foundation/foundationReinforcementItemProjection.js <<'EOF'
export function calculateFoundationReinforcementItemProjection() { return null; }
EOF
cp bundle/foundation/foundationReinforcementItemProjection.js bundle-remote/foundation/
cp verify-entry.js bundle/verify-entry.js
cp verify-entry.js bundle-remote/verify-entry.js
npx esbuild bundle/verify-entry.js --bundle --format=esm \
  --outfile=bundle/verify-bundle.mjs "--alias:@=$PWD/bundle"
npx esbuild bundle-remote/verify-entry.js --bundle --format=esm \
  --outfile=bundle-remote/verify-bundle-remote.mjs "--alias:@=$PWD/bundle-remote"
npx esbuild bundle/foundation/foundationCalc.js --bundle --format=esm \
  --outfile=bundle/calc-bundle.mjs "--alias:@=$PWD/bundle"
