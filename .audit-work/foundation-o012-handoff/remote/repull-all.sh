#!/bin/bash
APP=68dfcc5e57bbbc35387da97c
FILES=(
  "src/components/estimator/builder/sourceProjectPersistence.js"
  "src/components/estimator/builder/partSync.js"
  "src/components/estimator/builder/builderMutationRecovery.js"
  "src/components/estimator/builder/builderEntityPersistence.js"
  "src/components/estimator/builder/itemIdentity.js"
  "src/components/estimator/builder/builderProductPersistence.js"
  "src/components/estimator/foundation/foundationSyncRecovery.js"
  "src/components/estimator/foundation/foundationBuilderRecovery.js"
  "src/components/estimator/foundation/foundationSaveSession.js"
  "src/components/estimator/foundation/convertToBrickStone.js"
  "src/components/estimator/foundation/foundationAssemblyModel.js"
  "src/components/estimator/foundation/foundationSellPricing.js"
  "src/components/estimator/foundation/foundationCalc.js"
  "src/components/estimator/moduleShared/moduleProjectActions.js"
  "src/components/estimator/workOrderConversion.js"
  "src/components/estimator/ConvertToWorkOrder.jsx"
  "src/components/estimator/customerQuote.js"
  "src/components/estimator/quoteLifecycle.js"
  "src/components/estimator/workOrderSyncPersistence.js"
  "src/components/estimator/estimateConversionService.js"
  "src/components/estimator/aioPricing.js"
  "src/components/estimator/useSectionSync.js"
  "src/components/estimator/estimateRevisionService.js"
  "src/components/estimator/estimateMutationGuard.js"
  "src/components/estimator/estimatePersistence.js"
  "src/components/estimator/estimateCreationService.js"
  "src/components/estimator/customerPricing.js"
  "src/components/estimator/moduleRegistry.js"
  "src/components/estimator/idempotentEntityCreate.js"
  "src/components/estimator/products/productOperations.js"
  "src/components/estimator/EstimateRevisionPanel.jsx"
  "src/pages/EstimateDetail.jsx"
  "src/components/estimator/foundation/foundationDraftRecovery.js"
)
for f in "${FILES[@]}"; do
  out=$(echo "$f" | tr '/' '_')
  npx base44@latest sandbox read "$f" --app-id $APP --branch main --json > "rp-$out.json" 2>/dev/null
  python -c "
import json,io,sys,os
try:
    d=json.load(io.open('rp-$out.json',encoding='utf-8'))
    c=d['files'][0]['content']
    io.open('$out.rp','w',encoding='utf-8',newline='').write(c)
    old = io.open('$out',encoding='utf-8').read() if os.path.exists('$out') else None
    if old is None: print('NEWFILE $out', len(c))
    elif old != c: print('CHANGED $out', len(old),'->',len(c))
    else: print('same $out')
except Exception as e: print('FAIL $out', str(e)[:60])
"
done
