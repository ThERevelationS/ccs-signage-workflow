# Launch the permitting scan fleet + dashboard, all DETACHED (Start-Process —
# not children of any shell session, so they survive IDE/session teardown.
# That teardown is what kept killing the fleet between sessions.)
# Usage: powershell -File scripts/start-permitting-fleet.ps1
$repo = 'C:/Users/BrettHeinlein/Documents/DevinProjects/ccs-signage-workflow-clean'
$log = "$repo/.audit-work"
New-Item -ItemType Directory -Force $log | Out-Null

function Start-Worker([string]$name, [string]$cmd) {
  $existing = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
    Where-Object { $_.CommandLine -match [regex]::Escape($cmd) }
  if ($existing) { Write-Output "$name already running (pid $($existing.ProcessId -join ','))"; return }
  Start-Process -FilePath 'node' -ArgumentList $cmd -WorkingDirectory $repo `
    -WindowStyle Hidden -RedirectStandardOutput "$log/$name.log" -RedirectStandardError "$log/$name.err.log"
  Write-Output "$name launched: $cmd"
}

$env:PERMIT_AUTO_LOGIN = '1'
# Environment for all spawned workers — each Start-Process inherits it.
[System.Environment]::SetEnvironmentVariable('PERMIT_AUTO_LOGIN', '1', 'Process')

Start-Worker 'dash-guard'        'scripts/live-serve-guard.mjs'
Start-Worker 'write-flusher'     'scripts/permitting-write-flusher.mjs --rate 35'
Start-Worker 'mirror-sync'       'scripts/permitting-mirror-sync.mjs'
# Feeder DISABLED — fixtureBusinessSearch hits Google Places API (real $$ spend).
# Start-Worker 'feeder'            'scripts/permitting-address-feeder.mjs'
# Forever-runner spawns the LOCAL resolver (Nominatim/Census + gov GIS — zero
# external spend). Nominatim is a SHARED 1-req/sec token bucket across all
# workers (cross-process mutex) — 6 workers parallelize GIS+matching around
# the serialized geocode; >8 adds nothing.
Start-Worker 'forever-runner'    'scripts/permitting-forever-runner.mjs --workers 8 --delay-ms 300'
Start-Worker 'parcel-resolver'   'scripts/permitting-parcel-resolver.mjs'
Start-Worker 'queue-hygiene'     'scripts/permitting-queue-hygiene.mjs'
Start-Worker 'seed-scan'         'scripts/permitting-office-seed-scan.mjs'
Start-Worker 'authority-verifier' 'scripts/permitting-authority-verifier.mjs --delay-ms 600'
# Watchdog DISABLED while the paid validator path is retired — it would
# respawn a Google-geocode pass as "recovery".
# Start-Worker 'watchdog'          'scripts/permitting-error-watchdog.mjs'
# Paid LLM researchers retired — replaced by the deterministic LOCAL
# researcher (site discovery + sitemap crawl + PDF evidence + directory
# parse + county fallback; zero credits, zero spend). 16 hash slices —
# research evidence is the apply-ready throttle, everything downstream
# (seed-scan → verifier) already loops. Beyond ~16 the queue empties
# faster than it refills and slices just idle.
foreach ($i in 0..15) {
  Start-Worker "local-res-$i"    "scripts/permitting-local-researcher.mjs --slice $i --slices 16"
}
# Office sweep — statewide GIS enumeration → queue/profile/locality coverage.
# All writes buffered via the outbox; pending creates tracked locally until
# the flusher lands them (locality needs the real profile.id). 4 slices,
# idempotent — a pass where everything exists finishes in seconds.
foreach ($i in 0..3) {
  Start-Worker "office-sweep-$i" "scripts/permitting-office-sweep.mjs --slice $i --slices 4 --delay-ms 800"
}
Write-Output 'fleet launch pass complete — dashboard at http://localhost:4173'
