import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseAccount } from './lib/accountParser.mjs';

const pages = 'D:/DevinProjects/cb-sync-runs/account-pages';
const archive = 'D:/DevinProjects/ccs-signage-workflow-clean/imports/corebridge-2026-11-16/accounts-detail.json';
if (!existsSync(pages) || !existsSync(archive)) {
  console.log('SKIP local account parity: private pages or archive unavailable');
} else {
  const accounts = new Map(JSON.parse(readFileSync(archive, 'utf8')).accounts.map((account) => [account.acct_id, account]));
  const safe = new Set(['acct_id', 'date_created', 'account_status', 'tax_exempt', 'require_po', 'opt_out_statement',
    'credit_limit', 'credit_balance', 'in_store_credit', 'balance_due', 'primary_contact_id', 'billing_contact_id']);
  const totals = new Map();
  let checked = 0, different = 0, unexpected = 0;
  const files = readdirSync(pages).map((file) => ({ file, id: Number(file.match(/^account-(\d+)\.html$/)?.[1]) }))
    .filter(({ id }) => accounts.has(id)).sort((a, b) => a.id - b.id);
  for (const { file, id } of files) {
    const expected = accounts.get(id);
    const actual = parseAccount(readFileSync(join(pages, file), 'utf8'), id);
    const fields = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].filter((key) =>
      JSON.stringify(expected[key]) !== JSON.stringify(actual[key]));
    checked++;
    if (!fields.length) continue;
    different++;
    for (const field of fields) totals.set(field, (totals.get(field) || 0) + 1);
    const details = fields.map((field) => {
      let reason = '';
      if (id === 4 && field === 'contacts_raw' && actual.contacts_raw.length === expected.contacts_raw.length + 3 &&
          expected.contacts_raw.every((item) => actual.contacts_raw.includes(item))) {
        reason = `verified drift: ${expected.contacts_raw.length} archive entries retained, 3 added`;
      } else if ([531, 2420].includes(id) && field === 'tax_group' &&
          expected.tax_group === 'Ohio - Warren County (6.7500%)' && actual.tax_group === 'Ohio - Warren County (7.2500%)') {
        reason = 'verified drift: Ohio - Warren County 6.7500% -> 7.2500%';
      }
      if (!reason) unexpected++;
      const values = safe.has(field) ? `=${JSON.stringify(expected[field])}->${JSON.stringify(actual[field])}` : '';
      return `${field}${values} (${reason || 'unclassified difference'})`;
    });
    console.log(`Account ${id}: ${details.join(', ')}`);
  }
  console.log(`Account parity: ${checked} pages; ${different} differ; ${unexpected} unclassified fields; by field: ${JSON.stringify(Object.fromEntries(totals))}`);
  if (unexpected) process.exitCode = 1;
}
