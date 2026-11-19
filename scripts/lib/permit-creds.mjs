// MP-7.3 — secrets hygiene. Credential order:
//   1. PERMIT_USER / PERMIT_PASS env vars
//   2. .permit-creds.json (gitignored) {"user":"...","pass":"..."}
// No literals live in source — rotating the password = one file, zero edits.
import { readFileSync, existsSync } from 'node:fs';
export function permitCreds() {
  const u = process.env.PERMIT_USER, p = process.env.PERMIT_PASS;
  if (u && p) return { user: u, pass: p };
  try {
    if (existsSync('.permit-creds.json')) {
      const j = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
      if (j.user && j.pass) return j;
    }
  } catch {}
  return { user: process.env.PERMIT_USER || '', pass: process.env.PERMIT_PASS || '' };
}
