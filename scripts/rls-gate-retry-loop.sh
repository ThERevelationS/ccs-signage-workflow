#!/bin/bash
# Retries entity RLS writes until markers verify remotely, then checkpoints.
cd /c/Users/BrettHeinlein/Documents/DevinProjects/ccs-signage-workflow-clean
export PATH="/c/Program Files/nodejs:$PATH"
APP=68dfcc5e57bbbc35387da97c
DEADLINE=$(( $(date +%s) + 7200 ))
LOG=scripts/rls-gate-retry.log
say() { echo "$(date '+%H:%M:%S') $*" | tee -a "$LOG"; }

SPECS=(
  "base44/entities/PendingImport.jsonc|__admin_settings_backend_only__"
  "base44/entities/CustomerContact.jsonc|__admin_settings_backend_only__"
  "base44/entities/CustomerSummary.jsonc|__admin_settings_backend_only__"
  "base44/entities/SaveColor.jsonc|__admin_settings_backend_only__"
  "base44/entities/PartTemplate.jsonc|__admin_settings_backend_only__"
  "base44/entities/ProjectTemplate.jsonc|__admin_settings_backend_only__"
  "base44/entities/EstimateClipboardItem.jsonc|__admin_settings_backend_only__"
  "base44/entities/_CheckpointMistake.jsonc|__disabled_noop__"
  "base44/entities/_noop.jsonc|__disabled_noop__"
  "base44/entities/__noop__.jsonc|__disabled_noop__"
)

declare -A DONE
CYCLE=0
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  CYCLE=$((CYCLE+1))
  for spec in "${SPECS[@]}"; do
    IFS='|' read -r file marker <<< "$spec"
    [ "${DONE[$file]}" = "yes" ] && continue
    grep -q "$marker" "$file" || { say "WARN $file missing local marker"; DONE[$file]=lost; continue; }
    cat "$file" | timeout 60 npx -y base44@latest sandbox write "$file" --overwrite --app-id $APP --branch main --json 2>/dev/null | grep -q '"bytesWritten"' \
      && say "write ack: $file" || say "write n/a: $file"
  done
  sleep 15
  for spec in "${SPECS[@]}"; do
    IFS='|' read -r file marker <<< "$spec"
    [ "${DONE[$file]}" = "yes" ] && continue
    timeout 45 npx -y base44@latest sandbox read "$file" --app-id $APP --branch main --json 2>/dev/null | grep -q "$marker" \
      && { say "VERIFIED $file"; DONE[$file]=yes; }
  done
  PENDING=0
  for spec in "${SPECS[@]}"; do IFS='|' read -r f _ <<< "$spec"; [ "${DONE[$f]}" = "yes" ] || PENDING=$((PENDING+1)); done
  [ "$PENDING" -eq 0 ] && { say "ALL VERIFIED cycle $CYCLE"; break; }
  say "cycle $CYCLE: $PENDING unverified, sleeping 90s"
  sleep 90
done

if [ "$PENDING" -eq 0 ]; then
  timeout 120 npx -y base44@latest sandbox checkpoint --name "Admin audit: gate unwritten entity writes (RLS backend-only)" --app-id $APP --branch main --json 2>&1 | tail -4 | tee -a "$LOG"
else
  say "ENDED with $PENDING unverified"
fi
say "LOOP EXIT"
