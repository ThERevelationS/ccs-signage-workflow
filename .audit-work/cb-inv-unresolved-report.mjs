import { readFileSync, writeFileSync, existsSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const D = 'imports/corebridge-2026-11-16/';
const output = '.audit-work/cb-inv-unresolved.json';
if (existsSync(output)) throw new Error('Unresolved report already exists; preserve it.');
const plan = JSON.parse(readFileSync('.audit-work/cb-inv-plan.json', 'utf8'));
const review = JSON.parse(readFileSync(`${D}skipped-for-review.json`, 'utf8'));
if (!Array.isArray(review.ambiguous_customers)) throw new Error('Unexpected skipped-for-review shape.');
const reviewAccounts = new Set(review.ambiguous_customers.map((row) => String(row.acct ?? '').trim()).filter(Boolean));
const wanted = new Set(plan.missing_customers.map((row) => String(row.order_id)));
const orders = new Map();
for await (const line of createInterface({ input: createReadStream(`${D}orders/orders.jsonl`), crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  if (wanted.has(String(row.order_id))) orders.set(String(row.order_id), row.header);
}
if (orders.size !== wanted.size) throw new Error(`Missing archive headers: ${wanted.size - orders.size}`);
const creds = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const base = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
async function call(fn, data) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${base}/${fn}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
      signal: AbortSignal.timeout(60000),
    });
    const body = await res.json();
    if (res.status === 429 && attempt < 5) { await new Promise((resolve) => setTimeout(resolve, 15000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`${fn}: HTTP ${res.status}: ${body.error || 'request failed'}`);
    return body.data || body;
  }
}
const login = await call('verifyLogin', { username: creds.user, password: creds.pass });
if (!login.token) throw new Error('Staff login failed.');
const accountIds = [...new Set([...orders.values()].map((header) => String(header.AccountId ?? '').trim()).filter(Boolean))];
const byAccount = new Map();
for (let i = 0; i < accountIds.length; i += 25) {
  const ids = accountIds.slice(i, i + 25);
  const result = await call('staffDataRead', {
    session_token: login.token, entity: 'LegacyMigrationMap',
    query: { source_app_id: 'corebridge', source_entity: 'customers', source_id: { $in: ids } },
    limit: 1000,
  });
  if (!Array.isArray(result.items) || result.items.length >= 1000) throw new Error('Customer ledger lookup incomplete.');
  for (const row of result.items) {
    const key = String(row.source_id ?? '').trim();
    const target = String(row.target_id ?? '').trim();
    if (!ids.includes(key)) throw new Error('Customer ledger returned an unexpected source id.');
    if (target) {
      if (!byAccount.has(key)) byAccount.set(key, new Set());
      byAccount.get(key).add(target);
    }
  }
  if (i + 25 < accountIds.length) await new Promise((resolve) => setTimeout(resolve, 1000));
}
const details = plan.missing_customers.map((row) => {
  const header = orders.get(String(row.order_id));
  const accountId = String(header.AccountId ?? '').trim();
  const targets = [...(byAccount.get(accountId) || [])];
  return {
    order_id: String(row.order_id),
    invoice_number: row.invoice_number,
    AccountId: accountId,
    CompanyName: header.CompanyName || '',
    ledger_hit: targets.length === 1 ? targets[0] : null,
    in_skipped_for_review: reviewAccounts.has(accountId),
    ...(targets.length > 1 ? { multiple_ledger_targets: targets } : {}),
  };
});
const summary = {
  invoices: details.length,
  distinct_accounts: accountIds.length,
  ledger_hit: details.filter((row) => row.ledger_hit).length,
  no_ledger_hit: details.filter((row) => !row.ledger_hit && !row.multiple_ledger_targets).length,
  multiple_targets: details.filter((row) => row.multiple_ledger_targets).length,
  error_sentinel_hits: details.filter((row) => row.ledger_hit === '__error__').length,
  skipped_for_review: details.filter((row) => row.in_skipped_for_review).length,
  ledger_hit_and_skipped: details.filter((row) => row.ledger_hit && row.in_skipped_for_review).length,
};
writeFileSync(output, JSON.stringify({ summary, rows: details }, null, 2));
console.log(JSON.stringify(summary, null, 2));
