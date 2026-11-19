$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.CommandLine -match 'permitting|live-serve'}
$procs | ForEach-Object { Write-Output ("stopping " + $_.ProcessId + " " + ($_.CommandLine -replace '.*scripts\','' -replace '.*scripts/','').Substring(0,[Math]::Min(55,($_.CommandLine -replace '.*scripts[\/]','').Length))); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep 2
$left = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.CommandLine -match 'permitting|live-serve'}
Write-Output ("remaining: " + @($left).Count)
