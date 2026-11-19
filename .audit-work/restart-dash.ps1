$repo='D:\DevinProjects\ccs-signage-workflow-clean'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.CommandLine -match 'live-serve\.tmp'} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep 2
[System.Environment]::SetEnvironmentVariable('DASH_PORT','4174','Process')
Start-Process -FilePath 'node' -ArgumentList 'scripts/live-serve.tmp.mjs' -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput "$repo\.audit-work\live-serve.log" -RedirectStandardError "$repo\.audit-work\live-serve.err.log"
Start-Sleep 3
(Invoke-WebRequest -Uri 'http://localhost:4174/status.json' -UseBasicParsing -TimeoutSec 8).StatusCode
