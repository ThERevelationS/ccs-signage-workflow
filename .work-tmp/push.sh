#!/bin/bash
# push.sh <localfile>=<remotepath> ...
for spec in "$@"; do
  lf="${spec%%=*}"; rp="${spec##*=}"
  for try in 1 2 3; do
    cat "$lf" | npx base44@latest sandbox write "$rp" --overwrite --app-id 68dfcc5e57bbbc35387da97c --branch main --json > .work-tmp/.w.json 2>/dev/null
    node -e "const fs=require('fs');const raw=fs.readFileSync('.work-tmp/.w.json','utf8');const i=raw.indexOf('{');if(i<0)process.exit(1);const d=JSON.parse(raw.slice(i));if(d.error)process.exit(1);console.log('WRITE $rp')" && break
    [ $try -eq 3 ] && echo "WRITE-FAIL $rp (check via run)" || sleep 2
  done
done
