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
for (const action of ['search_customers', 'list_opportunities', 'get_opportunity', 'capture_intake', 'update_opportunity', 'resolve_intake', 'link_work_order', 'request_estimate']) {
  assert.ok(entry.includes(`"${action}"`) || entry.includes(`action === "${action}"`), `action ${action} must be handled`);
}

// Handoff safety: frozen snapshot, idempotent creates, CAS updates, closed-stage guard.
assert.match(entry, /buildHandoffSnapshot/, 'request_estimate must build a handoff snapshot');
assert.match(entry, /createFoundationRecordWithRecovery/, 'creates must use retry-safe recovery');
assert.match(entry, /replaceFoundationFieldsIfUnchanged/, 'updates must be compare-and-set');
assert.match(entry, /replaceEstimatingRequestFieldsIfUnchanged/, 'request updates must honor the frozen snapshot guard');
assert.match(entry, /CLOSED_STAGES\.has\(clean\(opportunity\.stage\)\)/, 'closed opportunities must not request estimates');
assert.match(shared, /handoff_snapshot is frozen after submission/, 'snapshot freeze guard must exist in shared persistence');

// Frontend: backend-only entities are never touched directly from the page.
assert.ok(!page.includes('entities.Opportunity'), 'page must not call entity SDK for backend-only entities');
assert.match(page, /functions\.invoke\("opportunityWorkspaceAction"/, 'page must invoke the workspace function');
assert.match(page, /action: "capture_intake"|action:"capture_intake"/, 'page must support intake capture');
assert.match(page, /action: "request_estimate"|action:"request_estimate"/, 'page must support the estimate handoff');
assert.match(page, /creation_request_key: (uuid\(\)|keyRef\.current)/, 'client must supply idempotent creation keys');
assert.match(page, /`\/EstimateDetail\?id=\$\{estimateId\}`|\/EstimateDetail\?id=/, 'handoff must navigate to the created estimate');

// Convergence: estimate→pipeline sync must locate the compatibility WorkOrder
// by stable links, carry the link fields, and back-link the Opportunity.
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

// Wiring: route + navigation.
assert.match(config, /import Opportunities from '\.\/pages\/Opportunities'/, 'pages.config must import the page');
assert.match(config, /"Opportunities": Opportunities/, 'pages.config must register the route');
assert.match(layout, /title: "Opportunities", url: createPageUrl\("Opportunities"\)/, 'Layout nav must link the page');
assert.match(layout, /createPageUrl\("Opportunities"\)/, 'Opportunities must be a root route');

console.log('PASS opportunity workspace contracts (backend-only entities, guarded handoff, idempotent creates, routing)');
