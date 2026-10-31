import assert from 'node:assert/strict';
import { buildSync, transformSync } from 'esbuild';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const kit = resolve(here, '../src/components/kit');

// Every primitive file must exist, compile under esbuild, and carry its
// named exports. JSX files are transform-checked (imports like react and
// @/lib/utils can't resolve under Node) — the pure models get bundled and
// imported for behavioral coverage below, same as the other test-*.mjs
// hardening suites.
const FILES = {
  'statusTones.js': ['STATUS_TONES', 'statusTone', 'statusLabel', 'TONE_CHIP_CLASSES', 'TONE_DOT_CLASSES', 'TONE_TEXT_CLASSES'],
  'recordRoutes.js': ['RECORD_ROUTES', 'recordHref', 'recordRoute', 'RECORD_KINDS'],
  'PageHeader.jsx': ['PageHeader'],
  'BreadcrumbBar.jsx': ['BreadcrumbBar'],
  'FilterBar.jsx': ['FilterBar', 'FilterSearchInput', 'FilterSelect', 'FilterField'],
  'StatusChip.jsx': ['StatusChip', 'statusTone'],
  'KpiStrip.jsx': ['KpiStrip'],
  'EmptyState.jsx': ['EmptyState'],
  'RecordLink.jsx': ['RecordLink'],
  'DataTable.jsx': ['DataTableShell', 'Tr', 'Th', 'Td'],
  'UndoToast.jsx': ['showUndo'],
  'DetailDrawer.jsx': ['DetailDrawer'],
  'index.js': [
    'PageHeader', 'BreadcrumbBar', 'FilterBar', 'FilterSearchInput', 'FilterSelect',
    'StatusChip', 'statusTone', 'KpiStrip', 'EmptyState', 'RecordLink',
    'DataTableShell', 'Th', 'Td', 'showUndo', 'DetailDrawer',
  ],
};

const exportRe = (name) =>
  new RegExp(
    `export\\s+(?:async\\s+)?(?:function|const|class|let|var)\\s+${name}\\b` +
    `|export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}` +
    `|export\\s+default\\s+${name}\\b`,
    's'
  );

for (const [file, names] of Object.entries(FILES)) {
  const path = resolve(kit, file);
  assert.ok(existsSync(path), `kit file missing: ${file}`);
  const src = readFileSync(path, 'utf8');
  const loader = file.endsWith('.jsx') ? 'jsx' : 'js';
  const out = transformSync(src, { loader });
  assert.ok(out.code.length > 0, `${file} failed to compile under esbuild`);
  for (const name of names) {
    assert.ok(exportRe(name).test(src), `${file} must export ${name}`);
  }
}

// Bundle + import the two pure models for behavioral checks.
const bundle = (entry, out) => {
  buildSync({
    entryPoints: [resolve(kit, entry)],
    bundle: true, format: 'esm', outfile: resolve(here, out), logLevel: 'silent',
  });
  return import(pathToFileURL(resolve(here, out)).href);
};
const tones = await bundle('statusTones.js', '.tmp-uikit-tones.mjs');
const routes = await bundle('recordRoutes.js', '.tmp-uikit-routes.mjs');
const { statusTone, STATUS_TONES, TONE_NAMES } = tones;
const { RECORD_ROUTES, recordHref } = routes;

