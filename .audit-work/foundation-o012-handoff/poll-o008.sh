#!/usr/bin/env bash
# Poll for the O-008 checkpoint landing on remote main.
# Exits 0 when found, 2 on 30-min timeout.
cd "/c/Users/BrettHeinlein/Documents/DevinProjects/ccs-signage-workflow-clean"
APP=68dfcc5e57bbbc35387da97c
DEADLINE=$(( $(date +%s) + 1800 ))
i=0
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  i=$((i+1))
  OUT=$(MSYS_NO_PATHCONV=1 npx base44@latest api fetch GET "/api/apps/$APP/app-checkpoints" --json 2>/dev/null \
    | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const a=JSON.parse(d);a.slice(0,4).forEach(c=>console.log(c.created_date,'|',c.name,'|',(c.git_commit_hash||'').slice(0,9),'|',c.preview_status))}catch(e){console.log('PARSE_FAIL')}})")
  echo "=== poll $i $(date -u +%H:%M:%S) ==="
  echo "$OUT"
  if echo "$OUT" | grep -q "O-008 inventory normalization boundary"; then
    echo "O008_CHECKPOINT_FOUND"
    exit 0
  fi
  sleep 60
done
echo "O008_TIMEOUT"
exit 2
