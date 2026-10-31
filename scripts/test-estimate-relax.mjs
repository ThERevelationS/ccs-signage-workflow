import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Contract checks for the "estimates are documents" relaxation:
// one-click Edit auto-opens a revision on protected estimates, trash/restore
// works for every status, queue rows expose quick actions, and no estimate
// path ever writes inventory.

const detail = readFileSync('src/pages/EstimateDetail.jsx', 'utf8');
const queues = readFileSync('src/pages/EstimatorQueues.jsx', 'utf8');
const header = readFileSync('src/components/estimator/aio/AioEstimateHeader.jsx', 'utf8');
const rail = readFileSync('src/components/estimator/aio/AioStepRail.jsx', 'utf8');
const revisionService = readFileSync('src/components/estimator/estimateRevisionService.js', 'utf8');
const persistence = readFileSync('src/components/estimator/estimatePersistence.js', 'utf8');
const creation = readFileSync('src/components/estimator/estimateCreationService.js', 'utf8');
const workOrderConversion = readFileSync('src/components/estimator/workOrderConversion.js', 'utf8');

// --- 1. Protected statuses get a one-click Edit that auto-opens a revision.
assert.match(detail, /const handleEditProtected = async \(\)/, 'EstimateDetail must define the one-click Edit handler');
assert.match(detail, /const canEditWithRevision = readOnly && persistedStatus !== "cancelled"/, 'Edit affordance must cover protected statuses except terminal cancelled');
assert.match(detail, /const readOnly = isEstimateProtected\(persistedStatus\) && !openRevision/, 'readOnly still derives from protected status with an open-revision escape hatch');
assert.match(detail, /getOpenEstimateRevision\(estimate\.id\)/, 'Edit must jump to an already-open revision instead of duplicating one');
assert.match(detail, /await handleStartRevision\(`Edit — reopened \$\{persistedStatus\} estimate for editing`\)/, 'Edit must reuse the existing revision starter with an audit reason');
assert.match(detail, /startEstimateRevision/, 'revision start must flow through startEstimateRevision');
assert.match(revisionService, /export async function startEstimateRevision/, 'startEstimateRevision remains the revision creator');
assert.match(revisionService, /ensureOpenEstimateRevision/, 'the deployed ensureOpenEstimateRevision function backs revision creation');
assert.match(detail, /onEdit=\{canEditWithRevision \? handleEditProtected : null\}/, 'header and step rail must receive the Edit affordance');
assert.match(header, /readOnly && onEdit/, 'AioEstimateHeader must render Edit instead of a dead "Protected" button');
assert.match(header, /PencilLine/, 'header Edit button must carry the edit icon');
assert.match(rail, /readOnly && onEdit \? onEdit : onSaveProgress/, 'step rail button must route to Edit when protected');
assert.match(detail, /onClick=\{handleEditProtected\} disabled=\{editStarting\}/, 'the protected banner must expose the Edit button');
assert.match(detail, /handleStartRevision\(reason\)/, 'the manual revision panel path still exists alongside auto-Edit');

// --- 2. Trash/restore work for ALL estimates; the Work Order guard stays but links to the job.
assert.match(detail, /softDeleteEstimateFromLoadedSnapshot/, 'trash must use the CAS soft-delete helper');
assert.match(detail, /restoreEstimateFromLoadedTrashSnapshot/, 'restore must use the CAS restore helper');
assert.match(detail, /if \(estimate\.work_order_id\) \{[\s\S]*?navigate\(`\/JobWorkspace\?wo=\$\{estimate\.work_order_id\}`\)/, 'WO-linked trash guard must deep-link the job instead of dead-ending');
assert.match(detail, /\{!estimate\.work_order_id && \(\s*<button type="button"\s*onClick=\{handleMoveToTrash\}/, 'Move to Trash must render for every status — including cancelled — unless a Work Order is linked');
assert.match(queues, /const handleRestore = async \(e\)/, 'queue restore action must remain');
assert.match(queues, /permanentlyDeleteTrashedEstimate/, 'queue permanent delete must remain');
assert.match(persistence, /export async function softDeleteEstimateFromLoadedSnapshot/, 'soft-delete helper must remain CAS-anchored on the loaded snapshot');
assert.match(persistence, /export async function restoreEstimateFromLoadedTrashSnapshot/, 'restore helper must remain CAS-anchored');

// --- 3. EstimatorQueues inline quick actions reuse the existing CAS-safe helpers.
assert.match(queues, /const handleQuickDuplicate = async \(e\)/, 'queue must expose a duplicate quick action');
assert.match(queues, /await duplicateEstimate\(\{/, 'queue duplicate must reuse duplicateEstimate');
assert.match(queues, /newEstimateCreationKey\(\)/, 'queue duplicate must reuse retry-safe creation keys');
assert.match(queues, /const handleQuickArchive = async \(e\)/, 'queue must expose an archive quick action');
assert.match(queues, /isEstimateStatusTransitionAllowed\(e\.status, "archived", statusMap\)/, 'queue archive must honor the status transition map');
assert.match(queues, /replaceEstimateFieldsIfUnchanged\(\{[\s\S]*?label: "Estimate archive"/, 'queue archive must use the CAS field update');
assert.match(queues, /ensureEstimateLifecycleRevision\(\{[\s\S]*?queue_archive:/, 'queue archive must record a lifecycle audit row');
assert.match(queues, /const handleQuickTrash = async \(e\)/, 'queue must expose a trash quick action');
assert.match(queues, /softDeleteEstimateFromLoadedSnapshot\(\{[\s\S]*?estimate: e,/, 'queue trash must reuse the CAS soft-delete helper');
assert.match(queues, /navigate\(`\/JobWorkspace\?wo=\$\{e\.work_order_id\}`\)/, 'queue WO trash guard must deep-link the job');
assert.match(queues, /getOpenEstimateRevision\(e\.id\)/, 'queue trash must refuse while a revision is open');
assert.match(queues, /import \{ useMemo, useState, useEffect, useRef \} from "react"/, 'useRef must be imported (importEstRef/quickKeysRef depend on it)');

// --- 4. NO-INVENTORY GUARANTEE: estimate save/edit/delete paths never write inventory.
for (const [name, src] of Object.entries({
  'src/pages/EstimateDetail.jsx': detail,
  'src/pages/EstimatorQueues.jsx': queues,
  'src/components/estimator/aio/AioEstimateHeader.jsx': header,
  'src/components/estimator/aio/AioStepRail.jsx': rail,
  'src/components/estimator/estimateRevisionService.js': revisionService,
  'src/components/estimator/estimatePersistence.js': persistence,
  'src/components/estimator/estimateCreationService.js': creation,
  'src/components/estimator/workOrderConversion.js': workOrderConversion,
})) {
  assert.ok(!/InventoryMovement/.test(src), `${name} must not reference InventoryMovement`);
  assert.ok(!/inventoryAction/.test(src), `${name} must not invoke inventoryAction`);
}

console.log('PASS estimate-relax');
