#!/bin/bash
cd "$(dirname "$0")/remote"
APP=68dfcc5e57bbbc35387da97c
FILES=(
  "src/components/estimator/builder/builderService.js"
  "src/components/estimator/builder/sourceProjectPersistence.js"
  "src/components/estimator/builder/partSync.js"
  "src/components/estimator/builder/builderMutationRecovery.js"
  "src/components/estimator/builder/builderEntityPersistence.js"
  "src/components/estimator/builder/itemIdentity.js"
  "src/components/estimator/foundation/foundationSyncRecovery.js"
  "src/components/estimator/foundation/foundationBuilderRecovery.js"
  "src/components/estimator/foundation/foundationSaveSession.js"
  "src/components/estimator/foundation/convertToBrickStone.js"
  "src/components/estimator/moduleShared/moduleProjectActions.js"
  "src/pages/FoundationEstimator.jsx"
  "src/components/estimator/workOrderConversion.js"
  "src/components/estimator/ConvertToWorkOrder.jsx"
  "src/components/estimator/customerQuote.js"
  "src/components/estimator/quoteLifecycle.js"
  "src/components/estimator/workOrderSyncPersistence.js"
)
for f in "${FILES[@]}"; do
  out=$(echo "$f" | tr '/' '_')
  npx base44@latest sandbox read "$f" --app-id $APP --branch main --json > "$out.json" 2>"$out.err"
  python -c "import json,sys; d=json.load(open('$out.json')); open('$out','w',newline='').write(d.get('content',''))" 2>>"$out.err" && echo "OK $f $(wc -c < $out) bytes" || echo "FAIL $f"
done
