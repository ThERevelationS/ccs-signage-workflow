// Run the installed npm npx launcher, not a cached Base44 executable.
// args: complete CLI arg array EXCLUDING the leading 'base44@latest' (wrapper adds it).
// input: optional stdin payload (bare JSON/plain body). Returns raw UTF-8 stdout.
// Throws on non-zero exit with stdout+stderr. No JSON parsing, no token handling.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const npx = path.join(process.env.ProgramFiles || 'C:/Program Files', 'nodejs/node_modules/npm/bin/npx-cli.js');

module.exports = function latest(args, input) {
  if (!Array.isArray(args)) throw new Error('latest(args): args must be an array');
  if (!fs.existsSync(npx)) throw new Error('The verified installed npm npx launcher is unavailable.');
  const opts = {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 180000,
    windowsHide: true,
  };
  if (input !== undefined && input !== null) opts.input = String(input);
  try {
    // Avoid the Windows batch shim's incorrect relative %~dp0 resolution.
    // This still performs normal npx package resolution for base44@latest.
    return execFileSync(process.execPath, [npx, 'base44@latest', ...args], opts);
  } catch (e) {
    const out = (e.stdout ?? '') + (e.stderr ?? '');
    const err = new Error(`base44@latest ${args.join(' ')} failed exit=${e.status ?? e.code ?? '?'}: ${String(out).slice(0, 800)}`);
    err.stdout = e.stdout ?? '';
    err.stderr = e.stderr ?? '';
    err.status = e.status ?? null;
    throw err;
  }
};
