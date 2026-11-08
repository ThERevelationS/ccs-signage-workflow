#!/bin/bash
cd /app
node_modules/.bin/esbuild \
  src/components/masterInventory/inventoryNormalization.js \
  src/components/estimator/foundation/foundationCalc.js \
  src/components/estimator/foundation/legacyFoundationCalc.js \
  src/components/estimator/foundation/foundationInputValidation.js \
  src/components/estimator/foundation/wallCalculator.js \
  src/components/estimator/foundation/poleCalculator.js \
  src/components/estimator/foundation/wallCapCalculator.js \
  src/components/estimator/foundation/landscapeMaterials.js \
  src/components/estimator/foundation/FoundationItemCard.jsx \
  src/components/estimator/foundation/FoundationEquipmentTab.jsx \
  src/components/estimator/foundation/FoundationWallsPanel.jsx \
  src/components/estimator/foundation/FoundationPolesPanel.jsx \
  src/components/foundation/EquipmentInventoryTab.jsx \
  src/components/foundation/WallCapsInventoryTab.jsx \
  src/components/masterInventory/FoundationMaterialDialog.jsx \
  src/components/masterInventory/InventoryFormModal.jsx \
  src/components/masterInventory/MasterEquipmentTab.jsx \
  src/components/masterInventory/MasterSuppliesTab.jsx \
  src/pages/FoundationEstimator.jsx \
  src/pages/FoundationInventory.jsx \
  --bundle --alias:@=/app/src --loader:.js=jsx --loader:.jsx=jsx \
  --format=esm --outdir=/root/o008-dist --log-level=warning \
  >/root/o008-build.stdout 2>/root/o008-build.stderr
echo "ESBUILD_EXIT=$?" > /root/o008-build.exit
