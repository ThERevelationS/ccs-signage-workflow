export PATH="/c/Program Files/nodejs:$PATH"
cd "C:\Users\BrettHeinlein\Documents\DevinProjects\ccs-signage-workflow-clean"
deadline=$(( $(date +%s) + 2400 ))
attempt() {
  local payload="$1" path="$2" label="$3"
  out=$(cat "$payload" | timeout 90 npx base44@latest sandbox edit --app-id 68dfcc5e57bbbc35387da97c --json "$path" 2>&1)
  if echo "$out" | grep -qi 'applied\|"success": *true\|Edited file'; then echo "OK $label"; return 0; fi
  if echo "$out" | grep -qi "not found"; then echo "NOMATCH $label"; return 0; fi
  echo "RETRY $label: $(echo "$out" | tail -1 | head -c 120)"; return 1
}
while [ $(date +%s) -lt $deadline ]; do
  echo "--- $(date -u +%H:%M:%S) ---"
  r1=1; attempt .tmp-layout-edit-crlf.json src/Layout.jsx layout && r1=0
  r2=1; attempt .tmp-myworkflow-edit-crlf.json src/pages/MyWorkflow.jsx myworkflow && r2=0
  [ $r1 -eq 0 ] && [ $r2 -eq 0 ] && { echo DONE; break; }
  sleep 45
done
