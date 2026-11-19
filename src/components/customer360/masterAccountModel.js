// Pure helpers for the Customer 360 "master account" rollup — no React, no IO.
// This file is esbuild-bundled and unit-tested under plain Node by
// scripts/test-master-account.mjs.
//
// Data contract (base44/entities/Customer.jsonc):
//   Customer.master_account_id — id of the parent Customer this record rolls
//     up to (CoreBridge "Master Account" link). It is the source of truth.
//   Customer.master_account    — denormalized display label for the parent.
// Linked rows key the account by customer_id:
//   WorkOrder.customer_id, Invoice.customer_id, Payment.customer_id,
//   CustomerContact.customer_id.
//
// Aggregation conventions mirror customer360Model.computeTotals: live rows
// exclude deleted===true, invoices/payments exclude status "void", invoice
// money comes from total / amount_paid / balance_due, and `paid` prefers the
// server-stamped invoice.amount_paid with a payments-list fallback.

import { clean, num, money, customerName } from "./customer360Model";

const liveRows = (rows) =>
  (Array.isArray(rows) ? rows : []).filter((r) => r && r.deleted !== true);

// Active-job taxonomy mirrors the shared workflow queues (MainWorkflow.jsx,
// MyWorkflow.jsx, JobCosting.jsx): a WorkOrder is active while it is not
// completed (flag or stage) and not lost on the sales side.
export const isActiveJob = (w) =>
  w &&
  w.completed !== true &&
  clean(w.current_stage) !== "completed" &&
  clean(w.sales_status) !== "lost";

// --- Account tree -------------------------------------------------------------

// A tree node wraps a Customer row without mutating it:
//   { id, customer, parentId, depth, cycle }
// `parentId` is the resolved master id (null when the declared master is
// missing, self-referential, or part of a loop). `cycle:true` marks nodes that
// declared an impossible ancestry (self-parent or a closed loop) — they are
// surfaced as roots so a bad link can never hide an account or hang a walk.
export function buildAccountTree(customers) {
  const rows = liveRows(customers).filter((c) => clean(c?.id));
  const byId = new Map();
  for (const c of rows) {
    // First row wins on a duplicate id — later dupes stay reachable as data
    // but cannot fork the tree.
    if (!byId.has(c.id)) {
      byId.set(c.id, { id: c.id, customer: c, parentId: null, depth: 0, cycle: false });
    }
  }

  // Resolve each node's declared parent. Missing/blank/dangling ids leave
  // parentId null (root); a self-parent is the degenerate loop → cyclic root.
  for (const node of byId.values()) {
    const pid = clean(node.customer.master_account_id);
    if (!pid) continue;
    if (pid === node.id) {
      node.cycle = true;
      continue;
    }
    if (!byId.has(pid)) continue;
    node.parentId = pid;
  }

  // Loop detection: walk each node's ancestor chain recording the path. When
  // the walk revisits a node already on the path, exactly the nodes on that
  // loop segment are severed (parentId → null, cycle → true); accounts that
  // merely point INTO a loop keep their (valid) parent edge and remain
  // children of the cyclic node.
  for (const node of byId.values()) {
    const path = [node];
    const pos = new Map([[node.id, 0]]);
    let cur = node;
    while (cur.parentId) {
      const parent = byId.get(cur.parentId);
      if (!parent) break;
      if (pos.has(parent.id)) {
        for (const n of path.slice(pos.get(parent.id))) {
          n.cycle = true;
          n.parentId = null;
        }
        break;
      }
      pos.set(parent.id, path.length);
      path.push(parent);
      cur = parent;
    }
  }

  const roots = [];
  const childrenById = new Map();
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      const list = childrenById.get(node.parentId) || [];
      list.push(node);
      childrenById.set(node.parentId, list);
    } else {
      roots.push(node);
    }
  }

  // Depth = resolved ancestor count (walk terminates because loops are severed;
  // the seen-set is belt-and-suspenders for any hand-edited map).
  for (const node of byId.values()) {
    const seen = new Set([node.id]);
    let cur = node;
    let d = 0;
    while (cur.parentId && !seen.has(cur.parentId)) {
      seen.add(cur.parentId);
      const parent = byId.get(cur.parentId);
      if (!parent) break;
      cur = parent;
      d += 1;
    }
    node.depth = d;
  }

  return { roots, childrenById, byId };
}

