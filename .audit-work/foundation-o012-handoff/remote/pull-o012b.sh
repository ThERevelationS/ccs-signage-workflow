#!/bin/bash
pull() {
  local p="$1" n="$2"
  npx base44@latest sandbox read "$p" --app-id 68dfcc5e57bbbc35387da97c --branch main --json > "pull-$n.json" 2>/dev/null
  python -c "import json,io,sys; d=json.load(io.open('pull-$n.json',encoding='utf-8')); c=d['files'][0]['content']; io.open('$n','w',encoding='utf-8',newline='').write(c); print('$n', len(c))" || echo "FAIL $n"
}
pull "src/components/estimator/builder/builderPartGroupPersistence.js" builderPartGroupPersistence.js
pull "src/components/estimator/builder/builderPartPersistence.js" builderPartPersistence.js
pull "src/components/estimator/parts/partState.js" partState.js
pull "src/components/estimator/estimateLifecycle.js" estimateLifecycle.js
pull "src/components/estimator/foundation/landscapeMaterials.js" landscapeMaterials.js
pull "src/components/estimator/depositGate.js" depositGate.js
pull "src/components/workflow/workOrderPersistence.js" workOrderPersistence.js
pull "base44/shared/dueDateEngine.ts" dueDateEngine.ts
pull "base44/shared/productStatusModel.ts" productStatusModel.ts
pull "src/components/estimator/estimateSaveRecovery.js" estimateSaveRecovery.js
pull "src/components/estimator/estimateConcurrency.js" estimateConcurrency.js
