#!/bin/bash
LOG=push.log
: > "$LOG"
i=0
while IFS= read -r f; do
  i=$((i+1))
  out=$(cat "$f" | npx base44@latest sandbox write "$f" --overwrite --app-id 68dfcc5e57bbbc35387da97c --branch main --json 2>&1)
  if echo "$out" | grep -qi '"error"\|Error:'; then
    echo "FAIL($i) $f :: $(echo "$out" | tail -2 | tr '\n' ' ')" >> "$LOG"
  else
    echo "OK($i) $f" >> "$LOG"
  fi
done < pushlist.txt
echo "DONE $(grep -c '^OK' "$LOG") ok / $(grep -c '^FAIL' "$LOG") fail" >> "$LOG"
