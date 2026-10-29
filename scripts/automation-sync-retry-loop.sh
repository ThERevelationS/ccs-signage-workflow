#!/bin/bash
# 4-hour Base44 sandbox sync retry loop — automation record-domain phase.
# Pushes each pending file via stdin write, then verifies remote markers with
# `sandbox run grep`. When all files verify: runs the honesty suite + build,
# then creates the named checkpoint.
cd /c/Users/BrettHeinlein/Documents/DevinProjects/ccs-signage-workflow-clean
export PATH="/c/Program Files/nodejs:$PATH"
APP=68dfcc5e57bbbc35387da97c
DEADLINE=$(( $(date +%s) + 14400 ))
LOG=scripts/automation-sync-retry.log

say() { echo "$(date '+%H:%M:%S') $*" | tee -a "$LOG"; }

# file|local-marker|remote-verify-grep
SPECS=(
  "src/components/workflow/NotificationService.jsx|record: extraData|record: extraData"
  "src/components/permitting/jurisdictionPersistence.js|jurisdiction_profile_created|jurisdiction_profile_created"
  "src/components/timeclock/FaceEnrollmentDialog.jsx|user_face_enrolled|user_face_enrolled"
  "src/components/admin/UserManagement.jsx|user_role_changed|user_role_changed"
  "scripts/test-admin-automation-honesty.mjs|recordEmitters|recordEmitters"
)

declare -A DONE
CYCLE=0
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  CYCLE=$((CYCLE+1))
  for spec in "${SPECS[@]}"; do
    IFS='|' read -r file lmarker rgrep <<< "$spec"
    [ "${DONE[$file]}" = "yes" ] && continue
    if ! grep -q "$lmarker" "$file"; then
      say "WARN $file lost local marker '$lmarker' — skipping (stale buffer?)"
      DONE[$file]=lost
      continue
    fi
    cat "$file" | timeout 100 npx -y base44@latest sandbox write "$file" --overwrite --app-id $APP --branch main --json 2>/dev/null | grep -q '"success": *true' \
      && say "write ack: $file" || say "write n/a: $file"
  done

  sleep 20
  for spec in "${SPECS[@]}"; do
    IFS='|' read -r file lmarker rgrep <<< "$spec"
    [ "${DONE[$file]}" = "yes" ] && continue
    if timeout 90 npx -y base44@latest sandbox read "$file" --app-id $APP --branch main --json 2>/dev/null | grep -q "$rgrep"; then
      say "VERIFIED $file"
      DONE[$file]=yes
    fi
  done

  PENDING=0
  for spec in "${SPECS[@]}"; do
    IFS='|' read -r file _ <<< "$spec"
    [ "${DONE[$file]}" = "yes" ] || PENDING=$((PENDING+1))
  done
  [ "$PENDING" -eq 0 ] && { say "ALL FILES VERIFIED after cycle $CYCLE"; break; }
  say "cycle $CYCLE done, $PENDING unverified, sleeping 120s"
  sleep 120
done

PENDING=0
for spec in "${SPECS[@]}"; do
  IFS='|' read -r file _ <<< "$spec"
  [ "${DONE[$file]}" = "yes" ] || PENDING=$((PENDING+1))
done

if [ "$PENDING" -eq 0 ]; then
  say "running honesty suite + build"
  timeout 300 npx -y base44@latest sandbox run --app-id $APP --branch main --json "node scripts/test-admin-automation-honesty.mjs" 2>&1 | tail -6 | tee -a "$LOG"
  timeout 600 npx -y base44@latest sandbox run --app-id $APP --branch main --json "npm run build" 2>&1 | tail -6 | tee -a "$LOG"
  sleep 60
  timeout 120 npx -y base44@latest sandbox checkpoint --name "Automation: Pending Import/User/Jurisdiction/Report record events" --app-id $APP --branch main --json 2>&1 | tail -4 | tee -a "$LOG"
else
  say "ENDED with $PENDING unverified"
fi
say "LOOP EXIT"
