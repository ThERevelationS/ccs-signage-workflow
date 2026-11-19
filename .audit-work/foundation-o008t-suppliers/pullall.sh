#!/bin/bash
APP=68dfcc5e57bbbc35387da97c
cd "$(dirname "$0")"
files=(
"src/components/masterInventory/inventoryNormalization.js"
"src/components/masterInventory/MasterSuppliesTab.jsx"
"src/components/masterInventory/MasterEquipmentTab.jsx"
"src/components/masterInventory/FoundationMaterialDialog.jsx"
"src/components/masterInventory/InventoryFormModal.jsx"
"src/components/masterInventory/foundationFieldSchema.js"
"src/components/estimator/foundation/legacyFoundationCalc.js"
"src/components/estimator/foundation/foundationCalc.js"
"src/components/estimator/foundation/wallCalculator.js"
"src/components/foundation/EquipmentInventoryTab.jsx"
"src/components/foundation/WallCapsInventoryTab.jsx"
"src/pages/FoundationInventory.jsx"
"src/pages/FoundationEstimator.jsx"
"src/pages/MasterInventory.jsx"
"base44/entities/LaborServiceInventory.jsonc"
"base44/entities/FoundationInventory.jsonc"
)
for f in "${files[@]}"; do
  out="remote/${f//\//__}"
  npx base44@latest sandbox read "$f" --app-id $APP --branch main --json > /tmp/o008t_pull.json 2>/dev/null
  node extract.cjs /tmp/o008t_pull.json "$f" "$out"
done
echo "ALL DONE"
