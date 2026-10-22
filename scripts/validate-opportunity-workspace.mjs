import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const entry = readFileSync('base44/functions/opportunityWorkspaceAction/entry.ts', 'utf8');
const page = readFileSync('src/pages/Opportunities.jsx', 'utf8');
const layout = readFileSync('src/Layout.jsx', 'utf8');
const config = readFileSync('src/pages.config.js', 'utf8');
const shared = readFileSync('base44/shared/opportunityFoundationPersistence.mjs', 'utf8');

for (const entity of ['Opportunity', 'OpportunityIntake', 'EstimatingRequest']) {
  const schema = readFileSync(`base44/entities/${entity}.jsonc`, 'utf8');
  assert.match(schema, /backend_only/, `${entity} must remain backend-only via RLS`);
  assert.match(schema, /creation_request_key/, `${entity} requires a retry-safe creation key`);
}
for (const entity of ['CustomerContact', 'CustomerLocation']) {
  const schema = readFileSync(`base44/entities/${entity}.jsonc`, 'utf8');
  assert.ok(schema.includes('"customer_id"'), `${entity} must link its owning Customer`);
  assert.match(schema, /"role": "admin"/, `${entity} delete must stay admin-only`);
}

// Backend contract: session auth, service role, all supported actions present.
assert.ok(existsSync('base44/functions/opportunityWorkspaceAction/entry.ts'), 'workspace function must exist');
assert.match(entry, /authenticateSignShopSession/, 'function must authenticate the sign-shop session');
assert.match(entry, /asServiceRole\.entities\.Opportunity\b/, 'Opportunity must be accessed via service role');
assert.match(entry, /asServiceRole\.entities\.OpportunityIntake\b/, 'OpportunityIntake must be accessed via service role');
assert.match(entry, /asServiceRole\.entities\.EstimatingRequest\b/, 'EstimatingRequest must be accessed via service role');
for (const action of ['search_customers', 'list_opportunities', 'get_opportunity', 'capture_intake', 'update_opportunity', 'resolve_intake', 'link_work_order', 'request_estimate', 'list_estimating_requests', 'assign_estimator']) {
  assert.ok(entry.includes(`"${action}"`) || entry.includes(`action === "${action}"`), `action ${action} must be handled`);
}

