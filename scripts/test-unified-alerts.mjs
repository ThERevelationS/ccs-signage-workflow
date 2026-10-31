// Contract checks for the unified-alerts rollout: notification/trigger
// registry, fire-and-forget mutation emitters, computed attention-feed
// sections, and deep links. Pure file assertions — no network, no data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const NEW_TRIGGERS = [
  'proof_sent', 'proof_approved', 'product_transition', 'crm_event_completed',
  'po_received', 'po_backordered', 'invoice_overdue', 'recon_variance',
];

const admin = readFileSync('src/pages/AdminSettings.jsx', 'utf8');
const service = readFileSync('src/components/workflow/NotificationService.jsx', 'utf8');
const feed = readFileSync('src/components/workflow/AttentionFeed.jsx', 'utf8');
const bell = readFileSync('src/components/workflow/AttentionBell.jsx', 'utf8');
const model = readFileSync('src/components/workflow/attentionComputedModel.js', 'utf8');
const engine = readFileSync('base44/shared/workflowTriggerEngine.ts', 'utf8');
const dispatcher = readFileSync('base44/functions/processWorkflowTriggers/entry.ts', 'utf8');
const conversion = readFileSync('src/components/estimator/workOrderConversion.js', 'utf8');
const proofPanel = readFileSync('src/components/proofs/ProofPanel.jsx', 'utf8');
const crmPersist = readFileSync('src/components/crm/crmActivityPersistence.js', 'utf8');
const poPage = readFileSync('src/pages/PurchaseOrders.jsx', 'utf8');
const reconWizard = readFileSync('src/components/reconciliation/ReconcileWizard.jsx', 'utf8');

// --- 1. Registry: all eight new trigger types registered + described --------
for (const t of NEW_TRIGGERS) {
  assert.ok(admin.includes(`value: "${t}"`), `AdminSettings TRIGGER_TYPES must register ${t}`);
  assert.ok(admin.includes(`${t}:`), `AdminSettings TRIGGER_HELP must describe ${t}`);
}
// Record-trigger capability set includes the ops events (invoice_overdue is
// computed-only and stays emitter-free).
for (const t of ['crm_event_completed', 'po_received', 'po_backordered', 'recon_variance']) {
  assert.ok(admin.includes(`"${t}"`), `OPS record-trigger set must include ${t}`);
}
assert.match(admin, /productStatusDrivesStage/, 'AdminSettings must document productStatusDrivesStage');
assert.match(admin, /off \| suggest \| auto|"off"|"suggest"|"auto"/, 'productStatusDrivesStage values must be documented');

// --- 2. Workflow engine + dispatcher accept every new event type ------------
for (const t of NEW_TRIGGERS) {
  assert.ok(engine.includes(`'${t}'`) || engine.includes(`"${t}"`), `workflowTriggerEngine must handle ${t}`);
  assert.ok(dispatcher.includes(`'${t}'`) || dispatcher.includes(`"${t}"`), `processWorkflowTriggers must allow ${t}`);
}
// Record-context mappings for record-scoped events.
for (const [t, entity] of [
  ['crm_event_completed', 'OpportunityActivity'],
  ['po_received', 'PurchaseOrder'],
  ['po_backordered', 'PurchaseOrder'],
  ['invoice_overdue', 'Invoice'],
  ['recon_variance', 'ReconciliationBatch'],
]) {
  assert.ok(engine.includes(`${t}: '${entity}'`), `engine must map ${t} -> ${entity}`);
}