// Breadth-first member collection rooted at rootId — returns the root node
// itself followed by every descendant node (this is the rollup's member set:
// totals deliberately include the master's own rows, not just sub-accounts).
// The visited set keeps the walk finite even if a caller passes a hand-built
// childrenById that still contains a loop edge.
function collectMembers(rootId, childrenById, byId) {
  const members = [];
  const seen = new Set();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (!node) continue;
    members.push(node);
    for (const child of childrenById.get(id) || []) queue.push(child.id);
  }
  return members;
}

// Outstanding amount on one invoice: the server-stamped balance_due wins; when
// it is blank/zero the open remainder is total − amount_paid (rows that were
// never balance-stamped still contribute).
const openAmount = (i) => num(i?.balance_due) || num(i?.total) - num(i?.amount_paid);

// --- Rollup ------------------------------------------------------------------

// rollupMasterAccount({ masterId, customers, workOrders, invoices, payments,
//   contacts }) → {
//   customer,            // the master Customer row (null when id is unknown)
//   children,            // tree nodes of DIRECT children only
//   members,             // master node + every descendant node, BFS order
//   totals: { openBalance, invoicedTotal, paidTotal, jobCount, activeJobCount },
//   contactsByCustomer,  // Map<customerId, CustomerContact[]> over the member set
//   tree,                // { roots, childrenById, byId } for reuse (displayPath)
// }
//
// GUARD (documented behavior): `members` always contains the master node at
// index 0, so totals/jobCount/contacts INCLUDE the master account's own rows
// — descendants are added on top, never substituted for them.
export function rollupMasterAccount({ masterId, customers, workOrders, invoices, payments, contacts } = {}) {
  const tree = buildAccountTree(customers);
  const master = tree.byId.get(clean(masterId)) || null;
  const children = master ? tree.childrenById.get(master.id) || [] : [];
  const members = master ? collectMembers(master.id, tree.childrenById, tree.byId) : [];
  const memberIds = new Set(members.map((m) => m.id));

  const memberWorkOrders = liveRows(workOrders).filter((w) =>
    memberIds.has(clean(w?.customer_id)),
  );
  const memberInvoices = liveRows(invoices).filter(
    (i) => memberIds.has(clean(i?.customer_id)) && clean(i?.status) !== "void",
  );
  const memberPayments = liveRows(payments).filter(
    (p) => memberIds.has(clean(p?.customer_id)) && clean(p?.status) !== "void",
  );

  const openInvoices = memberInvoices.filter((i) => openAmount(i) > 0);
  // computeTotals convention: invoice.amount_paid is authoritative; the
  // payments list is the fallback when no invoice carried applied amounts.
  const paidFromInvoices = memberInvoices.reduce((s, i) => s + num(i?.amount_paid), 0);
  const paidFromPayments = memberPayments.reduce((s, p) => s + num(p?.amount), 0);

  const totals = {
    openBalance: money(openInvoices.reduce((s, i) => s + openAmount(i), 0)),
    invoicedTotal: money(memberInvoices.reduce((s, i) => s + num(i?.total), 0)),
    paidTotal: money(
      paidFromInvoices > 0 || memberPayments.length === 0 ? paidFromInvoices : paidFromPayments,
    ),
    jobCount: memberWorkOrders.length,
    activeJobCount: memberWorkOrders.filter(isActiveJob).length,
  };

  const contactsByCustomer = new Map(members.map((m) => [m.id, []]));
  for (const p of liveRows(contacts)) {
    const cid = clean(p?.customer_id);
    if (memberIds.has(cid)) contactsByCustomer.get(cid).push(p);
  }

  return { customer: master ? master.customer : null, children, members, totals, contactsByCustomer, tree };
}

// --- Display path -------------------------------------------------------------

// "Master › Child" breadcrumb for headers — root-most ancestor first, the
// account itself last. Accepts a Customer row (resolved through byId) or a
// tree node directly. Cycle-safe via a visited set (loops are already severed
// by buildAccountTree, this guards hand-built maps). Unknown customers fall
// back to their bare display name.
export function customerDisplayPath(customer, byId) {
  const get = (id) => (byId && typeof byId.get === "function" ? byId.get(id) : byId?.[id]);
  const start =
    customer && customer.customer && customer.id
      ? customer // already a tree node
      : get(clean(customer?.id));
  if (!start) return customerName(customer);
  const names = [customerName(start.customer)];
  const seen = new Set([start.id]);
  let cur = start;
  while (cur.parentId && !seen.has(cur.parentId)) {
    const parent = get(cur.parentId);
    if (!parent) break;
    names.unshift(customerName(parent.customer));
    seen.add(parent.id);
    cur = parent;
  }
  return names.join(" › ");
}