// Handoff safety: frozen snapshot, idempotent creates, CAS updates, closed-stage guard.
assert.match(entry, /buildHandoffSnapshot/, 'request_estimate must build a handoff snapshot');
assert.match(entry, /createFoundationRecordWithRecovery/, 'creates must use retry-safe recovery');
assert.match(entry, /replaceFoundationFieldsIfUnchanged/, 'updates must be compare-and-set');
assert.match(entry, /replaceEstimatingRequestFieldsIfUnchanged/, 'request updates must honor the frozen snapshot guard');
assert.match(entry, /CLOSED_STAGES\.has\(clean\(opportunity\.stage\)\)/, 'closed opportunities must not request estimates');
assert.match(entry, /site_address: clean\(snapshot\.captured_site_address\)/, 'handoff must prefill the estimate site address');
assert.match(entry, /target_install_date: clean\(snapshot\.desired_install_date/, 'handoff must prefill the target install date');
assert.match(entry, /Requirements — /, 'handoff must prefill a requirement summary into estimate notes');
assert.match(shared, /handoff_snapshot is frozen after submission/, 'snapshot freeze guard must exist in shared persistence');

// Frontend: backend-only entities are never touched directly from the page.
assert.ok(!page.includes('entities.Opportunity'), 'page must not call entity SDK for backend-only entities');
assert.match(page, /functions\.invoke\("opportunityWorkspaceAction"/, 'page must invoke the workspace function');
assert.match(page, /action: "capture_intake"|action:"capture_intake"/, 'page must support intake capture');
assert.match(page, /action: "request_estimate"|action:"request_estimate"/, 'page must support the estimate handoff');
assert.match(page, /creation_request_key: (uuid\(\)|keyRef\.current)/, 'client must supply idempotent creation keys');
assert.match(page, /`\/EstimateDetail\?id=\$\{estimateId\}`|\/EstimateDetail\?id=/, 'handoff must navigate to the created estimate');
assert.match(page, /action: "list_estimating_requests"/, 'page must expose the estimating queue');
assert.match(page, /action: "assign_estimator"/, 'page must support estimator assignment');
assert.match(entry, /open_pipeline_value/, 'list_opportunities must return funnel metrics');
assert.match(entry, /win_rate/, 'funnel must compute win rate');
assert.match(page, /funnel\.stage_counts/, 'page must render the funnel strip');

// Global search: backend-only records reachable through the workspace function.
const globalSearch = readFileSync('src/components/workflow/GlobalSearch.jsx', 'utf8');
assert.ok(entry.includes('action === "global_search"'), 'global_search must be handled server-side');
assert.match(entry, /asServiceRole\.entities\.Invoice\b/, 'global search must read invoices via service role');
assert.match(globalSearch, /functions\.invoke\("opportunityWorkspaceAction"/, 'search must invoke the workspace function');
assert.match(globalSearch, /action: "global_search"/, 'search must request global_search');
assert.ok(!globalSearch.includes('entities.Invoice'), 'search must not touch backend-only entities directly');

// Lifecycle hub: the Opportunity detail must surface linked financial records.
assert.match(entry, /Invoice\.filter\(\{ opportunity_id: opportunityId \}\)/, 'detail must load linked invoices');
assert.match(entry, /PurchaseOrder\.filter\(\{ opportunity_id: opportunityId \}\)/, 'detail must load linked POs');
assert.match(entry, /financials: \{/, 'detail must return a financial rollup');
assert.match(page, /detail\?\.financials|detail\.financials/, 'page must render the financial rollup');

// Convergence: estimate→pipeline sync must locate the compatibility WorkOrder
// by stable links, carry the link fields, and back-link the Opportunity.
const invoicing = readFileSync('base44/functions/invoicingAction/entry.ts', 'utf8');
const invoicesPage = readFileSync('src/pages/Invoices.jsx', 'utf8');
const changeOrders = readFileSync('base44/functions/changeOrderAction/entry.ts', 'utf8');
const coPage = readFileSync('src/pages/ChangeOrders.jsx', 'utf8');
const purchaseOrders = readFileSync('base44/functions/purchaseOrderAction/entry.ts', 'utf8');
const poPage = readFileSync('src/pages/PurchaseOrders.jsx', 'utf8');
const sync = readFileSync('src/components/estimator/customerSync.js', 'utf8');
assert.match(sync, /WorkOrder\.filter\(\{ estimating_request_id: estimateRequestId \}\)/,
  'sync must look up WorkOrders by estimating_request_id');
assert.match(sync, /WorkOrder\.filter\(\{ opportunity_id: estimateOpportunityId \}\)/,
  'sync must look up WorkOrders by opportunity_id');
assert.match(sync, /opportunity_id: firstNonBlank\(estimateOpportunityId, existing\?\.opportunity_id\)/,
  'sync must carry opportunity_id onto the WorkOrder');
assert.match(sync, /estimating_request_id: firstNonBlank\(estimateRequestId, existing\?\.estimating_request_id\)/,
  'sync must carry estimating_request_id onto the WorkOrder');
assert.match(sync, /action: "link_work_order"/, 'sync must back-link the Opportunity through the workspace function');
assert.match(entry, /action === "link_work_order"/, 'function must handle link_work_order');
assert.match(entry, /compatibility_work_order_id: workOrderId/, 'link_work_order must set the compatibility link');

// E2: permitting resolution wired into the Opportunity workspace.
assert.match(entry, /"contact_id", "location_id"|"contact_id",\s*\n?\s*"location_id"/,
  'update_opportunity must allow contact/location linking');
assert.match(entry, /CustomerContact\.get\(cid\)/, 'contact_id must be validated server-side');
assert.match(entry, /CustomerLocation\.get\(lid\)/, 'location_id must be validated server-side');
assert.match(page, /findLocalityByAddress/, 'permit panel must resolve jurisdiction via findLocalityByAddress');
assert.match(page, /functions\.invoke\("findLocalityByAddress", \{[\s\S]{0,300}session_token: sessionToken/, 'jurisdiction lookup must pass the session token');
assert.match(page, /CustomerLocation\.create\(/, 'resolved sites must persist as canonical CustomerLocation');
assert.match(page, /location_id: clean\(created\?\.id\)/, 'saved location must back-link the Opportunity');

// F1/F2/F3: invoicing foundation — backend-only ledger, server-side money math,
// payments recompute invoice state, AR aging surfaced to the UI.
for (const entity of ['Invoice', 'Payment']) {
  const schema = readFileSync(`base44/entities/${entity}.jsonc`, 'utf8');
  assert.match(schema, /backend_only/, `${entity} must be backend-only so balances cannot be edited around the function`);
}
assert.match(invoicing, /authenticateSignShopSession/, 'invoicingAction must authenticate the sign-shop session');
for (const action of ['list_invoices', 'get_invoice', 'create_invoice', 'update_invoice', 'mark_sent', 'void_invoice', 'record_payment', 'void_payment', 'export_ar']) {
  assert.ok(invoicing.includes(`action === "${action}"`), `action ${action} must be handled`);
}
assert.match(invoicing, /computeTotals/, 'invoice totals must be computed server-side');
assert.match(invoicing, /recomputeInvoiceAfterPayments/, 'payments must recompute invoice totals/status');
assert.match(invoicing, /createFoundationRecordWithRecovery/, 'invoice/payment creates must be retry-safe');
assert.match(invoicing, /replaceFoundationFieldsIfUnchanged/, 'invoice/payment updates must be compare-and-set');
assert.match(invoicing, /exceeds the open balance/, 'overpayments must be rejected');
assert.match(invoicing, /Void the recorded payments/, 'invoices with payments must not be voided directly');
assert.match(invoicing, /agingSummary/, 'AR aging summary must be computed');
// C5: progress billing — invoices generated from approved estimates.
for (const action of ['list_invoiceable_estimates', 'create_from_estimate']) {
  assert.ok(invoicing.includes(`action === "${action}"`), `action ${action} must be handled`);
}
assert.match(invoicing, /Only approved estimates can be invoiced/, 'billing must require an approved estimate');
assert.match(invoicing, /billing_type/, 'invoices must carry a progress-billing type');
assert.match(invoicing, /already has .* invoiced|already fully invoiced|exceed the billable remainder/, 'billing must guard against over-billing');
assert.match(invoicing, /Estimate\.filter\(\{ status: "approved" \}/, 'invoiceable list must only offer approved estimates');
assert.match(invoicesPage, /action: "list_invoiceable_estimates"/, 'page must list invoiceable estimates');
assert.match(invoicesPage, /action: "create_from_estimate"/, 'page must create invoices from estimates');
assert.match(readFileSync('base44/entities/Invoice.jsonc', 'utf8'), /"deposit".*"progress".*"final"|deposit.*progress.*final/s, 'billing_type enum must include deposit/progress/final');
assert.ok(!invoicesPage.includes('entities.Invoice'), 'invoices page must not touch backend-only entities directly');
assert.ok(!invoicesPage.includes('entities.Payment'), 'invoices page must not touch backend-only entities directly');
assert.match(invoicesPage, /functions\.invoke\("invoicingAction"/, 'invoices page must invoke invoicingAction');
assert.match(invoicesPage, /action: "export_ar"/, 'invoices page must offer the AR CSV export');
assert.match(invoicesPage, /creation_request_key: keyRef\.current|creation_request_key: payKeyRef\.current/, 'page must supply idempotent creation keys');
assert.match(config, /import Invoices from '\.\/pages\/Invoices'/, 'pages.config must import Invoices');
assert.match(config, /"Invoices": Invoices/, 'pages.config must register the Invoices route');
assert.match(layout, /title: "Invoices", url: createPageUrl\("Invoices"\)/, 'Layout nav must link Invoices');

// C3: change orders — backend-only, server-computed delta, approval lifecycle.
const coSchema = readFileSync('base44/entities/ChangeOrder.jsonc', 'utf8');
assert.match(coSchema, /backend_only/, 'ChangeOrder must be backend-only');
assert.match(coSchema, /amount_delta/, 'ChangeOrder must carry a server-computed delta');
assert.match(changeOrders, /authenticateSignShopSession/, 'changeOrderAction must authenticate the session');
for (const action of ['list_change_orders', 'get_change_order', 'create_change_order', 'update_change_order', 'approve_change_order', 'reject_change_order', 'apply_change_order', 'cancel_change_order']) {
  assert.ok(changeOrders.includes(`action === "${action}"`), `action ${action} must be handled`);
}
assert.match(changeOrders, /Only proposed change orders can be/, 'lifecycle transitions must be guarded');
assert.match(changeOrders, /at least one parent|Link the change order to an estimate, work order, or opportunity/, 'change orders must require a parent link');
assert.ok(!coPage.includes('entities.ChangeOrder'), 'change orders page must not touch backend-only entities');
assert.match(coPage, /functions\.invoke\("changeOrderAction"/, 'change orders page must invoke the function');
assert.match(config, /"ChangeOrders": ChangeOrders/, 'pages.config must register the ChangeOrders route');
assert.match(layout, /title: "Change Orders", url: createPageUrl\("ChangeOrders"\)/, 'Layout nav must link Change Orders');

// D2/D3: purchase orders — backend-only, server totals, guarded receiving.
const poSchema = readFileSync('base44/entities/PurchaseOrder.jsonc', 'utf8');
assert.match(poSchema, /backend_only/, 'PurchaseOrder must be backend-only');
assert.match(poSchema, /quantity_received/, 'PO lines must track received quantities');
assert.match(purchaseOrders, /authenticateSignShopSession/, 'purchaseOrderAction must authenticate the session');
for (const action of ['list_purchase_orders', 'get_purchase_order', 'create_purchase_order', 'update_purchase_order', 'mark_sent', 'receive_items', 'cancel_purchase_order']) {
  assert.ok(purchaseOrders.includes(`action === "${action}"`), `action ${action} must be handled`);
}
assert.match(purchaseOrders, /exceeds the open quantity/, 'receiving must reject over-receipts');
assert.match(purchaseOrders, /Only draft purchase orders can be/, 'PO edits must be draft-only');
assert.ok(!poPage.includes('entities.PurchaseOrder'), 'PO page must not touch backend-only entities');
assert.match(poPage, /functions\.invoke\("purchaseOrderAction"/, 'PO page must invoke the function');
assert.match(config, /"PurchaseOrders": PurchaseOrders/, 'pages.config must register the PurchaseOrders route');
assert.match(layout, /title: "Purchase Orders", url: createPageUrl\("PurchaseOrders"\)/, 'Layout nav must link Purchase Orders');

// C4/B4: job costing — read-only rollup over existing records, service-role.
const jobCosting = readFileSync('base44/functions/jobCostingAction/entry.ts', 'utf8');
const jcPage = readFileSync('src/pages/JobCosting.jsx', 'utf8');
assert.match(jobCosting, /authenticateSignShopSession/, 'jobCostingAction must authenticate the session');
assert.match(jobCosting, /asServiceRole\.entities\.WorkOrder\b/, 'cost rollup must read WorkOrders via service role');
assert.match(jobCosting, /asServiceRole\.entities\.TimeClockLaborSegment\b/, 'labor hours must come from labor segments');
assert.match(jobCosting, /asServiceRole\.entities\.Invoice\b/, 'invoiced totals must come from the Invoice ledger');
assert.match(jobCosting, /asServiceRole\.entities\.PurchaseOrder\b/, 'committed material cost must come from POs');
assert.match(jobCosting, /asServiceRole\.entities\.ChangeOrder\b/, 'contract value must include change-order deltas');
for (const action of ['list_job_costs', 'get_job_cost']) {
  assert.ok(jobCosting.includes(`action === "${action}"`), `action ${action} must be handled`);
}
assert.match(jobCosting, /contract_value: money\(estimated \+ coDelta\)|money\(estimated \+ coDelta\)/, 'contract value must be estimate + CO delta');
assert.match(jobCosting, /clean\(i\?\.status\) !== "void" && clean\(i\?\.status\) !== "draft"/, 'draft/void invoices must not count as billed');
assert.match(jobCosting, /clean\(p\?\.status\) !== "cancelled"/, 'cancelled POs must not count as committed cost');
assert.match(jobCosting, /\["approved", "applied"\]\.includes\(clean\(c\?\.status\)\)/, 'only approved/applied COs change contract value');
assert.match(jcPage, /functions\.invoke\("jobCostingAction"/, 'job costing page must invoke the function');
assert.match(config, /"JobCosting": JobCosting/, 'pages.config must register the JobCosting route');
assert.match(layout, /title: "Job Costing", url: createPageUrl\("JobCosting"\)/, 'Layout nav must link Job Costing');

// Wiring: route + navigation.
assert.match(config, /import Opportunities from '\.\/pages\/Opportunities'/, 'pages.config must import the page');
assert.match(config, /"Opportunities": Opportunities/, 'pages.config must register the route');
assert.match(layout, /title: "Opportunities", url: createPageUrl\("Opportunities"\)/, 'Layout nav must link the page');
assert.match(layout, /createPageUrl\("Opportunities"\)/, 'Opportunities must be a root route');

console.log('PASS opportunity workspace contracts (backend-only entities, guarded handoff, idempotent creates, routing)');