// statusTone covers every real enum value in the app.
const REAL_ENUMS = {
  'product operational statuses (workOrderConversion.js)': [
    'order_review', 'site_survey', 'awaiting_customer_action',
    'awaiting_proof_approval', 'permitting', 'proof_approved',
    'design_review', 'in_design', 'in_production', 'quality_control',
    'service_repair', 'install_or_removal_only', 'vended', 'none',
  ],
  'proof statuses (PROOF_STATUS_VALUES)': [
    'none', 'draft', 'sent', 'awaiting_approval', 'approved', 'revision_requested',
  ],
  'fulfillment states (FULFILLMENT_STATE_VALUES)': [
    'none', 'awaiting_pickup', 'awaiting_installation', 'awaiting_shipping',
    'awaiting_delivery', 'picked_up', 'installed', 'shipped', 'delivered',
  ],
  'work-order stages (WO_STAGE_ORDER)': [
    'estimating', 'sales', 'permitting', 'design', 'production',
    'fabrication', 'installation', 'completed',
  ],
  'estimate statuses (estimateStatusTransitions.js)': [
    'draft', 'calculated', 'sent', 'approved', 'archived', 'cancelled',
  ],
  'invoice statuses (Invoices.jsx)': [
    'draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void',
  ],
  'purchase-order statuses (PurchaseOrders.jsx)': [
    'draft', 'sent', 'partially_received', 'received', 'cancelled',
  ],
  'CRM event outcomes (crmEventsModel.js)': [
    'completed', 'no_answer', 'left_message', 'rescheduled', 'cancelled',
  ],
};
for (const [group, statuses] of Object.entries(REAL_ENUMS)) {
  for (const s of statuses) {
    assert.ok(s in STATUS_TONES, `${group}: "${s}" missing from STATUS_TONES`);
    assert.ok(
      TONE_NAMES.includes(statusTone(s)),
      `${group}: statusTone("${s}") returned "${statusTone(s)}" — not a valid tone`
    );
  }
}

// Spot-check tone semantics: sky=in-progress, emerald=done/approved/paid,
// amber=attention/pending/partial, red=blocked/overdue/cancelled,
// slate=muted/none/draft, violet=waiting-on-customer.
const SEMANTICS = {
  in_production: 'sky', sent: 'sky', production: 'sky', rescheduled: 'sky',
  paid: 'emerald', approved: 'emerald', completed: 'emerald',
  received: 'emerald', installed: 'emerald', vended: 'emerald',
  partially_paid: 'amber', partially_received: 'amber', calculated: 'amber',
  awaiting_pickup: 'amber', revision_requested: 'amber', no_answer: 'amber',
  cancelled: 'red', overdue: 'red', void: 'red',
  draft: 'slate', none: 'slate', archived: 'slate', estimating: 'slate',
  awaiting_customer_action: 'violet', awaiting_proof_approval: 'violet',
  awaiting_approval: 'violet',
};
for (const [status, tone] of Object.entries(SEMANTICS)) {
  assert.equal(statusTone(status), tone, `statusTone("${status}") should be "${tone}"`);
}
// Unknown and blank statuses degrade to slate, never throw.
assert.equal(statusTone('never_seen_before'), 'slate');
assert.equal(statusTone(''), 'slate');
assert.equal(statusTone(null), 'slate');
assert.equal(statusTone(undefined), 'slate');
// Statuses normalize case/whitespace.
assert.equal(statusTone(' In_Production '), 'sky');

// RecordLink kind -> canonical "?param=" route.
const EXPECTED_ROUTES = {
  estimate: ['/EstimateDetail', 'id'],
  workorder: ['/JobWorkspace', 'wo'],
  invoice: ['/Invoices', 'invoice'],
  po: ['/PurchaseOrders', 'po'],
  customer: ['/Customer360', 'id'],
  opportunity: ['/Opportunities', 'open'],
};
assert.deepEqual(Object.keys(RECORD_ROUTES).sort(), Object.keys(EXPECTED_ROUTES).sort());
for (const [kind, [path, param]] of Object.entries(EXPECTED_ROUTES)) {
  assert.deepEqual([RECORD_ROUTES[kind].path, RECORD_ROUTES[kind].param], [path, param]);
  assert.equal(
    recordHref(kind, 'abc 123'),
    `${path}?${param}=abc%20123`,
    `recordHref("${kind}") must emit ${path}?${param}=`
  );
}
// Aliases and edge cases: "wo" resolves to workorder; unknown kinds and
// blank ids produce "" so callers never emit a broken href.
assert.equal(recordHref('wo', 'w1'), '/JobWorkspace?wo=w1');
assert.equal(recordHref('bogus', 'x'), '');
assert.equal(recordHref('estimate', ''), '');
assert.equal(recordHref('estimate', null), '');

rmSync(resolve(here, '.tmp-uikit-tones.mjs'), { force: true });
rmSync(resolve(here, '.tmp-uikit-routes.mjs'), { force: true });
console.log('PASS uikit');
