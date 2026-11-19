#!/bin/bash
APP=68dfcc5e57bbbc35387da97c
CMD='npx esbuild src/components/proofs/proofModel.js --outfile=/tmp/pm.js && npx esbuild src/components/proofs/ProofPanel.jsx --loader:.jsx=jsx --outfile=/tmp/pp.js && npx esbuild src/components/queues/ProductQueue.jsx --loader:.jsx=jsx --outfile=/tmp/pq.js && npx esbuild src/components/estimator/workOrderConversion.js --outfile=/tmp/woc.js && node -e "const fs=require('"'"'fs'"'"');for(const f of ['"'"'base44/entities/WorkOrder.jsonc'"'"','"'"'base44/entities/BuilderProduct.jsonc'"'"']){const r=fs.readFileSync(f,'"'"'utf8'"'"').replace(/\/\/[^\n]*/g,'"'"''"'"').replace(/\/\*[\s\S]*?\*\//g,'"'"''"'"');JSON.parse(r);console.log(f,'"'"'JSONC_OK'"'"')}" && echo ALL_REMOTE_CHECKS_OK'
for i in $(seq 1 30); do
  OUT=$(npx base44@latest sandbox run "$CMD" --app-id $APP --branch main --json 2>/dev/null)
  if echo "$OUT" | grep -q "ALL_REMOTE_CHECKS_OK"; then echo "$OUT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const i=d.indexOf('{');const j=JSON.parse(d.slice(i));console.log('STDOUT:');console.log(j.stdout);console.log('STDERR:',j.stderr)})"; echo "VERIFY_DONE"; break; fi
  echo "[try $i] busy/error: $(echo "$OUT" | head -c 150)"
  sleep 40
done
