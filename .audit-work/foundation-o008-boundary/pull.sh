#!/bin/bash
APP=68dfcc5e57bbbc35387da97c
pull() {
  local path="$1"; local out="remote/$(basename $path)"
  npx base44@latest sandbox read "$path" --app-id $APP --branch main --json > "${out}.json" 2>/dev/null
  node -e "
    const j=require('./${out}.json');
    const c=j.content??j.file?.content??j;
    require('fs').writeFileSync('${out}', typeof c==='string'?c:JSON.stringify(c,null,2));
  " 2>/dev/null && echo "OK $path -> $out ($(wc -c < $out) bytes)" || echo "FAIL $path"
}
