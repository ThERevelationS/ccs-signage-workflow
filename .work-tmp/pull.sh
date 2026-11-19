#!/bin/bash
for f in "$@"; do
  out=".work-tmp/remote-$(basename $f)"
  for try in 1 2 3; do
    npx base44@latest sandbox read "$f" --app-id 68dfcc5e57bbbc35387da97c --branch main --json > .work-tmp/.read.json 2>/dev/null
    node -e "const fs=require('fs');const raw=fs.readFileSync('.work-tmp/.read.json','utf8');const i=raw.indexOf('{');if(i<0)process.exit(1);const d=JSON.parse(raw.slice(i));const files=d.files||d.contents||[];if(!files.length||files[0].content===undefined)process.exit(1);fs.writeFileSync('$out',files[0].content);console.log('OK $f '+files[0].content.length+'b')" && break
    echo "RETRY($try) $f"; sleep 2
  done
done
