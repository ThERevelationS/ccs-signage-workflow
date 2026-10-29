$stdin = [Console]::In.ReadToEnd() | Out-Null
if (Test-Path ".devin\BACKLOG_DONE") { exit 0 }
@{
  decision = "block"
  reason = "Continue working ESTIMATOR_BACKLOG.md - implement the next uncovered estimator-scoped item, verify with esbuild plus the hardening suites, checkpoint, move to the next. Do not stop for status reports. Only create .devin\BACKLOG_DONE when every item is implemented or marked covered."
} | ConvertTo-Json -Compress
