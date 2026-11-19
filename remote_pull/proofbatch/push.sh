#!/bin/bash
APP=68dfcc5e57bbbc35387da97c
FILES="src/components/proofs/proofModel.js src/components/proofs/ProofPanel.jsx src/components/estimator/workOrderConversion.js src/components/queues/ProductQueue.jsx base44/entities/WorkOrder.jsonc base44/entities/BuilderProduct.jsonc scripts/test-proof-workflow.mjs"
declare -A DONE
rmd5() {
  npx base44@latest sandbox run "md5sum \"$1\" 2>/dev/null || echo MISSING" --app-id $APP --branch main --json 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const i=d.indexOf('{');if(i<0){console.log('ERR');return}try{const j=JSON.parse(d.slice(i));const m=(j.stdout||'').trim().split(/\s+/)[0];console.log(m||'ERR')}catch(e){console.log('ERR')}})"
}
for round in $(seq 1 30); do
  ALL=1
  for f in $FILES; do
    [ -n "${DONE[$f]}" ] && continue
    LMD5=$(md5sum "$f" | cut -d' ' -f1)
    RMD5=$(rmd5 "$f")
    echo "[round $round] $f remote=$RMD5 local=$LMD5"
    if [ "$RMD5" = "$LMD5" ]; then DONE[$f]=1; continue; fi
    cat "$f" | npx base44@latest sandbox write "$f" --overwrite --app-id $APP --branch main --json >/dev/null 2>&1
    echo "  wrote $f"
    sleep 8
    ALL=0
  done
  if [ $ALL -eq 1 ]; then echo "ALL_FILES_VERIFIED"; break; fi
  sleep 25
done
for f in $FILES; do [ -z "${DONE[$f]}" ] && echo "STILL_PENDING: $f"; done
