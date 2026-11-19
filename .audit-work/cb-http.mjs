// Node-side CoreBridge reader using the saved browser session (read-only GET/POST "Get*" calls).
import { readFileSync } from 'node:fs';
const st = JSON.parse(readFileSync('.playwright-mcp/cb-session.json', 'utf8'));
const cookie = st.cookies.filter((c) => /corebridge\.net$/.test(c.domain.replace(/^\./, '')) || c.domain.includes('corebridge')).map((c) => `${c.name}=${c.value}`).join('; ');
export const BASE = 'https://cincinnaticustom.corebridge.net';
export async function get(path, tries = 4) {
  for (let a = 0; ; a++) {
    try { const r = await fetch(BASE + path, { headers: { cookie, 'user-agent': 'Mozilla/5.0' }, redirect: 'manual' }); if (r.status >= 300 && r.status < 400) throw new Error('REDIRECT ' + r.headers.get('location')); const t = await r.text(); return { status: r.status, text: t }; }
    catch (e) { if (a >= tries || /REDIRECT/.test(e.message)) throw e; await new Promise((s) => setTimeout(s, 2000 * (a + 1))); }
  }
}
export async function post(path, body, tries = 4) {
  for (let a = 0; ; a++) {
    try { const r = await fetch(BASE + path, { method: 'POST', headers: { cookie, 'content-type': 'application/json; charset=utf-8', 'user-agent': 'Mozilla/5.0' }, body: JSON.stringify(body), redirect: 'manual' }); if (r.status >= 300 && r.status < 400) throw new Error('REDIRECT ' + r.headers.get('location')); const t = await r.text(); return { status: r.status, text: t }; }
    catch (e) { if (a >= tries || /REDIRECT/.test(e.message)) throw e; await new Promise((s) => setTimeout(s, 2000 * (a + 1))); }
  }
}
