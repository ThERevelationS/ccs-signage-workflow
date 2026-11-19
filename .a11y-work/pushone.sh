#!/bin/bash
f="$1"
out=$(cat "$f" | npx base44@latest sandbox write "$f" --overwrite --app-id 68dfcc5e57bbbc35387da97c --branch main --json 2>&1)
if echo "$out" | grep -qi '"error"\|Error:'; then
  echo "FAIL $f :: $(echo "$out" | tail -2 | tr '\n' ' ')" >> push.log
else
  echo "OK $f" >> push.log
fi
