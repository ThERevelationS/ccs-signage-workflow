// B-10 + B-11 contract test: audience-routed product notes (channels, surface
// routing, append patch) and status-override required-reason (configured list,
// validation, ProductActivity 'override' audit payload). Also asserts the
// GlobalSettings.status_override_reasons entity field was added — and REGISTERS
// the known schema gap that WorkOrder.jsonc products[] items do not yet
// declare `notes` (B-10 model emits the canonical shape regardless).
// Run: node scripts/test-notes-override.mjs
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// --- Bundle the pure models (esbuild resolves the productAuditModel import) --
buildSync({
  entryPoints: [
    resolve(root, 'src/components/jobs/productNotesModel.js'),
    resolve(root, 'src/components/jobs/overrideReasonModel.js'),
  ],
  bundle: true, format: 'esm', splitting: true,
  outdir: resolve(here, '.tmp-notes-override-out'), logLevel: 'silent',
});
const notes = await import(pathToFileURL(resolve(here, '.tmp-notes-override-out/productNotesModel.js')).href);
const over = await import(pathToFileURL(resolve(here, '.tmp-notes-override-out/overrideReasonModel.js')).href);
const {
  NOTE_CHANNELS, DEFAULT_NOTE_CHANNEL, SURFACE_CHANNELS,
  normalizeNoteChannel, normalizeNoteEntry, visibleChannelsForSurface,
  productNotes, notesForChannel, notesForSurface, appendNote,
} = notes;
const {
  OVERRIDE_ERROR_CODES, OVERRIDE_ERROR_MESSAGES,
  normalizeOverrideReason, overrideReasons, activeReasons, applicableReasons,
  requiresReason, validateOverride, auditPayload,
} = over;

// === B-10: channel vocabulary + surface routing ==============================
assert.deepEqual(NOTE_CHANNELS, ['sales', 'design', 'production', 'customer', 'vendor'],
  'five canonical channels');
assert.equal(DEFAULT_NOTE_CHANNEL, 'sales', 'unlabeled notes default to internal sales channel');

assert.deepEqual(visibleChannelsForSurface('portal'), ['customer'],
  'portal sees customer channel only');
assert.deepEqual(visibleChannelsForSurface('jobWorkspace'), [...NOTE_CHANNELS],
  'jobWorkspace sees all channels');
assert.deepEqual(visibleChannelsForSurface('queue'), ['production', 'design'],
  'queue sees production + design only');
assert.deepEqual(visibleChannelsForSurface('someNewSurface'), [],
  'unknown surface fails closed');
const portalCopy = visibleChannelsForSurface('portal');
portalCopy.push('production');
assert.deepEqual(visibleChannelsForSurface('portal'), ['customer'],
  'returned channel list is a copy — SURFACE_CHANNELS map cannot be mutated');
assert.deepEqual(Object.keys(SURFACE_CHANNELS).sort(), ['jobWorkspace', 'portal', 'queue'],
  'documented surface map holds exactly the three surfaces');

// === B-10: normalizeNoteEntry ================================================
{
  const n = normalizeNoteEntry('replace the raceway before install');
  assert.equal(n.channel, 'sales', 'bare string → default channel');
  assert.equal(n.text, 'replace the raceway before install');
  assert.equal(n.author, '');
  assert.ok(n.created_at, 'created_at stamped');
}
{
  const n = normalizeNoteEntry({ id: 'n1', channel: 'Design', text: ' art v2 ', author: 'amy@shop', created_at: '2026-11-02T07:00:00Z' });
  assert.equal(n.channel, 'design', 'channel case-normalized');
  assert.equal(n.text, 'art v2', 'text trimmed');
  assert.equal(n.id, 'n1');
  assert.equal(n.author, 'amy@shop');
  assert.equal(n.created_at, '2026-11-02T07:00:00Z');
}
assert.equal(normalizeNoteEntry({ channel: 'bogus-channel', text: 'x' }).channel, 'sales',
  'unknown channel → default (never an orphan channel)');
assert.equal(normalizeNoteEntry(null), null, 'null entry dropped');
assert.equal(normalizeNoteChannel(' Customer '), 'customer');
assert.equal(normalizeNoteChannel('vendor'), 'vendor');
assert.equal(normalizeNoteChannel(''), 'sales', 'blank channel → default');

