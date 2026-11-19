#!/usr/bin/env node
// Keep the host awake while the permitting fleet or dashboard is running.
// Holds ES_CONTINUOUS|ES_SYSTEM_REQUIRED|ES_DISPLAY_REQUIRED via a PowerShell
// child — while that child lives, Windows cannot sleep. The child exits (and
// the machine may sleep again) as soon as no permitting/live-serve process
// has been seen for 5 minutes.
import { execSync, spawn } from 'node:child_process';

const GRACE_MS = 5 * 60 * 1000;
const CHECK_MS = 30 * 1000;
const MATCH = /permitting-|live-serve/;

const ps = spawn('powershell', [
  '-NoProfile', '-Command',
  `Add-Type -TypeDefinition "using System; using System.Runtime.InteropServices; public static class KA { [DllImport(\\"kernel32.dll\\")] public static extern uint SetThreadExecutionState(uint esFlags); }";
   [KA]::SetThreadExecutionState(0x80000003) | Out-Null;
   Start-Sleep -Seconds 31536000`,
], { detached: false, stdio: 'ignore', windowsHide: true });
ps.on('exit', () => process.exit(0));

const anyAlive = () => {
  try {
    const raw = execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='node.exe'\\" | Select-Object -ExpandProperty CommandLine"`,
      { encoding: 'utf8', timeout: 20000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
    return raw.split('\n').some((l) => MATCH.test(l) && !l.includes('permitting-keep-awake'));
  } catch { return true; } // can't see processes -> assume busy, keep holding
};

let lastSeen = Date.now();
setInterval(() => {
  if (anyAlive()) { lastSeen = Date.now(); return; }
  if (Date.now() - lastSeen > GRACE_MS) { try { ps.kill(); } catch {} process.exit(0); }
}, CHECK_MS);
