#!/usr/bin/env bash
# Pull the 7 O-012 target files fresh from remote main into remote-post-o008/
set -u
cd "/c/Users/BrettHeinlein/Documents/DevinProjects/ccs-signage-workflow-clean/.audit-work/foundation-o012-handoff"
APP=68dfcc5e57bbbc35387da97c
mkdir -p remote-post-o008
files=(
"src/components/estimator/builder/builderService.js|builderService.js"
"src/components/estimator/foundation/foundationSyncRecovery.js|foundationSyncRecovery.js"
"src/pages/FoundationEstimator.jsx|FoundationEstimator.jsx"
"src/components/estimator/builder/builderMutationRecovery.js|builderMutationRecovery.js"
"src/pages/EstimateDetail.jsx|EstimateDetail.jsx"
"src/components/estimator/estimateCreationService.js|estimateCreationService.js"
"src/components/estimator/builder/partSync.js|partSync.js"
)
for entry in "${files[@]}"; do
  path="${entry%%|*}"; out="${entry##*|}"
  for attempt in 1 2 3; do
    npx base44@latest sandbox read "$path" --app-id $APP --branch main --json > "remote-post-o008/${out}.pull.json" 2>/dev/null
    node -e "
      const fs=require('fs');
      try {
        const j=JSON.parse(fs.readFileSync('remote-post-o008/${out}.pull.json','utf8'));
        const c=j.files?.[0]?.content ?? j.content ?? j.file?.content;
        if (typeof c !== 'string') { console.log('FAIL ${out}: no content'); process.exit(1); }
        fs.writeFileSync('remote-post-o008/${out}', c);
        console.log('OK ${out} ' + c.length + 'B');
      } catch(e){ console.log('FAIL ${out}: '+e.message); process.exit(1); }
    " && break
    echo "retry ${out} ($attempt)"
    sleep 5
  done
done
echo "--- md5 compare vs baseline ---"
for entry in "${files[@]}"; do
  out="${entry##*|}"
  b=$(md5sum "remote-head/${out}" | cut -d' ' -f1)
  n=$(md5sum "remote-post-o008/${out}" | cut -d' ' -f1)
  [ "$b" = "$n" ] && echo "SAME  ${out}" || echo "DIFF  ${out}  (baseline $b vs now $n)"
done
