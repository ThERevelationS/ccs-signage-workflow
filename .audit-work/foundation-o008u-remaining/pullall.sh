#!/bin/bash
# Fresh-remote pulls for the O-008u remainder work. Re-run before diffing.
APP=68dfcc5e57bbbc35387da97c
cd "$(dirname "$0")"
files=(
# granted candidates
"src/components/masterInventory/MasterEquipmentTab.jsx"
"src/components/masterInventory/InventoryTable.jsx"
"src/pages/FoundationCatalog.jsx"
# O-008t-landed references (pattern sources — NOT modified)
"src/components/masterInventory/inventoryNormalization.js"
"src/components/masterInventory/MasterSuppliesTab.jsx"
"src/components/foundation/EquipmentInventoryTab.jsx"
"src/pages/FoundationInventory.jsx"
# context (source configs / consumers — read-only)
"src/components/masterInventory/laborServiceCategorySchema.jsx"
"src/components/masterInventory/MasterConcreteStoneTab.jsx"
"src/pages/MasterInventory.jsx"
"src/components/masterInventory/MasterExtrudedMetalsPolesTab.jsx"
"src/components/masterInventory/inventorySources.jsx"
"src/components/masterInventory/foundationFieldSchema.js"
)
for f in "${files[@]}"; do
  out="remote/${f//\//__}"
  npx base44@latest sandbox read "$f" --app-id $APP --branch main --json > /tmp/o008u_pull.json 2>/dev/null
  node extract.cjs /tmp/o008u_pull.json "$f" "$out"
done
echo "ALL DONE"
