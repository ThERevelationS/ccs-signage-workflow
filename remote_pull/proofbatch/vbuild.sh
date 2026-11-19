#!/bin/bash
APP=68dfcc5e57bbbc35387da97c
for i in $(seq 1 25); do
  OUT=$(npx base44@latest sandbox run "npx vite build --outDir /tmp/vb4 --emptyOutDir" --app-id $APP --branch main --json 2>/dev/null)
  if echo "$OUT" | grep -q '"exitCode": 0'; then echo "BUILD_OK"; echo "$OUT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const i=d.indexOf('{');const j=JSON.parse(d.slice(i));console.log('stdout-tail:',(j.stdout||'').split('\n').slice(-15).join('\n'));console.log('stderr-tail:',(j.stderr||'').split('\n').slice(-15).join('\n'));console.log('durationMs:',j.durationMs)})"; break; fi
  if echo "$OUT" | grep -q '"exitCode"'; then echo "BUILD_FAILED"; echo "$OUT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const i=d.indexOf('{');const j=JSON.parse(d.slice(i));console.log((j.stdout||'').split('\n').slice(-30).join('\n'));console.log('STDERR:',(j.stderr||'').split('\n').slice(-30).join('\n'))})"; break; fi
  echo "[try $i] busy: $(echo "$OUT" | head -c 120)"
  sleep 45
done
