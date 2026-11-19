#!/bin/bash
i=0
while IFS= read -r f; do
  f="${f%$'\r'}"
  [ -z "$f" ] && continue
  i=$((i+1))
  out=$(cat "$f" | npx base44@latest sandbox write "$f" --overwrite --app-id 68dfcc5e57bbbc35387da97c --branch main --json 2>&1)
  if echo "$out" | grep -qi '"error"\|Error:'; then
    echo "RETRY-FAIL($i) $f" >> push2.log
  else
    echo "RETRY-OK($i) $f" >> push2.log
  fi
  sleep 2
done < stale.txt
echo DONE >> push2.log
