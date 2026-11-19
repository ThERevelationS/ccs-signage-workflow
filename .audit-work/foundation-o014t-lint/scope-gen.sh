#!/bin/bash
# Generate the O-014t scoped file list from the remote repo
npx base44@latest sandbox run "find src/components/estimator src/components/masterInventory src/components/foundation -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.mjs' -o -name '*.cjs' \); ls src/pages/Estimator*.jsx src/pages/FoundationEstimator.jsx" --app-id 68dfcc5e57bbbc35387da97c --branch main --json 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log(j.stdout)}catch(e){console.error('PARSE FAIL');console.error(d.slice(0,500))}})"