// === B-10: notesForChannel / notesForSurface =================================
const product = {
  id: 'p1',
  notes: [
    { id: 'a', channel: 'sales', text: 'cust wants blue', author: 'brett', created_at: '2026-11-01T10:00:00Z' },
    { id: 'b', channel: 'production', text: 'remake face 2', author: 'shop', created_at: '2026-11-01T11:00:00Z' },
    { id: 'c', channel: 'customer', text: 'proof approved — thanks!', author: 'brett', created_at: '2026-11-01T12:00:00Z' },
    { id: 'd', channel: 'design', text: 'kps vinyl', author: 'amy', created_at: '2026-11-01T13:00:00Z' },
    'legacy free-text note',
  ],
};
assert.equal(notesForChannel(product, 'production').length, 1, 'production channel filters');
assert.equal(notesForChannel(product, 'production')[0].text, 'remake face 2');
assert.equal(notesForChannel(product, 'customer').length, 1, 'customer channel filters');
assert.deepEqual(notesForChannel(product, 'bogus'), [], 'unknown channel → empty, fail-closed');
{
  const portalNotes = notesForSurface(product, 'portal');
  assert.equal(portalNotes.length, 1, 'portal renders only customer-routed notes');
  assert.equal(portalNotes[0].channel, 'customer');
}
{
  const queueNotes = notesForSurface(product, 'queue');
  assert.deepEqual(queueNotes.map((n) => n.channel).sort(), ['design', 'production'],
    'queue renders production + design, excludes sales/customer/vendor');
  assert.equal(notesForSurface(product, 'jobWorkspace').length, 5,
    'jobWorkspace renders every note including normalized legacy strings');
}
assert.equal(productNotes({}).length, 0, 'product with no notes → empty');
assert.equal(productNotes(null).length, 0, 'null product → empty');

// === B-10: appendNote patch ===================================================
{
  const patch = appendNote(product, { channel: 'vendor', text: 'PO 991 sent', author: 'brett' },
    { id: 'n-fixed', now: '2026-11-02T07:19:35.000Z' });
  assert.ok(Array.isArray(patch.notes), 'patch shape {notes:[...]}');
  assert.equal(patch.notes.length, 6, 'appends onto normalized existing');
  const last = patch.notes.at(-1);
  assert.equal(last.id, 'n-fixed', 'retry-safe id honored');
  assert.equal(last.channel, 'vendor');
  assert.equal(last.created_at, '2026-11-02T07:19:35.000Z');
  assert.equal(patch.notes[4].channel, 'sales', 'legacy string normalized into stored list');
}
assert.equal(appendNote(product, { channel: 'sales', text: '   ' }), null,
  'blank note text → null no-op patch');
assert.equal(appendNote(null, { channel: 'sales', text: 'hi' }).notes.length, 1,
  'append onto note-less product still emits {notes:[entry]}');

// === B-10/B-11: entity files =================================================
const gs = JSON.parse(readFileSync(resolve(root, 'base44/entities/GlobalSettings.jsonc'), 'utf8'));
assert.ok(gs.properties.status_override_reasons, 'GlobalSettings.status_override_reasons added');
assert.equal(gs.properties.status_override_reasons.type, 'array');
assert.deepEqual(
  Object.keys(gs.properties.status_override_reasons.items.properties).sort(),
  ['applies_to', 'label', 'requires_text', 'sort', 'status'],
  'item fields per brief');
assert.ok(gs.properties.pricing_variables, "w-42's pricing_variables preserved");

// SCHEMA GAP registration: products[].notes is not declared on
// WorkOrder.jsonc items yet — the model emits the canonical shape today and
// the field add is schema work for a later pass (DO NOT silently fix here).
const wo = JSON.parse(readFileSync(resolve(root, 'base44/entities/WorkOrder.jsonc'), 'utf8'));
const productItemProps = wo.properties.products.items.properties;
const notesFieldDeclared = !!productItemProps.notes;
console.log(notesFieldDeclared
  ? '[schema] products[].notes declared in WorkOrder.jsonc'
  : '[SCHEMA_GAP] products[].notes NOT declared in WorkOrder.jsonc — model emits canonical shape; schema add pending');
assert.ok(productItemProps.estimator_notes, 'sanity: products[] schema read correctly');
assert.ok(typeof notesFieldDeclared === 'boolean', 'gap check ran');

// === B-11: overrideReasons normalization =====================================
const settings = {
  statusOverrideReasons: [
    { label: 'Customer cancelled', applies_to: 'cancel_estimate', sort: 1, status: 'active' },
    { label: 'Other', requires_text: true, sort: 9, status: 'active' },
    { label: 'Rush approved by owner', sort: 2 },                       // applies_to unset → all types
    { label: 'Old reason', status: 'archived', sort: 3 },               // inert
    'Duplicate PO entry',                                              // bare string tolerated
  ],
};
{
  const list = overrideReasons(settings);
  assert.equal(list.length, 5, 'all rows normalized incl. bare string');
  assert.equal(list[0].label, 'Duplicate PO entry', 'unsorted (sort 0) bare string first');
  assert.equal(list[1].label, 'Customer cancelled', 'then sorted by sort asc');
  assert.equal(list.at(-1).label, 'Other');
  assert.deepEqual(list[1].applies_to, ['cancel_estimate'], 'applies_to normalized to array');
  assert.equal(activeReasons(settings).length, 4, 'archived row inert');
  assert.equal(normalizeOverrideReason({}), null, 'label-less row dropped');
}
assert.deepEqual(overrideReasons({ status_override_reasons: ['snake works'] })[0].label,
  'snake works', 'snake_case settings key accepted');

