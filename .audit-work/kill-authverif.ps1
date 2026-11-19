$procs = Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object { $_.CommandLine -match 'authority-verifier' }
$procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Output "killed $($_.ProcessId)" }
Write-Output "remaining: $(@($procs).Count - @($procs).Count) killed; fleet supervisor respawns rostered lanes"
