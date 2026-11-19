#!/usr/bin/env bash
# Post-apply marker greps on the remote. Prints PASS/FAIL per marker.
cd "/c/Users/BrettHeinlein/Documents/DevinProjects/ccs-signage-workflow-clean"
APP=68dfcc5e57bbbc35387da97c
g() { # pattern path label
  local out
  out=$(npx base44@latest sandbox grep "$1" --path "$2" --app-id $APP --branch main --json 2>/dev/null)
  local n
  n=$(echo "$out" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log(j.returnedMatches??(j.matches||[]).length)}catch(e){console.log(-1)}})")
  echo "${3}|${n}"
}
echo "marker|matches"
g "inventoryNormalization" "src/pages/FoundationEstimator.jsx" "O-008 inventoryNormalization import"
g "ccsFoundationLeaveGuard" "src/pages/FoundationEstimator.jsx" "O-004 leave guard"
g "constructionWarnings" "src/pages/FoundationEstimator.jsx" "O-030 constructionWarnings"
g "<FoundationBOM" "src/pages/FoundationEstimator.jsx" "O-011 FoundationBOM"
g "saveDisabled" "src/pages/FoundationEstimator.jsx" "O-007 saveDisabled"
g "savedSectionTotal" "src/pages/FoundationEstimator.jsx" "O-010 savedSectionTotal"
g "FOUNDATION_RECORD_TOTAL_FIELDS" "src/components/estimator/builder/builderService.js" "O-010+O-012 total fields"
g "foundationSplitFieldTotal" "src/components/estimator/builder/builderService.js" "O-012 foundationSplitFieldTotal"
g "resolveFoundationSyncReceiptForSave" "src/components/estimator/foundation/foundationSyncRecovery.js" "O-012 resolver def"
g "resolveFoundationSyncReceiptForSave" "src/pages/FoundationEstimator.jsx" "O-012 resolver import+use"
g "clearStaleSyncReceipt" "src/pages/FoundationEstimator.jsx" "O-012 clearStaleSyncReceipt"
g "assertNoPendingLinesForCopy" "src/components/estimator/builder/builderMutationRecovery.js" "O-012 copy guard def"
g "assertNoPendingLinesForCopy" "src/pages/EstimateDetail.jsx" "O-012 copy guard merge use"
g "assertNoPendingLinesForCopy" "src/components/estimator/estimateCreationService.js" "O-012 copy guard dup/split use"
g "skipPendingGuard" "src/components/estimator/estimateCreationService.js" "O-012 skipPendingGuard"
g "no longer part of the estimate" "src/components/estimator/builder/builderService.js" "O-012 fail-closed msg"
g "signage_cabinets: rows(project" "src/components/estimator/builder/partSync.js" "O-012 extractFoundation coerce"
