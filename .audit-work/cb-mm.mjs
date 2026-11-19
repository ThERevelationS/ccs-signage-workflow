// Thin client for manageMigration + staffDataRead using the staff session.
import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
export const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
let token;
export async function login() { const r = await fetch(`${FN}/verifyLogin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: c.user, password: c.pass }) }).then((x) => x.json()); token = r.token; return r; }
export async function call(fn, p) { for (let a = 0; ; a++) { let r; try { r = await fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...p, session_token: token }) }); } catch (netErr) { if (a < 6) { await new Promise((s) => setTimeout(s, 5000 * (a + 1))); continue; } throw netErr; } const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = { raw: t.slice(0, 300) }; } if ((r.status === 429 || r.status >= 502) && a < 10) { await new Promise((s) => setTimeout(s, 4000 * (a + 1))); continue; } if (r.status !== 200) throw new Error(`${fn} ${r.status} ${JSON.stringify(b).slice(0, 400)}`); return b.data || b; } }
export const mm = (p) => call('manageMigration', p);
export const read = (p) => call('staffDataRead', p);
