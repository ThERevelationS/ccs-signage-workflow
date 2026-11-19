import { permitCreds } from '../scripts/lib/permit-creds.mjs';
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const inv = async (fn, p) => fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));
const login = await inv('verifyLogin', { username: permitCreds().user, password: permitCreds().pass });
const token = (login.body?.data || login.body)?.token;
for (const fn of ['generateDocNumber', 'sessionAdminAction', 'verifySession', 'fieldHistoryAction']) {
  const r = await inv(fn, { session_token: token, action: 'list', doc_type: 'estimate' });
  console.log(fn, '->', r.status, JSON.stringify(r.body).slice(0, 220));
}
