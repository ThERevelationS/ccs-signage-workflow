param([string]$FixtureRoot)
# Only re-inject the estimator masterplan prompt when the dedicated
# orchestrator session has opted in via .devin\MASTERPLAN_SESSION_ACTIVE.
# Without this flag the hook stays silent so other sessions in this repo
# are never hijacked into orchestrator work.
try {
  $helper = Join-Path $PSScriptRoot 'estimator-run-control.ps1'
  if ($FixtureRoot) { & powershell -NoProfile -ExecutionPolicy Bypass -File $helper -Mode Stop -FixtureRoot $FixtureRoot }
  else { & powershell -NoProfile -ExecutionPolicy Bypass -File $helper -Mode Stop }
} catch { }
exit 0
