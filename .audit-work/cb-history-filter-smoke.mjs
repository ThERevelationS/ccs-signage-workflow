import { readFileSync } from 'node:fs';

const base = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const creds = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const ids = [...new Set(readFileSync('imports/corebridge-2026-11-16/estimate-lines-done.jsonl', 'utf8')
  .split('\n').filter(Boolean).slice(0, 2).map((line) => JSON.parse(line).target_id))];
if (ids.length !== 2) throw new Error('Need two distinct estimate IDs.');
async function request(name, body) {
  const res = await fetch(`${base}/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(`${name} HTTP ${res.status}: ${result.error || result.message || 'request failed'}`);
  return result.data || result;
}
const login = await request('verifyLogin', { username: creds.user, password: creds.pass });
if (!login.token) throw new Error('Login did not return a session token.');
for (const test of [
  { name: 'equality', query: { id: ids[0] }, fields: ['id'] },
  { name: 'in-without-fields', query: { id: { $in: ids } } },
  { name: 'in-with-fields', query: { id: { $in: ids } }, fields: ['id'] },
]) {
  try {
    const result = await request('staffDataRead', {
      session_token: login.token,
      entity: 'AllInOneEstimate',
      ...test,
      limit: 10,
    });
    const found = new Set((result.items || []).map((item) => item.id));
    console.log(JSON.stringify({ test: test.name, found: found.size, allMatched: (test.name === 'equality' ? ids.slice(0, 1) : ids).every((id) => found.has(id)) }));
  } catch (error) {
    console.log(JSON.stringify({ test: test.name, error: error.message }));
    if (/fetch failed|ECONNREFUSED|abort/i.test(error.message)) throw error;
  }
}
