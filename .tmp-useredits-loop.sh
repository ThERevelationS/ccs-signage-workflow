export PATH="/c/Program Files/nodejs:$PATH"
cd "C:\Users\BrettHeinlein\Documents\DevinProjects\ccs-signage-workflow-clean"
deadline=$(( $(date +%s) + 3600 ))
apply_edit() {
  local payload="$1" path="$2" label="$3"
  for i in 1 2 3; do
    out=$(cat "$payload" | timeout 90 npx base44@latest sandbox edit --app-id 68dfcc5e57bbbc35387da97c --json "$path" 2>&1)
    if echo "$out" | grep -q '"applied"\|Applied\|"success": *true\|edited'; then echo "OK $label"; return 0; fi
    if echo "$out" | grep -qi "timed out\|502"; then sleep 20; continue; fi
    if echo "$out" | grep -qi "busy"; then return 2; fi
    echo "ERR $label: $(echo "$out" | tail -2)"; return 1
  done
  return 1
}
while [ $(date +%s) -lt $deadline ]; do
  echo "--- cycle $(date -u +%H:%M:%S) ---"
  r1=0; apply_edit .tmp-layout-edit.json src/Layout.jsx layout || r1=$?
  sleep 3
  r2=0; apply_edit .tmp-myworkflow-edit.json src/pages/MyWorkflow.jsx myworkflow || r2=$?
  if [ $r1 -eq 0 ] && [ $r2 -eq 0 ]; then echo "ALL-APPLIED"; break; fi
  sleep 60
done
