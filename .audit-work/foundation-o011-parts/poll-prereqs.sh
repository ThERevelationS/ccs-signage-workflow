#!/usr/bin/env bash
# Poll remote main until O-004 + O-030 + O-014 prerequisite transports landed.
set -u
APP=68dfcc5e57bbbc35387da97c
BASE_HEAD=3258e9b24
DEADLINE=$(( $(date +%s) + 2400 ))   # 40 min from start
CLI="npx base44@latest"

sgrep() { # sgrep <pattern> <path> [glob]
  local pat="$1" p="$2" g="${3:-}"
  if [ -n "$g" ]; then
    $CLI sandbox grep "$pat" --path "$p" --glob "$g" --app-id $APP --branch main --json 2>/dev/null
  else
    $CLI sandbox grep "$pat" --path "$p" --app-id $APP --branch main --json 2>/dev/null
  fi
}
has() { echo "$1" | grep -q '"line"'; }

check_markers() {
  local ok=1
  r=$(sgrep "foundationConstructionWarnings" "src/components/estimator/foundation" "foundationCalc.js"); has "$r" || { echo "  miss O-030: calc import"; ok=0; }
  r=$(sgrep "constructionWarnings" "src/pages" "FoundationEstimator.jsx"); has "$r" || { echo "  miss O-030: page render"; ok=0; }
  r=$(sgrep "foundationConstructionWarnings" "src/components/estimator/foundation" "foundationConstructionChecks.js"); has "$r" || { echo "  miss O-030: checks file"; ok=0; }
  r=$(sgrep "ccsFoundationLeaveGuard" "src/pages" "FoundationEstimator.jsx"); has "$r" || { echo "  miss O-004: nav guard sentinel"; ok=0; }
  r=$(sgrep "customer_markup_percent" "src/components/estimator/foundation" "foundationDraftRecovery.js"); has "$r" || { echo "  miss O-004: draft pricing fields"; ok=0; }
  r=$(sgrep "saveDisabled" "src/components/estimator/foundation" "FoundationTemplateDialog.jsx"); has "$r" || { echo "  miss O-014: dialog saveDisabled"; ok=0; }
  r=$(sgrep "does not exist" "src/components/estimator/foundation" "foundationTemplateService.js"); has "$r" || { echo "  miss O-014: service notfound"; ok=0; }
  return $(( 1 - ok ))
}

i=0
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  i=$((i+1)); ts=$(date -u +%H:%M:%S)
  log=$($CLI sandbox run --app-id $APP --branch main --json -- git log --oneline -8 2>/dev/null)
  echo "$log" > .audit-work/foundation-o011-parts/poll-last-gitlog.json
  subj=$(echo "$log" | sed -n 's/.*"stdout": "\(.*\)",*/\1/p' | sed 's/\\n/\n/g;s/"$//')
  echo "=== poll $i @ $ts ==="
  echo "$subj" | head -9
  named=$(echo "$subj" | grep -icE "O-004|O-030|O-014" || true)
  [ "$named" -gt 0 ] && echo "NAMED-COMMIT hits: $named"
  head_line=$(echo "$subj" | head -1)
  if echo "$head_line" | grep -qv "$BASE_HEAD" || [ "$named" -gt 0 ]; then
    echo "HEAD moved or named commit -> checking file markers..."
    if check_markers; then
      echo "ALL-PREREQS-PRESENT @ $ts"
      exit 0
    fi
  else
    echo "HEAD still $BASE_HEAD (baseline)"
  fi
  sleep 120
done
echo "TIMEOUT-40MIN - prerequisites not all confirmed"
exit 2
