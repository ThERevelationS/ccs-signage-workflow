#!/bin/bash
APP=68dfcc5e57bbbc35387da97c
files=(
"src/pages/FoundationCatalog.jsx"
"src/pages/BrickStoneEstimator.jsx"
"src/components/estimator/parts/partCatalog.js"
"src/components/estimator/builder/partSync.js"
"base44/shared/vendorCostModel.ts"
"src/components/estimator/foundation/FoundationItemCard.jsx"
"src/components/estimator/foundation/FoundationWallsPanel.jsx"
)
for f in "${files[@]}"; do
  out="remote/${f//\//__}"
  npx base44@latest sandbox read "$f" --app-id $APP --branch main --json > /tmp/o008_pull4.json 2>/dev/null
  node extract.cjs /tmp/o008_pull4.json "$f" "$out"
done
echo DONE
