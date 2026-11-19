import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const output = '.audit-work/cb-customer-decisions-plan.json';
if (existsSync(output)) throw new Error('Decision plan exists; preserve it.');
const creds = JSON.parse(readFileSync('.permit-creds.json', 'utf8'));
const archive = JSON.parse(readFileSync('imports/corebridge-2026-11-16/accounts-detail.json', 'utf8')).accounts;
const decisions = [
  { accounts: [61, 2886], keep: 'The Liberty Center' },
  { accounts: [424, 2701], keep: 'PLK Communities' },
  { accounts: [1036, 2608], keep: 'Triumph Signs and Consulting, Inc.' },
  { accounts: [1926], keep: 'Cincinnati Metro / SORTA', merge: ['Cincinnati Metro/Sorta'] },
  { accounts: [488], keep: 'Lyons & Lyons Co', merge: ['Lyons & Lyons'] },
  { accounts: [1810], keep: 'Karen Montgomery', merge: ['Karen Montgomery (wedding)'] },
  { accounts: [2767], keep: 'Best Sanitizers', merge: ['Best Sanitizers (3 Registered Marks)'] },
  { accounts: [2944], keep: 'The Drunken Academy', merge: ['Drunken Academy'] },
  { accounts: [447], create: 'Skidmore', merge: ['Skidmore (47 Magnet Names)', 'Skidmore (96 x 48 Tenure Wall)'] },
  { accounts: [3284], create: 'Modern Office Method', merge: ['Modern Office Method (Lobby Sign)', 'Modern Office Method (Aluminum Box, Acrylic Letters, Clear Backer)'] },
  { accounts: [531], create: 'Towne Properties', merge: ["Towne Properties (Kable's Mill)", 'Towne Properties (Cheltenham)'] },
  { accounts: [2606], create: 'Towne Properties (Dayton)' },
];
const base = 'https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function call(fn, data) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${base}/${fn}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
      signal: AbortSignal.timeout(120000),
    });
    const body = await response.json();
    if (response.status === 429 && attempt < 5) { await sleep(15000 * (attempt + 1)); continue; }
    if (!response.ok || body.success === false) throw new Error(`${fn} HTTP ${response.status}: ${body.error || 'request failed'}`);
    return body.data || body;
  }
}
const login = await call('verifyLogin', { username: creds.user, password: creds.pass });
if (!login.token) throw new Error('Login failed.');
const session_token = login.token;
const customers = [];
for (let skip = 0; ; skip += 1000) {
  const result = await call('staffDataRead', { session_token, entity: 'Customer', sort: 'created_date', limit: 1000, skip });
  if (!Array.isArray(result.items)) throw new Error('Unexpected Customer read shape.');
  customers.push(...result.items);
  if (result.items.length < 1000) break;
  await sleep(1000);
}
if (new Set(customers.map((row) => row.id)).size !== customers.length) throw new Error('Customer pagination returned duplicate IDs.');
const ids = decisions.flatMap((row) => row.accounts.map(String));
const ledger = await call('staffDataRead', {
  session_token, entity: 'LegacyMigrationMap',
  query: { source_app_id: 'corebridge', source_entity: 'customers', source_id: { $in: ids } }, limit: 1000,
});
if (!Array.isArray(ledger.items) || ledger.items.length >= 1000) throw new Error('Unexpected customer ledger read shape.');
for (const decision of decisions) {
  decision.archive_accounts = decision.accounts.map((id) => {
    const rows = archive.filter((row) => Number(row.acct_id) === id);
    return { id, count: rows.length, company_name: rows[0]?.company_name || null };
  });
  decision.names = [decision.keep, ...(decision.merge || [])].filter(Boolean).map((name) => ({
    name, matches: customers.filter((row) => row.company_name === name).map((row) => ({ id: row.id, merged_into_customer_id: row.merged_into_customer_id || null })),
  }));
  decision.existing_create_name_matches = decision.create ? customers.filter((row) => row.company_name === decision.create).map((row) => row.id) : [];
  decision.ledger = ledger.items.filter((row) => decision.accounts.map(String).includes(String(row.source_id))).map((row) => ({ source_id: row.source_id, target_id: row.target_id, notes: row.notes }));
  decision.blockers = [
    ...decision.archive_accounts.filter((row) => row.count !== 1).map((row) => `archive account ${row.id} count ${row.count}`),
    ...decision.names.filter((row) => row.matches.length !== 1).map((row) => `${row.name}: ${row.matches.length} matches`),
    ...(decision.existing_create_name_matches.length ? [`new name ${decision.create} already exists`] : []),
    ...(decision.ledger.length ? ['existing customer ledger requires review'] : []),
    ...decision.names.flatMap((row) => row.matches.filter((match) => match.merged_into_customer_id).map(() => `${row.name} is already merged`)),
  ];
}
const previewDecision = decisions.find((row) => row.keep && row.merge?.length && !row.blockers.length);
let preview = null;
if (previewDecision) {
  const keep = previewDecision.names.find((row) => row.name === previewDecision.keep).matches[0].id;
  const lose = previewDecision.names.find((row) => row.name === previewDecision.merge[0]).matches[0].id;
  preview = await call('manageCustomerLifecycle', { session_token, action: 'preview_customer_merge', keep_id: keep, lose_id: lose });
}
const result = {
  generated_at: new Date().toISOString(), customer_count: customers.length, decisions,
  preview: preview && { ok: preview.ok, code: preview.code, linked_total: preview.linked_total, warnings: preview.warnings, entity_errors: (preview.entities || []).filter((row) => row.error) },
};
writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ customer_count: customers.length, decisions: decisions.map((row) => ({ accounts: row.accounts, blockers: row.blockers })), preview: result.preview }, null, 2));
