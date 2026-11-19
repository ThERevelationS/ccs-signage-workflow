#!/bin/bash
APP=68dfcc5e57bbbc35387da97c
files=(
"src/components/masterInventory/laborServiceCategorySchema.jsx"
"src/components/masterInventory/MasterConcreteStoneTab.jsx"
"src/components/masterInventory/MasterExtrudedMetalsPolesTab.jsx"
"src/components/masterInventory/MasterEquipmentTab.jsx"
"src/components/masterInventory/MasterSuppliesTab.jsx"
"src/components/masterInventory/importMappers.jsx"
"src/components/masterInventory/ExcelImporterDialog.jsx"
"src/components/masterInventory/equipmentPersistence.js"
"src/components/masterInventory/InventoryTable.jsx"
)
for f in "${files[@]}"; do
  out="remote/${f//\//__}"
  npx base44@latest sandbox read "$f" --app-id $APP --branch main --json > /tmp/o008_pull3.json 2>/dev/null
  node extract.cjs /tmp/o008_pull3.json "$f" "$out"
done
echo DONE
