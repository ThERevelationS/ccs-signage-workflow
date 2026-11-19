import { permitCreds } from '../scripts/lib/permit-creds.mjs';
const FN = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const inv = async (fn, p) => fetch(`${FN}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));
const login = await inv('verifyLogin', { username: permitCreds().user, password: permitCreds().pass });
const token = (login.body?.data || login.body)?.token;
const user = (login.body?.data || login.body)?.user;
console.log('user role:', user?.role, 'email:', user?.email, 'is_full_admin:', user?.is_full_admin);
const list = await inv('sessionAdminAction', { action: 'list', session_token: token });
console.log('list:', list.status, JSON.stringify(list.body).slice(0, 500));
