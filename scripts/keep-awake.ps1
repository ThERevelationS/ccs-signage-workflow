# Keeps Windows from sleeping/hibernating while the permit server is running or
# paused. When server-control.json says "stopped" (or the controller is gone),
# the request is cleared and normal power settings apply. The display may still
# turn off. Exits when the controller's lock file disappears for 10 minutes.
param([string]$Root = (Split-Path -Parent $PSScriptRoot))
Add-Type -Namespace Win32 -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
$ES_CONTINUOUS = [uint32]2147483648; $ES_SYSTEM_REQUIRED = [uint32]1; $ES_AWAYMODE = [uint32]64
$control = Join-Path $Root '.audit-work\server-control.json'
$lock = Join-Path $Root '.audit-work\permit-server.lock'
$pidfile = Join-Path $Root '.audit-work\keep-awake.pid'
$PID | Out-File $pidfile -Encoding ascii
$held = $null; $goneSince = $null
try {
while ($true) {
  $state = 'stopped'
  try { $state = (Get-Content $control -Raw | ConvertFrom-Json).state } catch {}
  if (-not (Test-Path $lock)) { if (-not $goneSince) { $goneSince = Get-Date } } else { $goneSince = $null }
  $want = ($state -ne 'stopped') -and (-not $goneSince)
  if ($want -ne $held) {
    if ($want) { [void][Win32.Power]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED -bor $ES_AWAYMODE) }
    else { [void][Win32.Power]::SetThreadExecutionState($ES_CONTINUOUS) }
    $held = $want
    Write-Output "$(Get-Date -Format o) keep-awake=$want state=$state"
  }
  if ($goneSince -and ((Get-Date) - $goneSince).TotalMinutes -ge 10) { break }
  Start-Sleep -Seconds 15
}
} finally {
  [void][Win32.Power]::SetThreadExecutionState($ES_CONTINUOUS)
  Remove-Item $pidfile -ErrorAction SilentlyContinue
}
