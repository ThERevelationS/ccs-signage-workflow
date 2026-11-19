$stdin = [Console]::In.ReadToEnd() | Out-Null
# Only re-inject the estimator backlog prompt when the dedicated Signage
# Estimator session has opted in via .devin\ESTIMATOR_SESSION_ACTIVE.
# Without this flag the hook stays silent so admin/maintenance sessions in
# this repo are never hijacked into estimator work.
if (Test-Path ".devin\BACKLOG_DONE") { exit 0 }
if (-not (Test-Path ".devin\ESTIMATOR_SESSION_ACTIVE")) { exit 0 }
@{
  decision = "block"
  reason = "ESTIMATOR BACKLOG (Signage Estimator session only): Continue working ESTIMATOR_BACKLOG.md - implement the next uncovered estimator-scoped item, verify with esbuild plus the hardening suites, checkpoint, move to the next. Do not stop for status reports. Only create .devin\BACKLOG_DONE when every item is implemented or marked covered. If this session is NOT the dedicated Signage Estimator session, delete .devin\ESTIMATOR_SESSION_ACTIVE, do not touch the backlog, and stop."
} | ConvertTo-Json -Compress
