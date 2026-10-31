import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Contract checks for the scale/truncation hardening pass:
//  - Permitting must never prime the shared loadAllEntityRows cache with a
//    possibly-truncated batch page (partial rows served as "all rows").
//  - workOrderCache must expose the backend `truncated` flag from FULL pulls
//    (the delta branch already resyncs on a truncated delta).
//  - Silent-failure sites keep the corrected call forms.
const permitting = readFileSync('src/pages/Permitting.jsx', 'utf8');
const workOrderCache = readFileSync('src/lib/workOrderCache.js', 'utf8');
const mainWorkflow = readFileSync('src/pages/MainWorkflow.jsx', 'utf8');
const estimatorQueues = readFileSync('src/pages/EstimatorQueues.jsx', 'utf8');
const quoteSettings = readFileSync('src/pages/QuoteSettings.jsx', 'utf8');
const estimatorCustomers = readFileSync('src/pages/EstimatorCustomers.jsx', 'utf8');
const permitIntegration = readFileSync('src/components/permitting/permitLineItemIntegration.js', 'utf8');
const auditLog = readFileSync('src/pages/AuditLog.jsx', 'utf8');
const clientSearch = readFileSync('src/components/ClientSearchInput.jsx', 'utf8');

// ── Permitting: batch reads carry an explicit limit and priming is honest ──
assert.match(permitting, /const BATCH_READ_LIMIT = 500;/, 'Permitting must declare an explicit batch read limit');
for (const entity of ['PermitLineItem', 'PermitLocality', 'AuthorizedEmail']) {
  assert.match(
    permitting,
    new RegExp(`entity: "${entity}"[^}]*limit: BATCH_READ_LIMIT`),
    `${entity} batch request must pass an explicit limit`,
  );
  assert.match(
    permitting,
    new RegExp(`Array\\.isArray\\(batched\\?\\.${entity}\\) && batched\\.${entity}\\.length < BATCH_READ_LIMIT`),
    `${entity} may only prime the cache when the batch returned fewer than the requested limit`,
  );
}
assert.ok(
  !/batched\?\.\w+\s*\?\s*Promise\.resolve\(primeAndReturn/.test(permitting),
  'no batch result may prime the shared cache unconditionally',
);

// ── workOrderCache: a truncated FULL pull is surfaced, not swallowed ──
assert.match(workOrderCache, /truncated: false,/, 'board state must track truncation');
assert.match(workOrderCache, /state\.truncated = data\.truncated === true;/, 'full pulls must record the backend truncated flag');
assert.match(workOrderCache, /dataIsFullPull/, 'delta merges must not clear a truncated base');
assert.match(workOrderCache, /console\.warn\(`\[workOrderCache\]/, 'a truncated pull must warn visibly');
assert.match(workOrderCache, /export function getBoardFeedMeta\(/, 'getBoardFeedMeta must be exported');
assert.match(workOrderCache, /export function useBoardFeedMeta\(/, 'useBoardFeedMeta hook must be exported');
assert.match(workOrderCache, /setQueryData\(boardMetaKey\(entity\)/, 'snapshots must publish meta for subscribers');

// ── MainWorkflow: honest "showing first N" banner on truncation ──
assert.match(mainWorkflow, /useBoardFeedMeta\("WorkOrder"\)/, 'MainWorkflow must read the feed meta');
assert.match(mainWorkflow, /Showing the first \{boardMeta\.count\} work orders/, 'MainWorkflow must show the truncation banner');

// ── EstimatorQueues: post-bulk reload goes through the staff gateway ──
assert.ok(
  !estimatorQueues.includes('entity: base44.entities.AllInOneEstimate'),
  'EstimatorQueues must not reload via the RLS-blocked entity client',
);
assert.match(
  estimatorQueues,
  /loadAllEntityRows\(\{ entity: staffEntities\.AllInOneEstimate, sort: "-created_date", label: "Estimator queue" \}\)/,
  'EstimatorQueues reload must use the staff gateway path',
);

// ── QuoteSettings / EstimatorCustomers: entity-first staffEntities call form ──
assert.ok(
  !/staffEntities\.(list|filter|create|update|delete|get|count|updateMany|deleteMany)\(/.test(quoteSettings),
  'QuoteSettings must not call staffEntities methods with an entity-name first arg',
);
for (const call of ['staffEntities.TaxGroup.list(', 'staffEntities.TaxGroup.create(', 'staffEntities.TaxGroup.update(', 'staffEntities.TaxGroup.delete(']) {
  assert.ok(quoteSettings.includes(call), `QuoteSettings must use ${call}`);
}
assert.ok(
  !/staffEntities\.(list|filter|create|update|delete|get|count|updateMany|deleteMany)\(/.test(estimatorCustomers),
  'EstimatorCustomers must not call staffEntities methods with an entity-name first arg',
);
assert.match(estimatorCustomers, /staffEntities\.MarkupTier\.update\(/, 'tier import must use staffEntities.MarkupTier.update');
assert.match(estimatorCustomers, /staffEntities\.MarkupTier\.create\(/, 'tier import must use staffEntities.MarkupTier.create');

// ── permitLineItemIntegration: no silently-dropped options ──
assert.ok(
  !/fields:\s*\[/.test(permitIntegration),
  'permitLineItemIntegration must not pass a fields option the gateway facade drops',
);
assert.equal(
  (permitIntegration.match(/staffEntities\.PermitLineItem\.filter\(/g) || []).length,
  2,
  'both dedup reads keep the staffEntities filter',
);

// ── Visible-cap notices ──
assert.match(auditLog, /setCapped\(/, 'AuditLog must flag capped loads');
assert.match(auditLog, /showing newest only \(capped\)/, 'AuditLog header must disclose the cap');
assert.match(clientSearch, /setScannedCap\(/, 'ClientSearchInput must flag a full scan window');
assert.match(clientSearch, /From the 100 most recent projects/, 'recent clients dropdown must disclose the scan bound');

console.log('PASS scale-frontend');