// --- 3. Emitters: fire-and-forget notification calls at mutation points -----
assert.match(conversion, /NotificationTriggers\.productTransition/, 'shared product transition helper must emit product_transition');
assert.match(proofPanel, /NotificationTriggers\.proofSent/, 'ProofPanel must emit proof_sent');
assert.match(proofPanel, /NotificationTriggers\.proofApproved/, 'ProofPanel must emit proof_approved');
assert.match(crmPersist, /NotificationTriggers\.crmEventCompleted/, 'completeCrmEvent must emit crm_event_completed');
assert.match(poPage, /NotificationTriggers\.purchaseOrderReceived/, 'PO receiving must emit po_received on full receipt');
assert.match(poPage, /NotificationTriggers\.purchaseOrderBackordered/, 'PO receiving must emit po_backordered on partial receipt');
assert.match(reconWizard, /NotificationTriggers\.reconVariance/, 'recon close must emit recon_variance');
// All emission sites must be fire-and-forget (void promise — never blocks the mutation).
assert.match(conversion, /void NotificationTriggers\.productTransition/, 'product_transition must be fire-and-forget');
assert.match(proofPanel, /void NotificationTriggers\./, 'proof emitters must be fire-and-forget');
assert.match(crmPersist, /void NotificationTriggers\.crmEventCompleted/, 'crm_event_completed must be fire-and-forget');
assert.match(poPage, /void NotificationTriggers\.purchaseOrder/, 'po emitters must be fire-and-forget');
assert.match(reconWizard, /void NotificationTriggers\.reconVariance/, 'recon_variance must be fire-and-forget');
// invoice_overdue stays computed-only: no client emitter anywhere.
for (const src of [conversion, proofPanel, crmPersist, poPage, reconWizard]) {
  assert.ok(!src.includes('invoice_overdue'), 'no mutation emitter may send invoice_overdue');
}
// Convenience methods exist for the emitted types only.
for (const m of ['proofSent', 'proofApproved', 'productTransition', 'crmEventCompleted', 'purchaseOrderReceived', 'purchaseOrderBackordered', 'reconVariance']) {
  assert.ok(service.includes(`${m}:`), `NotificationTriggers.${m} must exist`);
}

// --- 4. Computed attention-feed sections ------------------------------------
for (const key of ['overdue_products', 'crm_events_due', 'comms_followups_due', 'recon_variance_batches']) {
  assert.ok(model.includes(`"${key}"`), `computed model must define section ${key}`);
  assert.ok(feed.includes(`key: "${key}"`), `AttentionFeed must render section ${key}`);
}
for (const fn of ['overdueProducts', 'dueCrmEvents', 'dueCommsFollowups', 'overdueInvoices', 'overdueOpenPos', 'varianceBatches', 'publishComputedAttention', 'computedAttentionCount']) {
  assert.ok(model.includes(`export function ${fn}`), `model must export ${fn}`);
}
assert.match(model, /findDueFollowups/, 'follow-ups must reuse findDueFollowups');
assert.match(model, /flattenQueueRows/, 'overdue products must reuse productQueueModel rows');
assert.match(model, /isOpenEvent/, 'CRM due events must reuse crmEventsModel openness');
assert.match(feed, /publishComputedAttention/, 'feed must publish computed sections for the bell');
assert.match(bell, /computedAttentionCount/, 'AttentionBell must include computed sections in its count');
assert.match(feed, /COMPUTED_SECTION_KEYS/, 'hide/snooze prefs must include computed section keys');

// --- 5. Required deep links --------------------------------------------------
for (const route of ['/ProductQueues', '/CrmEvents', '/CommsFollowups', '/Invoices?invoice=', '/PurchaseOrders?po=', '/Reconciliation']) {
  assert.ok(feed.includes(route), `AttentionFeed must deep-link ${route}`);
}

// --- 6. Existing behavior preserved ------------------------------------------
assert.ok(feed.includes('attention_handled'), 'handled-item localStorage behavior must remain');
assert.ok(feed.includes('attention_hidden_sections'), 'hidden-section behavior must remain');
assert.ok(feed.includes('attention_snoozed'), 'snooze behavior must remain');
assert.match(feed, /dedupeById/, 'server/computed rows must dedupe by id');

console.log('PASS unified-alerts');
