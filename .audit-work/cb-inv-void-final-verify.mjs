import { readFileSync, writeFileSync } from 'node:fs';

const plan = JSON.parse(readFileSync('.audit-work/cb-inv-plan.json', 'utf8'));
const creds = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const base = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function call(fn, data) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${base}/${fn}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
      signal: AbortSignal.timeout(60000),
    });
    const body = await response.json();
    if (response.status === 429 && attempt < 5) { await sleep(15000 * (attempt + 1)); continue; }
    if (!response.ok) throw new Error(`${fn} HTTP ${response.status}: ${body.error || 'request failed'}`);
    return body.data || body;
  }
}
const login = await call('verifyLogin', { username: creds.user, password: creds.pass });
if (!login.token) throw new Error('Staff login failed.');
const invoices = plan.invoices.filter((row) => row.data.status === 'void');
const differences = [];
let checked = 0;
for (let i = 0; i < invoices.length; i += 50) {
  const start = Date.now();
  const chunk = invoices.slice(i, i + 50);
  const response = await call('corebridgeHistoryImport', {
    session_token: login.token, action: 'find_by_keys', entity: 'Invoice',
    keys: chunk.map((row) => row.data.creation_request_key),
  });
  if (!response.success || !Array.isArray(response.results)) throw new Error('Void lookup returned an invalid response.');
  const byKey = new Map(response.results.map((result) => [result.key, result.matches]));
  for (const row of chunk) {
    const matches = byKey.get(row.data.creation_request_key);
    if (!Array.isArray(matches) || matches.length !== 1) {
      differences.push({ source_id: row.source_id, error: 'Missing or duplicate target.' });
      continue;
    }
    const actual = matches[0];
    const mismatch = ['status', 'amount_paid', 'balance_due'].filter((field) => actual[field] !== row.data[field]);
    if (mismatch.length) differences.push({ source_id: row.source_id, fields: mismatch });
    checked++;
  }
  if (i + 50 < invoices.length) await sleep(Math.max(0, 1600 - (Date.now() - start)));
}
const result = { planned: invoices.length, checked, differences };
writeFileSync('.audit-work/cb-inv-void-final-verify.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ planned: result.planned, checked: result.checked, differences: differences.length }));
if (differences.length || checked !== invoices.length) throw new Error('Void invoice readback differs from revised plan.');
