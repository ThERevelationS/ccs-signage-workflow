#!/bin/bash
APP=68dfcc5e57bbbc35387da97c
files=(
"src/components/masterInventory/inventoryPersistence.js"
"src/components/masterInventory/inventoryImportPersistence.js"
"src/components/masterInventory/FoundationMaterialDialog.jsx"
"src/components/masterInventory/InventoryFormModal.jsx"
"src/components/masterInventory/InventoryTable.jsx"
"src/components/masterInventory/inventorySources.jsx"
"src/components/masterInventory/legacyInventoryMigrator.jsx"
"src/components/estimator/foundation/legacyFoundationCalc.js"
"src/components/estimator/foundation/foundationInputValidation.js"
"src/components/estimator/foundation/foundationCalc.js"
"src/components/foundation/foundationInventoryPersistence.js"
"src/components/foundation/EquipmentInventoryTab.jsx"
"src/components/foundation/WallCapsInventoryTab.jsx"
"src/pages/FoundationInventory.jsx"
"src/pages/MasterInventory.jsx"
"src/pages/Inventory.jsx"
"src/components/channelLetterInstall/EquipmentInventoryTab.jsx"
"src/components/channelLetterInstall/MaterialsInventoryTab.jsx"
)
for f in "${files[@]}"; do
  out="remote/${f//\//__}"
  npx base44@latest sandbox read "$f" --app-id $APP --branch main --json > /tmp/o008_pull.json 2>/dev/null
  node extract.cjs /tmp/o008_pull.json "$f" "$out"
done
echo "ALL DONE"
