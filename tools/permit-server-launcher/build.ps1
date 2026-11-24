# Build CCS Permit Server.exe with the .NET Framework csc that ships with
# Windows — no SDK install. Output lands next to this script.
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
& $csc /target:winexe /platform:anycpu /optimize+ `
  /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Net.dll `
  /out:"$dir\CCS Permit Server.exe" "$dir\Launcher.cs"
if ($LASTEXITCODE -eq 0) { Write-Output "built $dir\CCS Permit Server.exe" }
