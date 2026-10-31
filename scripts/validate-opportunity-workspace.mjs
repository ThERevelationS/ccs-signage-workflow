import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const entry = readFileSync('base44/functions/opportunityWorkspaceAction/entry.ts', 'utf8');
const page = readFileSync('src/pages/Opportunities.jsx', 'utf8');
const layout = readFileSync('src/Layout.jsx', 'utf8');
const config = readFileSync('src/pages.config.js', 'utf8');
const shared = readFileSync('base44/shared/opportunityFoundationPersistence.mjs', 'utf8');

for (const entity of ['Opportunity', 'OpportunityIntake', 'EstimatingRequest', 'OpportunityActivity']) {
  const schema = readFileSync(`base44/entities/${entity}.jsonc`, 'utf8');
  assert.match(schema, /backend_only/, `${entity} must remain backend-only via RLS`);
  assert.match(schema, /creation_request_key/, `${entity} requires a retry-safe creation key`);
}
for (const entity of ['CustomerContact', 'CustomerLocation']) {
  const schema = readFileSync(`base44/entities/${entity}.jsonc`, 'utf8');
  assert.ok(schema.includes('"customer_id"'), `${entity} must link its owning Customer`);
  assert.match(schema, /"delete":\s*\{[^}]*"role":\s*"(__[a-z_]+__|admin|__[a-z_]+backend_only__)"/, `${entity} delete must stay restricted`);
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
assert.match(entry, /requirementSummary/, 'handoff must prefill a requirement summary into estimate notes');
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
assert.match(entry, /reconcileEstimatingRequest/, 'estimating requests must reconcile against their linked estimate');
assert.match(entry, /QUOTE_OUT_STATUSES/, 'quote-out estimate statuses must drive request completion');
assert.match(entry, /status: "completed", completed_at/, 'reconciliation must mark the request completed');
assert.match(entry, /stage: "quoted", stage_changed_at/, 'reconciliation must advance an estimating opportunity to quoted');
assert.ok(entry.includes('action === "list_follow_ups"'), 'follow-ups list must be served by the workspace function');
assert.match(entry, /follow_ups: items/, 'follow-ups must return the sorted item list');
assert.match(page, /action: "list_follow_ups"/, 'the page must request follow-ups through the function');
assert.match(page, /FollowUps/, 'the page must render a follow-ups view');
assert.match(entry, /ar_aging/, 'customer 360 must return AR aging buckets');
assert.match(entry, /d90_plus/, 'aging must include a 90+ bucket');
assert.match(entry, /days_overdue/, 'invoice rows must carry days overdue');
assert.match(entry, /by_salesperson/, 'funnel must break down results by salesperson');
assert.ok(globalSearch.includes('/Invoices?invoice='), 'search must deep-link invoice records');
assert.ok(page.includes('?invoice=${row.id}'), 'opportunity financials must deep-link invoices');
assert.ok(page.includes('get_opportunity", opportunity_id: openId'), 'opportunities must honor an ?open= deep link');
assert.match(entry, /logActivity\(Activity/, 'opportunity mutations must write activity log entries');
assert.match(entry, /OpportunityActivity\b/, 'the workspace must use the backend-only activity entity');
assert.ok(page.includes('detail.activity'), 'the detail view must render the activity timeline');
assert.match(entry, /asServiceRole\.entities\.Invoice\b/, 'global search must read invoices via service role');
assert.match(globalSearch, /functions\.invoke\("opportunityWorkspaceAction"/, 'search must invoke the workspace function');
assert.match(globalSearch, /action: "global_search"/, 'search must request global_search');
assert.ok(!globalSearch.includes('entities.Invoice'), 'search must not touch backend-only entities directly');

// Lifecycle hub: the Opportunity detail must surface linked financial records.
assert.match(entry, /Invoice\.filter\(\{ opportunity_id: opportunityId \}\)/, 'detail must load linked invoices');
assert.match(entry, /PurchaseOrder\.filter\(\{ opportunity_id: opportunityId \}\)/, 'detail must load linked POs');
assert.match(entry, /financials: \{/, 'detail must return a financial rollup');
assert.match(page, /detail\?\.financials|detail\.financials/, 'page must render the financial rollup');

// Convergence: estimateâ†’pipeline sync must locate the compatibility WorkOrder
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

// F1/F2/F3: invoicing foundation â€” backend-only ledger, server-side money math,
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
// C5: progress billing â€” invoices generated from approved estimates.
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
assert.ok(/import Invoices from '\.\/pages\/Invoices'/.test(config) || /const Invoices = lazyPage\(\(\) => import\(['\"]\.\/pages\/Invoices['\"]\)\)/.test(config), 'pages.config must load Invoices eagerly or lazily');
assert.match(config, /"Invoices": Invoices/, 'pages.config must register the Invoices route');
assert.match(layout, /title: "Invoices", url: createPageUrl\("Invoices"\)/, 'Layout nav must link Invoices');

// C3: change orders â€” backend-only, server-computed delta, approval lifecycle.
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

// D2/D3: purchase orders â€” backend-only, server totals, guarded receiving.
const poSchema = readFileSync('base44/entities/PurchaseOrder.jsonc', 'utf8');
assert.match(poSchema, /backend_only/, 'PurchaseOrder must be backend-only');
assert.match(poSchema, /quantity_received/, 'PO lines must track received quantities');
assert.match(purchaseOrders, /authenticateSignShopSession/, 'purchaseOrderAction must authenticate the session');
for (const action of ['list_purchase_orders', 'get_purchase_order', 'create_purchase_order', 'update_purchase_order', 'mark_sent', 'receive_items', 'cancel_purchase_order']) {
  assert.ok(purchaseOrders.includes(`action === "${action}"`), `action ${action} must be handled`);
}
assert.match(purchaseOrders, /exceeds the open quantity/, 'receiving must reject over-receipts');
assert.match(purchaseOrders, /Only draft purchase orders can be/, 'PO edits must be draft-only');
for (const action of ['mark_invoiced', 'mark_paid']) {
  assert.ok(purchaseOrders.includes(`action === "${action}"`), `action ${action} must be handled`);
}
assert.match(purchaseOrders, /Record the vendor bill before marking the purchase order paid/, 'payment must require a recorded vendor bill');
assert.match(poSchema, /payment_status/, 'PO must carry a vendor payment status');
assert.ok(!poPage.includes('entities.PurchaseOrder'), 'PO page must not touch backend-only entities');
assert.match(poPage, /functions\.invoke\("purchaseOrderAction"/, 'PO page must invoke the function');
assert.match(config, /"PurchaseOrders": PurchaseOrders/, 'pages.config must register the PurchaseOrders route');
assert.match(layout, /title: "Purchase Orders", url: createPageUrl\("PurchaseOrders"\)/, 'Layout nav must link Purchase Orders');

// C4/B4: job costing â€” read-only rollup over existing records, service-role.
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
assert.ok(config.includes("const Opportunities = lazyPage") || config.includes("import Opportunities from './pages/Opportunities'"), 'pages.config must load the Opportunities page');
assert.match(config, /"Opportunities": Opportunities/, 'pages.config must register the route');
assert.match(layout, /title: "Opportunities", url: createPageUrl\("Opportunities"\)/, 'Layout nav must link the page');
assert.match(layout, /createPageUrl\("Opportunities"\)/, 'Opportunities must be a root route');

// D4-lite inventory: stock quantities + append-only movement ledger.
const invSchema = readFileSync('base44/entities/Inventory.jsonc', 'utf8');
const invMoveSchema = readFileSync('base44/entities/InventoryMovement.jsonc', 'utf8');
const inventoryFn = readFileSync('base44/functions/inventoryAction/entry.ts', 'utf8');
const invPage = readFileSync('src/pages/Inventory.jsx', 'utf8');
assert.match(invSchema, /quantity_on_hand/, 'Inventory must track on-hand quantity');
assert.match(invSchema, /reorder_point/, 'Inventory must carry a reorder point');
assert.match(invMoveSchema, /backend_only/, 'InventoryMovement must be backend-only');
assert.match(invMoveSchema, /creation_request_key/, 'movements must be retry-safe');
assert.match(invMoveSchema, /resulting_qty/, 'movements must record the resulting balance');
assert.match(inventoryFn, /authenticateSignShopSession/, 'inventoryAction must authenticate the session');
assert.match(inventoryFn, /asServiceRole\.entities\.InventoryMovement\b/, 'movements must be written via service role');
assert.match(inventoryFn, /replaceFoundationFieldsIfUnchanged/, 'stock updates must be compare-and-set guarded');
assert.match(inventoryFn, /Cannot move/, 'negative on-hand results must be rejected');
assert.match(inventoryFn, /A work order is required to issue stock/, 'issues must link a work order');
for (const action of ['list_stock', 'list_movements', 'receive_stock', 'issue_to_job', 'adjust_stock', 'return_stock']) {
  assert.ok(inventoryFn.includes(`"${action}"`), `action ${action} must be handled`);
}
assert.ok(!invPage.includes('entities.InventoryMovement'), 'inventory page must not touch the backend-only ledger');
assert.match(invPage, /functions\.invoke\("inventoryAction"/, 'inventory page must invoke the function');
assert.ok(config.includes("const Inventory = lazyPage") || config.includes("import Inventory from './pages/Inventory'"), 'pages.config must load the Inventory page');
assert.match(config, /"Inventory": Inventory/, 'pages.config must register the Inventory route');
assert.match(layout, /title: "Inventory", url: createPageUrl\("Inventory"\)/, 'Layout nav must link Inventory');
assert.match(layout, /createPageUrl\("Inventory"\)/, 'Inventory must be a root route');

// D4-fuller-lite: receiving a PO line linked to a stock item updates inventory.
assert.match(poSchema, /inventory_item_id/, 'PO lines must allow a stock-item link');
assert.match(purchaseOrders, /inventory_item_id: clean\(row\?\.inventory_item_id\)/, 'line sanitization must preserve the stock link');
assert.match(purchaseOrders, /applyStockReceipt/, 'receiving must apply stock receipts');
assert.match(purchaseOrders, /asServiceRole\.entities\.InventoryMovement\b/, 'PO receipts must write the movement ledger via service role');
assert.match(purchaseOrders, /po-receive:/, 'stock movements must carry a deterministic receipt key');
assert.match(purchaseOrders, /stock_warnings/, 'stock failures must surface as warnings, not silent drops');
assert.match(poPage, /functions\.invoke\("inventoryAction"/, 'PO form must load stock items via the function');
assert.match(poPage, /inventory_item_id: clean\(r\.inventory_item_id\)/, 'PO form must submit the stock link');

// Job costing: issued stock counts as material actuals.
assert.match(invMoveSchema, /unit_cost/, 'movements must snapshot the unit cost for job costing');
assert.match(inventoryFn, /unit_cost: num\(item\?\.cost_per_unit\)/, 'inventoryAction must freeze the unit cost on each movement');
assert.match(purchaseOrders, /unit_cost: num\(item\?\.cost_per_unit\)/, 'PO receipts must freeze the unit cost');
assert.match(jobCosting, /asServiceRole\.entities\.InventoryMovement\b/, 'cost rollup must read the movement ledger');
assert.match(jobCosting, /\["issue", "return"\]\.includes\(clean\(m\?\.reason\)\)/, 'only issues and returns count as issued material');
assert.match(jobCosting, /stock_issued: stockIssued/, 'rollup must expose issued stock cost');
assert.match(jobCosting, /stock_movements:/, 'job detail must list stock movements');
assert.match(jcPage, /j\.stock_issued/, 'job costing page must show issued stock');

// Customer 360: EstimatorCustomers opens a cross-domain detail per customer.
const custPage = readFileSync('src/pages/EstimatorCustomers.jsx', 'utf8');
assert.ok(entry.includes('action === "get_customer_360"'), 'get_customer_360 must be handled');
assert.match(entry, /asServiceRole\.entities\.CustomerContact\b/, 'customer 360 must read canonical contacts via service role');
assert.match(entry, /asServiceRole\.entities\.CustomerLocation\b/, 'customer 360 must read canonical locations via service role');
assert.match(entry, /open_pipeline_value/, 'customer 360 must aggregate open pipeline value');
assert.match(entry, /open_ar:/, 'customer 360 must aggregate open AR');
assert.match(custPage, /action: "get_customer_360"/, 'customer page must invoke get_customer_360');
assert.match(custPage, /opportunityWorkspaceAction/, 'customer page must go through the workspace function');

// A9-lite: Opportunity stage changes cascade to the linked compatibility WorkOrder.
assert.match(entry, /OPP_TO_WO_STAGE/, 'a stage map must drive work-order sync');
assert.match(entry, /syncWorkOrderStage/, 'stage sync helper must exist');
assert.match(entry, /stage_sync_warning/, 'sync failures must surface as warnings');
assert.match(entry, /sales_status: next/, 'sync must write the work order sales_status');
assert.ok(entry.indexOf('syncWorkOrderStage') > 0 && entry.lastIndexOf('syncWorkOrderStage') > entry.indexOf('link_work_order'), 'link_work_order must sync the stage too');

// Customer portal: token-scoped read-only invoice sharing.
const portalEntity = readFileSync('base44/entities/CustomerPortalLink.jsonc', 'utf8');
assert.match(portalEntity, /"__portal_link_backend_only__"/, 'portal link entity must be backend-only');
assert.match(portalEntity, /"creation_request_key"/, 'portal link entity must carry a retry-safe key');
const portalMsgEntity = readFileSync('base44/entities/PortalMessage.jsonc', 'utf8');
assert.match(portalMsgEntity, /"__portal_message_backend_only__"/, 'portal message entity must be backend-only');
assert.match(portalMsgEntity, /"estimate_revision_requested"/, 'portal messages must cover revision requests');
const portalFn = readFileSync('base44/functions/customerPortalAction/entry.ts', 'utf8');
assert.match(portalFn, /action === "bootstrap"/, 'portal function must expose token bootstrap');
assert.match(portalFn, /token\.length < 16/, 'bootstrap must reject short tokens');
assert.match(portalFn, /authenticateSignShopSession/, 'staff portal actions must authenticate');
assert.match(portalFn, /action === "create_link"/, 'portal function must create share links');
assert.match(portalFn, /action === "revoke_link"/, 'portal function must revoke share links');
assert.match(portalFn, /invoicePortalView/, 'bootstrap must return a sanitized invoice view');
assert.match(portalFn, /kind: "customer"/, 'portal links must support account-level access');
assert.match(portalFn, /action === "post_message"/, 'customers must be able to send portal messages');
assert.match(portalFn, /action === "estimate_respond"/, 'customers must be able to respond to quotes');
assert.match(portalFn, /status: "approved"/, 'estimate_respond must approve sent quotes');
assert.match(portalFn, /action === "payment_notice"/, 'customers must be able to flag incoming payments');
assert.match(portalFn, /action === "reply_message"/, 'staff must be able to reply in the portal thread');
assert.match(portalFn, /action === "portal_inbox"/, 'staff must get an unread portal inbox');
assert.match(portalFn, /estimatePortalView/, 'portal must sanitize estimates');
assert.match(portalFn, /jobPortalView/, 'portal must sanitize work orders');
assert.match(portalFn, /estimate\.customer_id\) !== customerId/, 'quote responses must be ownership-scoped');
assert.match(portalFn, /asServiceRole\.entities\.OpportunityActivity\b/, 'portal must log to the opportunity audit trail');
assert.match(portalFn, /asServiceRole\.entities\.EstimatingRequest\b/, 'portal must resolve the estimate\'s opportunity');
assert.match(portalFn, /logPortalOpportunityActivity/, 'portal activity helper must exist');
assert.match(portalFn, /Customer approved \$\{quoteLabel\} via the portal/, 'approvals must reach the opportunity timeline');
assert.match(portalFn, /Customer requested revisions on \$\{quoteLabel\} via the portal/, 'revision requests must reach the opportunity timeline');
assert.match(portalFn, /Customer sent a payment notice for \$\{invLabel\} via the portal/, 'payment notices must reach the opportunity timeline');
assert.match(portalFn, /action === "email_link"/, 'staff must be able to email the portal link');
assert.match(portalFn, /invoke\("sendGmail"/, 'email_link must send through the gmail function');
assert.match(portalFn, /portal_base/, 'email_link must build the portal URL from the caller origin');
assert.match(portalFn, /Portal link emailed to \$\{to\} by \$\{actorName\}/, 'portal emails must be logged to the thread');
assert.doesNotMatch(portalFn, /link: active, token: clean\(active\.token\)/, 'create_link must not return raw tokens to non-admin staff');
assert.match(portalFn, /link: linkForCaller\(user, link\)[\s\S]*sent_to: to, link: linkForCaller\(user, link\)/, 'create_link/email_link must mask tokens for non-admins');
assert.match(portalFn, /customerEmailsOnFile\(customer\)/, 'email_link must only send to addresses on the customer record');
assert.match(portalFn, /trustedPortalBase\(body\?\.portal_base\)/, 'email_link must not embed tokens in caller-chosen origins');
assert.match(portalFn, /escapeHtml\(customerName\)/, 'portal email must escape customer-controlled HTML');
assert.match(portalFn, /auditPortalLink\(base44, actor, "portal_link_create"/, 'portal link creation must be audited');
assert.match(portalFn, /action === "request_job_revision"/, 'customers must be able to request job changes');
assert.match(portalFn, /clean\(order\.customer_id\) !== customerId/, 'job revision requests must be ownership-scoped');
assert.match(portalFn, /status: "proposed"[\s\S]*?reason: "Customer request via portal"/, 'job revisions must draft a proposed change order');
assert.match(portalFn, /asServiceRole\.entities\.ChangeOrder\b/, 'portal must create change orders');
assert.match(portalFn, /kind: "job_revision_requested"/, 'job revisions must hit the staff inbox');
assert.match(portalFn, /client_product_name/, 'portal quotes must expose customer-facing section names');
assert.match(portalFn, /include_in_customer/, 'portal must honor section bundling');
assert.doesNotMatch(portalFn.slice(portalFn.indexOf('function estimatePortalView'), portalFn.indexOf('function jobPortalView')), /total_snapshot:|builder_name/, 'portal quote sections must not leak internal costs or builder names');
assert.doesNotMatch(portalFn.slice(portalFn.indexOf('action === "bootstrap"'), portalFn.indexOf('authenticateSignShopSession')), /session_token/, 'bootstrap must not require a session token');
const portalPage = readFileSync('src/pages/CustomerPortal.jsx', 'utf8');
assert.match(portalPage, /\.get\("token"\)/, 'portal page must read the token from the URL');
assert.match(portalPage, /customerPortalAction/, 'portal page must call the portal function');
assert.match(portalPage, /Print \/ PDF/, 'portal page must offer a printable view');
assert.match(portalPage, /estimate_respond/, 'portal page must submit quote responses');
assert.match(portalPage, /post_message/, 'portal page must send portal messages');
assert.match(portalPage, /payment_notice/, 'portal page must send payment notices');
assert.match(portalPage, /key: "messages"/, 'portal page must have a messages tab');
assert.match(portalPage, /key: "jobs"/, 'portal page must have a jobs tab');
assert.match(portalPage, /action: "request_job_revision"/, 'portal page must submit job change requests');
assert.match(portalPage, /View\}? quote details|quote details/, 'portal quotes must show line-item detail');
const portalPanel = readFileSync('src/components/portal/PortalPanel.jsx', 'utf8');
assert.match(portalPanel, /action: "list_thread"/, 'the portal panel must load the thread');
assert.match(portalPanel, /action: "reply_message"/, 'the portal panel must send staff replies');
assert.match(portalPanel, /kind: "customer"/, 'the portal panel must create account-level links');
assert.match(portalPanel, /action: "revoke_link"/, 'the portal panel must revoke links');
assert.match(portalPanel, /action: "email_link"/, 'the portal panel must email the link to the customer');
const custDetailPage = readFileSync('src/pages/EstimatorCustomers.jsx', 'utf8');
assert.match(custDetailPage, /from "@\/components\/portal\/PortalPanel"/, 'customer 360 must use the shared portal panel');
assert.match(custDetailPage, /<PortalPanel/, 'customer 360 must render the portal panel');
assert.match(custDetailPage, /action: "portal_inbox"/, 'customers page must load the portal inbox');
const oppPage2 = readFileSync('src/pages/Opportunities.jsx', 'utf8');
assert.match(oppPage2, /from "@\/components\/portal\/PortalPanel"/, 'opportunity detail must use the shared portal panel');
assert.match(oppPage2, /<PortalPanel sessionToken=\{sessionToken\} customerId=\{clean\(o\.customer_id\)\} \/>/, 'opportunity detail must render the portal panel for linked customers');
assert.match(entry, /stale_quote: true/, 'follow-ups must surface stale sent quotes');
assert.match(entry, /quote_valid_days/, 'follow-ups must flag expired quotes');
assert.match(oppPage2, /Quote expired/, 'follow-ups UI must badge expired quotes');
assert.match(invoicing, /action === "email_invoice"/, 'staff must be able to email invoices');
assert.match(invoicing, /invoke\("sendGmail"/, 'email_invoice must send through gmail');
assert.match(invoicing, /kind: "invoice"[\s\S]*?customer_id: clean\(invoice\.customer_id\)/, 'email_invoice must mint an invoice-scoped portal link');
const appShell = readFileSync('src/App.jsx', 'utf8');
assert.match(appShell, /path === '\/customerportal'/, 'portal must be a standalone unauthenticated route');
const invPortalPage = readFileSync('src/pages/Invoices.jsx', 'utf8');
assert.match(invPortalPage, /PortalLinks\b/, 'invoice detail must render the portal link section');
assert.match(invPortalPage, /action: "create_link"/, 'invoice detail must create portal links');
assert.match(invPortalPage, /action: "revoke_link"/, 'invoice detail must revoke portal links');
assert.match(invPortalPage, /\/customerportal\?token=/, 'invoice detail must build the portal URL');
assert.match(invPortalPage, /action: "email_invoice"/, 'invoice detail must offer email-to-customer');
assert.match(invPortalPage, /Overdue/, 'invoice list must flag overdue rows');

const palette = readFileSync('src/components/CommandPalette.jsx', 'utf8');
assert.match(palette, /ctrlKey \|\| e\.metaKey/, 'command palette must bind ctrl/cmd+k');
assert.match(palette, /action: "global_search"/, 'command palette must reuse the global_search action');
assert.match(palette, /pagesConfig\?\.Pages/, 'command palette must index routed pages');
assert.match(palette, /\/Opportunities\?open=/, 'command palette must deep-link opportunities');
assert.match(palette, /\/Invoices\?invoice=/, 'command palette must deep-link invoices');
assert.match(appShell, /<CommandPalette \/>/, 'app shell must mount the command palette');
assert.match(poPage, /Overdue/, 'PO list must flag overdue rows');
assert.match(entry, /lost_reasons: lostReasons/, 'funnel must report loss reasons');
assert.match(entry, /No reason given/, 'funnel must bucket unreasoned losses');
assert.match(oppPage2, /Loss reasons/, 'pipeline view must render loss reasons');
assert.match(palette, /getSessionToken\(\)/, 'command palette must use the shared token helper');
assert.match(portalFn, /loadPortalAnnouncements/, 'portal bootstrap must load announcements');
assert.match(portalFn, /display_pages.*customerportal|customerportal.*display_pages/, 'portal announcements must be explicitly targeted');
assert.match(portalPage, /data\?\.announcements/, 'portal page must render announcements');
const annManager = readFileSync('src/components/announcements/AnnouncementManager.jsx', 'utf8');
assert.match(annManager, /customerportal/, 'announcement manager must offer the portal page target');
assert.match(entry, /payments: \(Array\.isArray\(payments\)/, 'customer 360 must return payments for the statement');
assert.match(custDetailPage, /statementHtml/, 'customer 360 must render a printable statement');
assert.match(custDetailPage, /escHtml/, 'statement must escape customer-supplied values');
assert.match(invoicing, /action === "revenue_summary"/, 'invoicing must expose a revenue summary for reporting');
assert.match(invoicing, /overdue_count/, 'revenue summary must report overdue AR');
const dashboard = readFileSync('src/pages/ReportingDashboard.jsx', 'utf8');
assert.match(dashboard, /revenue_summary/, 'dashboard must load the revenue summary');
assert.match(dashboard, /list_opportunities/, 'dashboard must load the sales funnel');
assert.match(dashboard, /useAuth/, 'dashboard financial layer must be session-authenticated');
const homePage = readFileSync('src/pages/Home.jsx', 'utf8');
assert.match(homePage, /Navigate/, 'the dead /Home route must redirect to a real page');

const savedViews = readFileSync('src/components/workflow/SavedViews.jsx', 'utf8');
assert.match(savedViews, /localStorage/, 'saved views must persist presets');
assert.match(invoicesPage, /SavedViews/, 'invoices must wire saved views');
assert.match(poPage, /SavedViews/, 'purchase orders must wire saved views');
const oppPage3 = oppPage2;
assert.match(oppPage3, /SavedViews/, 'opportunities must wire saved views');
assert.match(invoicing, /send_past_due_reminder/, 'invoicing must expose past-due reminders');
assert.match(invoicesPage, /send_past_due_reminder/, 'invoice detail must offer a past-due reminder');
assert.match(oppPage3, /dupes/, 'intake must warn on possible duplicate customers');
assert.match(entry, /attention_feed/, 'workspace must expose an attention feed');
assert.match(entry, /read_by_staff: false/, 'attention feed must count unread portal messages');
const attentionFeed = readFileSync('src/components/workflow/AttentionFeed.jsx', 'utf8');
assert.match(attentionFeed, /attention_feed/, 'attention feed must call the workspace action');
const mainWorkflow = readFileSync('src/pages/MainWorkflow.jsx', 'utf8');
assert.match(mainWorkflow, /AttentionFeed/, 'main workflow must mount the attention feed');
const traveler = readFileSync('src/pages/WorkOrderTraveler.jsx', 'utf8');
assert.match(traveler, /window\.print/, 'traveler must be printable');
assert.match(appShell, /WorkOrderTraveler/, 'traveler route must be registered');
const woDialog = readFileSync('src/components/workflow/WorkOrderDetailsDialog.jsx', 'utf8');
assert.match(woDialog, /Print Traveler/, 'work order dialog must link to the traveler');
assert.match(oppPage3, /PipelineBoard/, 'opportunities must include a kanban board view');
assert.match(oppPage3, /text\/opp-id/, 'board must support drag-drop stage moves');
assert.match(entry, /work_orders: \(Array\.isArray\(wos\)/, 'global search must include work orders');
assert.match(palette, /work_orders/, 'command palette must surface work orders');
assert.match(mainWorkflow, /\?wo=|get\("wo"\)/, 'main workflow must deep-link work orders');
const coPage2 = readFileSync('src/pages/ChangeOrders.jsx', 'utf8');
assert.match(coPage2, /SavedViews/, 'change orders must wire saved views');
const stockPage = readFileSync('src/pages/Inventory.jsx', 'utf8');
assert.match(stockPage, /SavedViews/, 'inventory must wire saved views');
const sched = readFileSync('src/pages/ProductionSchedule.jsx', 'utf8');
assert.match(sched, /buildWorkOrderSegments/, 'production schedule must reuse timeline segments');
assert.match(sched, /useAllWorkOrders/, 'production schedule must use the work order cache');
assert.match(appShell, /ProductionSchedule/, 'production schedule route must be registered');
assert.match(oppPage3, /snooze/, 'follow-ups must offer snooze presets');
assert.match(invoicesPage, /overdueOnly/, 'invoices must offer an overdue-only filter');
assert.match(dashboard, /Won vs lost/, 'dashboard must chart won/lost by month');
assert.match(entry, /opportunity_id: clean\(r\?\.opportunity_id\)/, 'attention feed must link requests to their opportunity');
assert.match(portalFn, /mark_all_read/, 'portal must expose a mark-all-read staff action');
assert.match(attentionFeed, /mark_all_read/, 'attention feed must offer mark-all-read');
assert.match(dashboard, /AttentionFeed/, 'dashboard must mount the attention feed');
assert.match(invoicesPage, /remindAllOverdue/, 'invoices must offer bulk overdue reminders');

console.log('PASS opportunity workspace contracts (backend-only entities, guarded handoff, idempotent creates, routing)');
assert.match(coPage2, /bulkApprove/, 'change orders must offer batch approval');
assert.match(coPage2, /bulkReject/, 'change orders must offer batch rejection');
assert.match(invoicesPage, /bulkIssue/, 'invoices must offer batch draft issuing');
assert.match(entry, /low_stock/, 'attention feed must expose low stock');
assert.match(entry, /overdue_jobs/, 'attention feed must expose overdue jobs');
assert.match(entry, /expiring_permits/, 'attention feed must expose expiring permits');
assert.match(entry, /permit_fees_due/, 'attention feed must expose permit fees due');
assert.match(attentionFeed, /low_stock/, 'attention feed UI must show low stock');
assert.match(attentionFeed, /overdue_jobs/, 'attention feed UI must show overdue jobs');
assert.match(attentionFeed, /expiring_permits/, 'attention feed UI must show expiring permits');
assert.match(attentionFeed, /permit_fees_due/, 'attention feed UI must show permit fees due');
assert.match(invoicing, /email_statement/, 'invoicing must expose statement emails');
assert.match(invoicesPage, /email_statement/, 'invoice detail must offer email statement');
const quoteDelivery = readFileSync('base44/functions/recordEstimateQuoteDelivery/entry.ts', 'utf8');
assert.match(quoteDelivery, /safeUrl/, 'quote delivery must route attachment_file_url through safeUrl');
assert.match(quoteDelivery, /attachment_file_url:\s*safeUrl/, 'attachment_file_url must be URL-safe-filtered');
const revAudit = readFileSync('base44/functions/updateEstimateRevisionAudit/entry.ts', 'utf8');
assert.match(revAudit, /https\?:/, 'delivery evidence must gate attachment_file_url to http(s) schemes');
const acceptFn = readFileSync('base44/functions/recordEstimateAcceptance/entry.ts', 'utf8');
assert.match(acceptFn, /javascript\|data\|vbscript/, 'acceptance evidence_reference must reject dangerous URL schemes');

const poPageV = readFileSync('src/pages/PurchaseOrders.jsx', 'utf8');
assert.match(poPageV, /Fill every line with its full open quantity/, 'PO receive must offer fill-all');
const layoutShell = readFileSync('src/Layout.jsx', 'utf8');
assert.match(layoutShell, /AttentionBell/, 'shell must mount the attention bell');
assert.ok(existsSync('src/components/workflow/AttentionBell.jsx'), 'attention bell component must exist');
const queuesPage = readFileSync('src/pages/EstimatorQueues.jsx', 'utf8');
assert.match(queuesPage, /expiryOf/, 'estimate queues must detect quote expiry');
assert.match(queuesPage, /buckets/, 'estimate queues must show per-status counts');
assert.match(queuesPage, /Search/, 'estimate queues must offer search');
for (const t of ['test-aio-pricing.mjs','test-quote-lifecycle.mjs','test-customer-quote.mjs','test-customer-pricing.mjs','test-entity-persistence.mjs','test-estimate-cas.mjs','test-estimate-lifecycle.mjs','test-estimate-save-recovery.mjs','test-builder-persistence.mjs','test-module-registry.mjs','test-sales-activity.mjs','test-builder-service.mjs','test-builder-recovery.mjs','test-quick-price-persistence.mjs','test-customer-persistence.mjs']) {
  assert.ok(existsSync(`scripts/${t}`), `hardening test ${t} must exist`);
}
for (const t of ['test-nav-wiring.mjs','test-mutation-guard.mjs','test-quick-price-persistence.mjs','test-customer-persistence.mjs','test-builder-service.mjs','test-builder-recovery.mjs','test-sales-activity.mjs','test-module-registry.mjs','test-profitability.mjs']) {
  assert.ok(existsSync(`scripts/${t}`), `hardening test ${t} must exist`);
}
for (const t of ['test-estimate-cas.mjs','test-estimate-lifecycle.mjs','test-estimate-save-recovery.mjs','test-customer-sync.mjs','test-mutation-guard.mjs','test-builder-persistence.mjs','test-builder-recovery.mjs','test-builder-service.mjs','test-builder-product.mjs','test-quick-price-persistence.mjs','test-customer-persistence.mjs','test-module-registry.mjs','test-sales-activity.mjs','test-profitability.mjs','test-quote-defaults.mjs','test-nav-wiring.mjs','test-extract-parts.mjs','test-foundation-schema.mjs','test-inventory-persistence.mjs','test-exclusive-toggle.mjs','test-import-mappers.mjs','test-inventory-sources.mjs','test-labor-schema.mjs','test-priority-reorder.mjs','test-revision-service.mjs']) {
  assert.ok(existsSync(`scripts/${t}`), `hardening test ${t} must exist`);
}