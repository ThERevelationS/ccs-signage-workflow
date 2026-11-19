#!/bin/bash
# pull-run.sh <remote-path> <local-out> — fetch via sandbox run base64
for spec in "$@"; do
  f="${spec%%=*}"; out="${spec##*=}"
  npx base44@latest sandbox run "base64 -w0 $f" --app-id 68dfcc5e57bbbc35387da97c --branch main --json > .work-tmp/.b64.json 2>/dev/null
  node -e "const fs=require('fs');const raw=fs.readFileSync('.work-tmp/.b64.json','utf8');const i=raw.indexOf('{');if(i<0)process.exit(1);const d=JSON.parse(raw.slice(i));if(d.exitCode!==0||!d.stdout)process.exit(1);fs.writeFileSync('$out',Buffer.from(d.stdout.trim(),'base64'));console.log('OK $f -> $out '+fs.statSync('$out').size+'b')" || echo "FAIL $f"
done
