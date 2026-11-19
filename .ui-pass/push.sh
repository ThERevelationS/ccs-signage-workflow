#!/usr/bin/env bash
# Push one mirror file to the remote sandbox (stdin) and verify via remote md5sum.
# Usage: ./push.sh src/pages/Imports.jsx
set -u
APP=68dfcc5e57bbbc35387da97c
f="$1"
[ -f "$f" ] || { echo "MISSING LOCAL $f"; exit 1; }
local_md5=$(md5sum "$f" | cut -d' ' -f1)
out=$(cat "$f" | npx base44@latest sandbox write "$f" --overwrite --app-id "$APP" --branch main --json 2>&1)
echo "$out" | tail -8
sleep 3
remote_md5=$(npx base44@latest sandbox run "md5sum '$f'" --app-id "$APP" --branch main --json 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).stdout.trim().split(/\s+/)[0])}catch(e){console.log('ERR')}})")
if [ "$local_md5" = "$remote_md5" ]; then
  echo "OK   $f ($local_md5)"
else
  echo "DIFF $f local=$local_md5 remote=$remote_md5"
fi
