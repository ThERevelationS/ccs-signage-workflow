param(
  [Parameter(Mandatory=$true)][ValidateSet('Stop','Hydrate','Capture')][string]$Mode,
  [string]$EventJson,
  [string]$FixtureRoot
)
$ErrorActionPreference = 'Stop'
$inEnc = [Console]::InputEncoding
$outEnc = [Console]::OutputEncoding
$pipeEnc = $OutputEncoding
try {
  [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
  $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
  if (-not $EventJson) { $EventJson = [Console]::In.ReadToEnd() }
  $ctrl = Join-Path $PSScriptRoot 'estimator-run-control.mjs'
  $args = @($ctrl, 'hook', $Mode)
  if ($FixtureRoot) { $args += @('--fixture-root', $FixtureRoot) }
  $out = $EventJson | & node @args 2>$null
  if ($out) { $out }
} catch { }
finally {
  [Console]::InputEncoding = $inEnc
  [Console]::OutputEncoding = $outEnc
  $OutputEncoding = $pipeEnc
}
exit 0
