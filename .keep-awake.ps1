# Keeps Windows awake while the permitting scan runs.
# SetThreadExecutionState flags persist for the life of THIS process —
# kill the process and sleep behavior returns to normal automatically.
$src = 'using System;using System.Runtime.InteropServices;public class Wake{[DllImport("kernel32.dll")]public static extern uint SetThreadExecutionState(uint f);}'
Add-Type -TypeDefinition $src -Language CSharp
# ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
[Wake]::SetThreadExecutionState(0x80000003) | Out-Null
while ($true) { Start-Sleep 300 }
