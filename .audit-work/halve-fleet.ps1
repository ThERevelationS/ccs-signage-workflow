$repo='D:\DevinProjects\ccs-signage-workflow-clean'
$log="$repo\.audit-work"
# kill all 16 researchers + forever-runner (its resolver children die with it)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.CommandLine -match 'local-researcher|forever-runner|local-resolver'} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep 3
# respawn 8 researchers covering 1/8 slices each — full hash coverage at half the procs
foreach($i in 0..7){ Start-Process -FilePath 'node' -ArgumentList "scripts/permitting-local-researcher.mjs --slice $i --slices 8" -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput "$log\local-res-$i.log" -RedirectStandardError "$log\local-res-$i.err.log"; Write-Output "local-res-$i up (of 8)" }
# forever-runner with 4 resolver workers instead of 8
Start-Process -FilePath 'node' -ArgumentList 'scripts/permitting-forever-runner.mjs --workers 4 --delay-ms 300' -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput "$log\forever-runner.log" -RedirectStandardError "$log\forever-runner.err.log"
Write-Output "forever-runner up (workers 4)"
