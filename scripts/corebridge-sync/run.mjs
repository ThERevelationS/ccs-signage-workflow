import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadCredentials, loginCoreBridge } from './auth.mjs';
import { AppClient } from './lib/app-client.mjs';
import { fetchAccount } from './lib/accountSource.mjs';
import { captureOrder, loadOrderReferences } from './lib/order-capture.mjs';
import { runSync } from './lib/sync-engine.mjs';

function argumentsOf(args) {
  const options = { apply: false, maxAccounts: 200, maxOrders: 500, report: '', captureFixture: '' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--max-accounts' || arg === '--max-orders' || arg === '--report' || arg === '--capture-fixture') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${arg} requires a value.`);
      const value = args[++i];
      if (arg === '--max-accounts') options.maxAccounts = Number(value);
      if (arg === '--max-orders') options.maxOrders = Number(value);
      if (arg === '--report') options.report = value;
      if (arg === '--capture-fixture') options.captureFixture = value;
    } else if (arg === '--help') {
      options.help = true;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function markdown(report) {
  const clients = report.clients.map((item) => `- ${item.name} (${item.id}): ${item.action}`).join('\n') || '- None';
  const estimates = report.estimates.map((item) => `- ${item.number || `Order ${item.order_id}`}: ${item.action}`).join('\n') || '- None';
  const invoices = report.invoices.map((item) => `- ${item.number}: ${item.action}`).join('\n') || '- None';
  const skipped = report.skipped.map((item) => `- ${item.reason}: ${item.order_id || item.account_id || item.workorder_id || item.key || ''}` +
    `${item.name ? ` (${item.name})` : ''}${item.candidate_customer_ids?.length ? `; candidates: ${item.candidate_customer_ids.join(', ')}` : ''}`).join('\n') || '- None';
  const warnings = report.warnings.map((item) => `- ${item}`).join('\n') || '- None';
  const errors = report.errors.map((item) => `- ${item}`).join('\n') || '- None';
  return `# CoreBridge weekly sync (${report.mode})\n\n` +
    `- Cursor before: ${JSON.stringify(report.cursor_before)}\n- Cursor after: ${JSON.stringify(report.cursor_after)}\n` +
    `- Clients: ${report.clients.length}; contacts: ${report.contacts.length}; addresses: ${report.addresses.length}; estimates: ${report.estimates.length}; invoices: ${report.invoices.length}; transactions: ${report.transactions.length}; ` +
    `watched changes: ${report.watched_changes.length}; pipeline links: ${report.pipeline_links.length}\n\n` +
    `## Clients\n${clients}\n\n## Estimates\n${estimates}\n\n## Invoices\n${invoices}\n\n` +
    `## Skipped / ambiguous\n${skipped}\n\n## Warnings\n${warnings}\n\n## Errors\n${errors}\n`;
}

try {
  const options = argumentsOf(process.argv.slice(2));
  if (options.help) {
    console.log('node scripts/corebridge-sync/run.mjs [--apply] [--max-accounts N] [--max-orders N] [--report path] [--capture-fixture dir]');
  } else {
    if (!Number.isSafeInteger(options.maxAccounts) || options.maxAccounts < 1 || !Number.isSafeInteger(options.maxOrders) || options.maxOrders < 1) {
      throw new Error('Safety caps must be positive integers.');
    }
    const credentials = loadCredentials();
    if (!credentials.corebridge || !credentials.app) throw new Error('CoreBridge and CCS staff credentials are required.');
    let session, references;
    try { session = await loginCoreBridge({ username: credentials.corebridge.user, password: credentials.corebridge.pass }); }
    catch (error) { throw new Error(`CoreBridge login: ${error.message}`, { cause: error }); }
    try { references = await loadOrderReferences(session); }
    catch (error) { throw new Error(`CoreBridge reference loading: ${error.message}`, { cause: error }); }
    const app = new AppClient();
    await app.login(credentials.app);
    const report = await runSync({
      app, capture: (id) => captureOrder(session, id), references, apply: options.apply,
      maxAccounts: options.maxAccounts, maxOrders: options.maxOrders, captureFixture: options.captureFixture || null,
      fetchAccount: (id, options) => fetchAccount(session, id, options),
    });
    const md = markdown(report);
    console.log(md);
    if (options.report) {
      const file = resolve(options.report);
      await writeFile(file, JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
      await writeFile(`${file}.md`, md, { encoding: 'utf8', mode: 0o600 });
    }
    if (report.errors.length) process.exitCode = 1;
  }
} catch (error) {
  console.error(error?.message || 'CoreBridge sync failed.');
  process.exitCode = 1;
}
