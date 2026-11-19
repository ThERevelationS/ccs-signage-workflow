import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-master-account.mjs');
buildSync({
  entryPoints: [resolve(here, '../src/components/customer360/masterAccountModel.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const { buildAccountTree, rollupMasterAccount, customerDisplayPath, isActiveJob } =
  await import(pathToFileURL(out).href);

// Fixture: master M → children A, B → grandchild C under A. D is an orphan.
const customers = [
  { id: 'M', company_name: 'Master Corp' },
  { id: 'A', company_name: 'Alpha Child', master_account_id: 'M' },
  { id: 'B', company_name: 'Beta Child', master_account_id: 'M' },
  { id: 'C', company_name: 'Gamma Grand', master_account_id: 'A' },
  { id: 'D', company_name: 'Delta Orphan' },
  { id: 'X', company_name: 'Dangling', master_account_id: 'nope' },
];

// --- buildAccountTree ---------------------------------------------------------
{
  const t = buildAccountTree(customers);
  assert.equal(t.byId.size, 6);
  // Roots: master, orphan, and the dangling-parent account (missing parent → root).
  assert.deepEqual(t.roots.map((n) => n.id), ['M', 'D', 'X']);
  // Direct children only under the master.
  assert.deepEqual((t.childrenById.get('M') || []).map((n) => n.id), ['A', 'B']);
  assert.deepEqual((t.childrenById.get('A') || []).map((n) => n.id), ['C']);
  assert.equal(t.childrenById.get('D'), undefined);
  // Depth/flags: grandchild resolves depth 2; nothing here is cyclic.
  assert.equal(t.byId.get('C').depth, 2);
  assert.equal(t.byId.get('A').depth, 1);
  assert.equal(t.byId.get('M').cycle, false);
  assert.equal(t.byId.get('X').parentId, null, 'dangling master id resolves to root');
  // Blank-ish inputs stay safe.
  const empty = buildAccountTree();
  assert.deepEqual(empty.roots, []);
  assert.equal(empty.byId.size, 0);
  // Rows without an id, null rows and deleted rows never enter the tree.
  const t2 = buildAccountTree([{ company_name: 'no id' }, null, { id: 'z', deleted: true }, { id: 'k', company_name: 'K' }]);
  assert.equal(t2.byId.size, 1);
  assert.deepEqual(t2.roots.map((n) => n.id), ['k']);
}

// --- cycle detection ----------------------------------------------------------
{
  // Self-parent → cyclic root.
  const self = buildAccountTree([{ id: 's', company_name: 'Self', master_account_id: 's' }]);
  assert.equal(self.roots.length, 1);
  assert.equal(self.byId.get('s').cycle, true);
  assert.equal(self.byId.get('s').parentId, null);
  // Two-node loop: both accounts surface as cyclic roots; neither is lost.
  const loop = buildAccountTree([
    { id: 'p', company_name: 'P', master_account_id: 'q' },
    { id: 'q', company_name: 'Q', master_account_id: 'p' },
  ]);
  assert.equal(loop.byId.get('p').cycle, true);
  assert.equal(loop.byId.get('q').cycle, true);
  assert.equal(loop.roots.length, 2);
  // Three-node loop + an innocent child pointing into it: only the loop
  // members are flagged; the child keeps its parent edge under the cyclic node.
  const tri = buildAccountTree([
    { id: 'l1', company_name: 'L1', master_account_id: 'l3' },
    { id: 'l2', company_name: 'L2', master_account_id: 'l1' },
    { id: 'l3', company_name: 'L3', master_account_id: 'l2' },
    { id: 'kid', company_name: 'Kid', master_account_id: 'l2' },
  ]);
  assert.equal(tri.byId.get('l1').cycle, true);
  assert.equal(tri.byId.get('l2').cycle, true);
  assert.equal(tri.byId.get('l3').cycle, true);
  assert.equal(tri.byId.get('kid').cycle, false, 'child pointing into a loop is not itself cyclic');
  assert.equal(tri.byId.get('kid').parentId, 'l2');
  assert.deepEqual((tri.childrenById.get('l2') || []).map((n) => n.id), ['kid']);
  // Rollup over a cyclic master still terminates and counts only the master.
  const rc = rollupMasterAccount({ masterId: 'p', customers: [
    { id: 'p', company_name: 'P', master_account_id: 'q' },
    { id: 'q', company_name: 'Q', master_account_id: 'p' },
  ], workOrders: [{ id: 'w1', customer_id: 'p' }, { id: 'w2', customer_id: 'q' }] });
  assert.deepEqual(rc.members.map((m) => m.id), ['p']);
  assert.equal(rc.totals.jobCount, 1, 'severed loop → other account is not a descendant');
}

// --- rollupMasterAccount totals ----------------------------------------------
{
  const workOrders = [
    { id: 'w1', customer_id: 'M', current_stage: 'production' },                  // active
    { id: 'w2', customer_id: 'A', current_stage: 'installation' },                // active
    { id: 'w3', customer_id: 'C', current_stage: 'completed', completed: true },  // done
    { id: 'w4', customer_id: 'B', sales_status: 'lost' },                         // lost
    { id: 'w5', customer_id: 'D' },                                               // not a member
    { id: 'w6', customer_id: 'M', deleted: true },                                // deleted
  ];
  const invoices = [
    { id: 'i1', customer_id: 'M', status: 'sent', total: 100, amount_paid: 40, balance_due: 60 },
    { id: 'i2', customer_id: 'A', status: 'partially_paid', total: 200, amount_paid: 50, balance_due: 150 },
    { id: 'i3', customer_id: 'C', status: 'sent', total: 70 },                    // no balance_due → total−paid = 70 open
    { id: 'i4', customer_id: 'B', status: 'paid', total: 90, amount_paid: 90, balance_due: 0 },
    { id: 'i5', customer_id: 'M', status: 'void', total: 500, balance_due: 500 }, // void excluded
    { id: 'i6', customer_id: 'D', status: 'sent', total: 999, balance_due: 999 }, // not a member
    { id: 'i7', customer_id: 'A', status: 'draft', total: 25, balance_due: 25, deleted: true }, // deleted excluded
  ];
  const payments = [
    { id: 'p1', customer_id: 'M', status: 'recorded', amount: 40 },
    { id: 'p2', customer_id: 'A', status: 'recorded', amount: 50 },
    { id: 'p3', customer_id: 'A', status: 'void', amount: 999 },                  // void excluded
  ];
  const contacts = [
    { id: 'ct1', customer_id: 'M', first_name: 'Pat' },
    { id: 'ct2', customer_id: 'C', first_name: 'Sam' },
    { id: 'ct3', customer_id: 'D', first_name: 'Out' },
    { id: 'ct4', customer_id: 'A', first_name: 'Gone', deleted: true },
  ];
  const r = rollupMasterAccount({ masterId: 'M', customers, workOrders, invoices, payments, contacts });
  assert.equal(r.customer.id, 'M');
  assert.deepEqual(r.children.map((n) => n.id), ['A', 'B'], 'children are direct only');
  assert.deepEqual(r.members.map((m) => m.id), ['M', 'A', 'B', 'C'], 'members = master + all descendants, BFS (guard)');
  // openBalance: 60 (M) + 150 (A) + 70 (C fallback) = 280; paid/void/deleted/foreign excluded.
  assert.equal(r.totals.openBalance, 280);
  // invoicedTotal: 100 + 200 + 70 + 90 = 460 (void i5, foreign i6, deleted i7 excluded).
  assert.equal(r.totals.invoicedTotal, 460);
  // paidTotal: invoice.amount_paid is authoritative → 40 + 50 + 90 = 180.
  assert.equal(r.totals.paidTotal, 180);
  // jobCount counts member WOs (incl. completed/lost) = w1,w2,w3,w4 → 4.
  assert.equal(r.totals.jobCount, 4);
  // activeJobCount excludes completed-stage, completed flag and lost → w1,w2 → 2.
  assert.equal(r.totals.activeJobCount, 2);
  // contacts grouped per member id; foreign and deleted contacts excluded.
  assert.deepEqual(r.contactsByCustomer.get('M').map((c) => c.id), ['ct1']);
  assert.deepEqual(r.contactsByCustomer.get('C').map((c) => c.id), ['ct2']);
  assert.deepEqual(r.contactsByCustomer.get('B'), []);
  assert.equal(r.contactsByCustomer.has('D'), false, 'non-member customers get no bucket');
  // paidTotal falls back to the payments list when invoices carry no applied amounts.
  const r2 = rollupMasterAccount({
    masterId: 'M',
    customers: [{ id: 'M', company_name: 'M' }],
    invoices: [{ id: 'i', customer_id: 'M', status: 'sent', total: 80, balance_due: 80 }],
    payments: [{ id: 'p', customer_id: 'M', status: 'recorded', amount: 30 }],
  });
  assert.equal(r2.totals.paidTotal, 30, 'payments fallback when invoices show no paid amount');
}

// --- customerDisplayPath ------------------------------------------------------
{
  const t = buildAccountTree(customers);
  assert.equal(customerDisplayPath(customers[3], t.byId), 'Master Corp › Alpha Child › Gamma Grand');
  assert.equal(customerDisplayPath(customers[2], t.byId), 'Master Corp › Beta Child');
  assert.equal(customerDisplayPath(customers[0], t.byId), 'Master Corp');
  // Accepts a tree node directly, and tolerates customers absent from the map.
  assert.equal(customerDisplayPath(t.byId.get('C'), t.byId), 'Master Corp › Alpha Child › Gamma Grand');
  assert.equal(customerDisplayPath({ id: 'zz', company_name: 'Lone' }, t.byId), 'Lone');
  assert.equal(customerDisplayPath(null, t.byId), 'Unnamed customer');
  // Cyclic maps still terminate (hand-built parent edge, not severed).
  const cyclicById = new Map([
    ['a', { id: 'a', customer: { company_name: 'A' }, parentId: 'b' }],
    ['b', { id: 'b', customer: { company_name: 'B' }, parentId: 'a' }],
  ]);
  assert.equal(customerDisplayPath({ id: 'a', company_name: 'A' }, cyclicById), 'B › A');
}

// --- empty / single / unknown-master cases ------------------------------------
{
  const r = rollupMasterAccount({ masterId: 'ghost', customers });
  assert.equal(r.customer, null);
  assert.deepEqual(r.children, []);
  assert.deepEqual(r.totals, { openBalance: 0, invoicedTotal: 0, paidTotal: 0, jobCount: 0, activeJobCount: 0 });
  assert.equal(r.contactsByCustomer.size, 0);
  // Single-account rollup: master with no children still totals its own rows.
  const single = rollupMasterAccount({
    masterId: 'D',
    customers,
    workOrders: [{ id: 'w5', customer_id: 'D' }],
    invoices: [{ id: 'i6', customer_id: 'D', status: 'sent', total: 999, balance_due: 999 }],
  });
  assert.deepEqual(single.members.map((m) => m.id), ['D']);
  assert.equal(single.totals.openBalance, 999);
  assert.equal(single.totals.jobCount, 1);
  assert.equal(single.totals.activeJobCount, 1);
  // All-empty inputs.
  const bare = rollupMasterAccount({});
  assert.equal(bare.customer, null);
  assert.equal(bare.totals.jobCount, 0);
  // isActiveJob standalone checks (workflow-queue parity).
  assert.equal(isActiveJob({ current_stage: 'production' }), true);
  assert.equal(isActiveJob({ current_stage: 'completed' }), false);
  assert.equal(isActiveJob({ completed: true }), false);
  assert.equal(isActiveJob({ sales_status: 'lost' }), false);
}

rmSync(out, { force: true });
console.log('PASS master-account');