// === B-11: requiresReason =====================================================
assert.equal(requiresReason({}, 'status'), false, 'no configured list → optional');
assert.equal(requiresReason(null, 'status'), false);
assert.equal(requiresReason({ statusOverrideReasons: [] }, 'status'), false, 'empty list → optional');
assert.equal(requiresReason(settings, 'cancel_estimate'), true, 'applicable configured reason exists');
assert.equal(requiresReason(settings, 'due_date'), true, "unset applies_to ('Rush approved by owner', 'Other') applies to all");
assert.equal(requiresReason({ statusOverrideReasons: [{ label: 'X', applies_to: 'cancel_estimate' }] }, 'status'),
  false, 'list non-empty but nothing applies to this type → optional');
assert.equal(requiresReason({ statusOverrideReasons: [{ label: 'X', status: 'archived' }] }, 'status'),
  false, 'all-archived list → optional');

// === B-11: validateOverride ====================================================
assert.deepEqual(validateOverride({}, {}, 'status'), { ok: true, error: '' },
  'unconfigured → no reason needed');
assert.deepEqual(validateOverride({ reason: '' }, settings, 'cancel_estimate'),
  { ok: false, error: 'reason_required' }, 'configured + blank → required');
assert.deepEqual(validateOverride({ reason: 'made up excuse' }, settings, 'cancel_estimate'),
  { ok: false, error: 'reason_not_in_list' }, 'bogus label fails closed');
assert.deepEqual(validateOverride({ reason: 'Customer cancelled' }, settings, 'cancel_estimate'),
  { ok: true, error: '' }, 'applicable label passes');
assert.deepEqual(validateOverride({ reason: 'Other' }, settings, 'cancel_estimate'),
  { ok: false, error: 'custom_text_required' }, 'Other requires typed detail');
assert.deepEqual(validateOverride({ reason: 'Other', customText: 'cust signed waiver at counter' }, settings, 'cancel_estimate'),
  { ok: true, error: '' }, 'Other + customText passes');
{
  const s2 = { statusOverrideReasons: [{ label: 'Other' }] };  // flag forgotten — label alone still forces text
  assert.equal(validateOverride({ reason: 'Other' }, s2, 'status').error, 'custom_text_required',
    "'Other' forces text even without requires_text flag");
}
{
  const s3 = { statusOverrideReasons: [{ label: 'Force-close', requires_text: true }] };
  assert.equal(validateOverride({ reason: 'Force-close' }, s3, 'status').error, 'custom_text_required',
    'requires_text flag on any label enforced');
}
{
  const s4 = { statusOverrideReasons: [{ label: 'Estimate voided', applies_to: 'cancel_estimate' }] };
  assert.deepEqual(validateOverride({ reason: 'Estimate voided' }, s4, 'status'),
    { ok: true, error: '' }, 'reason not applicable to this type → optional, still accepted');
}
assert.ok(OVERRIDE_ERROR_CODES.includes('reason_required')
  && OVERRIDE_ERROR_CODES.includes('reason_not_in_list')
  && OVERRIDE_ERROR_CODES.includes('custom_text_required'), 'error codes stable');
for (const code of OVERRIDE_ERROR_CODES) {
  assert.ok(OVERRIDE_ERROR_MESSAGES[code], `message for ${code}`);
}

// === B-11: auditPayload → B-12 ProductActivity shape ===========================
const row = auditPayload({
  override: { type: 'status', field: 'operational_status', from: 'design_review', to: 'in_production', work_order_id: 'wo-9', product_id: 'p1', product_label: 'Channel Letters' },
  reason: { label: 'Other', customText: 'owner approved skip' },
  actor: 'Brett H', actorType: 'staff', now: '2026-11-02T07:19:35.000Z',
});
assert.equal(row.event_type, 'override', 'typed override event');
assert.equal(row.schema_version, 1, 'B-12 schema_version present');
assert.equal(row.work_order_id, 'wo-9');
assert.equal(row.product_id, 'p1');
assert.equal(row.actor_type, 'staff');
assert.equal(row.actor_label, 'Brett H');
assert.equal(row.from_value, 'design_review');
assert.equal(row.to_value, 'in_production');
assert.equal(row.note, 'Other — owner approved skip', 'reason lands in note');
assert.equal(row.occurred_at, '2026-11-02T07:19:35.000Z');
assert.equal(row.details.field, 'operational_status');
assert.equal(row.details.override_type, 'status');
assert.equal(row.details.reason_label, 'Other');
assert.equal(row.details.custom_text, 'owner approved skip');
{
  const pa = JSON.parse(readFileSync(resolve(root, 'base44/entities/ProductActivity.jsonc'), 'utf8'));
  assert.ok(pa.properties.event_type.enum.includes(row.event_type), 'entity enum covers emitted event_type');
  for (const f of pa.required) assert.ok(row[f] !== undefined && row[f] !== '', `required field ${f} populated`);
}
{
  const sys = auditPayload({ override: { to: 'vended' }, reason: 'Bulk close', actorType: 'system', actor: 'smartsheetSyncAction' });
  assert.equal(sys.actor_type, 'system', 'system rows supported');
  assert.equal(sys.note, 'Bulk close', 'string reason accepted');
}

rmSync(resolve(here, '.tmp-notes-override-out'), { recursive: true, force: true });
console.log('PASS notes-override');
