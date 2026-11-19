$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'local-researcher' } | ForEach-Object { if ($_.CommandLine -match 'slice (\d+)') { [pscustomobject]@{Slice=[int]$matches[1]; Pid=$_.ProcessId; Created=$_.CreationDate} } }
$procs | Group-Object Slice | ForEach-Object {
  $sorted = $_.Group | Sort-Object Created
  $sorted | Select-Object -Skip 1 | ForEach-Object { Stop-Process -Id $_.Pid -Force; Write-Output ("killed dup slice " + $_.Slice + " pid " + $_.Pid) }
}
