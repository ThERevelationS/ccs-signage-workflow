import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-custom-status.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/customStatusModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  BUILTIN_STATUSES,
  BUILTIN_TRANSITIONS,
  BUILTIN_TERMINAL_STATUSES,
  BUILTIN_PROTECTED_ENTRY_STATUSES,
  BUILTIN_CUSTOM_TARGET_STATUSES,
  slugifyStatusKey,
  normalizeStatusValue,
  humanizeStatusKey,
  isCustomStatusKey,
  customStatusRow,
  customStatusRowsFromStorage,
  statusVocabulary,
  transitionGraph,
  isTerminalStatus,
  canTransition,
  statusPickerRows,
  quoteDefaultsStatusPatch,
  validateCustomStatuses,
  canonicalStatusBucket,
} = await import(pathToFileURL(out).href);

// --- Builtin vocabulary (AllInOneEstimate.jsonc status enum) ----------------
assert.deepEqual([...BUILTIN_STATUSES],
  ['draft', 'calculated', 'sent', 'approved', 'archived', 'cancelled'],
  'builtin enum = the six persisted entity values');
assert.deepEqual(BUILTIN_TRANSITIONS.sent, ['approved', 'archived', 'cancelled']);
assert.deepEqual(BUILTIN_TRANSITIONS.cancelled, [], 'cancelled has no outgoing');
assert.deepEqual([...BUILTIN_TERMINAL_STATUSES], ['cancelled'], 'graph-derived terminal');
assert.deepEqual([...BUILTIN_PROTECTED_ENTRY_STATUSES],
  ['draft', 'calculated', 'sent', 'approved']);
assert.deepEqual([...BUILTIN_CUSTOM_TARGET_STATUSES], ['archived', 'cancelled'],
  'customs may always end in archived/cancelled');

// --- Scalar helpers ----------------------------------------------------------
assert.equal(slugifyStatusKey(' Awaiting  Permit! '), 'awaiting_permit');
assert.equal(slugifyStatusKey('__weird__'), 'weird');
assert.equal(normalizeStatusValue(''), 'draft', 'blank status value = draft');
assert.equal(normalizeStatusValue(' Sent '), 'sent');
assert.equal(humanizeStatusKey('on_hold'), 'On Hold');
assert.equal(isCustomStatusKey('on_hold'), true);
assert.equal(isCustomStatusKey('sent'), false, 'builtin is not a custom key');
assert.equal(isCustomStatusKey('Bad-Key'), false, 'hyphens are not snake_case');

// --- customStatusRow normalization -------------------------------------------
{
  const row = customStatusRow({ key: 'On Hold!!', color: '#A1B2C3', transitions_to: ['archived', 'on_hold', 'cancelled', 'cancelled'] });
  assert.equal(row.key, 'on_hold', 'key slugified');
  assert.equal(row.label, 'On Hold', 'label falls back to humanized key');
  assert.equal(row.color, '#a1b2c3', 'hex color normalized lowercase');
  assert.deepEqual(row.transitions_to, ['archived', 'cancelled'], 'self + dup targets stripped');
  assert.equal(row.terminal, false);
}
assert.throws(() => customStatusRow({ key: 'sent' }), /collides/, 'builtin key rejected');
assert.throws(() => customStatusRow({ key: '!!!' }), /required/, 'unusable key rejected');
{
  const row = customStatusRow({ key: 'mgr_review', label: 'Manager Review', terminal: true, transitions_to: ['sent'], bucket: 'won', roles: ['Admin', ' admin '] });
  assert.equal(row.terminal, true);
  assert.equal(row.bucket, '', 'non-builtin bucket dropped');
  assert.deepEqual(row.roles, ['admin'], 'roles normalized lowercase, deduped');
  assert.deepEqual(row.transitions_to, ['sent'], 'declared edges kept on the row (graph filters)');
}

// --- customStatusRowsFromStorage ----------------------------------------------
{
  const rows = customStatusRowsFromStorage('["on_hold","in_prod","sent"]',
    '{"on_hold":{"label":"On Hold","color":"#ff0000","terminal":false,"bucket":"sent"}}');
  assert.equal(rows.length, 2, 'builtin slug skipped from stored list');
  assert.equal(rows[0].key, 'on_hold');
  assert.equal(rows[0].label, 'On Hold', 'meta label applied');
  assert.equal(rows[0].bucket, 'sent', 'meta bucket applied');
  assert.equal(rows[1].key, 'in_prod');
}
assert.deepEqual(customStatusRowsFromStorage('', ''), [], 'blank storage → no rows');
assert.deepEqual(customStatusRowsFromStorage('not json{', null), [], 'bad JSON → no rows');

// --- statusVocabulary ---------------------------------------------------------
{
  const customs = [customStatusRow({ key: 'z_review', label: 'Zeta Review' }),
                   customStatusRow({ key: 'a_hold', label: 'A Hold' })];
  const vocab = statusVocabulary(BUILTIN_STATUSES, customs);
  assert.equal(vocab.length, 8, '6 builtins + 2 customs');
  assert.equal(vocab[0].group, 'builtin');
  assert.equal(vocab[0].value, 'draft');
  assert.equal(vocab[6].value, 'a_hold', 'customs sorted by label after builtins');
  assert.equal(vocab[6].group, 'custom');
  assert.equal(vocab[7].value, 'z_review');
  const cancelled = vocab.find((v) => v.value === 'cancelled');
  assert.equal(cancelled.terminal, true, 'builtin terminal flagged');
}

// --- transitionGraph -----------------------------------------------------------
{
  const customs = [
    customStatusRow({ key: 'on_hold', transitions_to: ['sent', 'archived', 'in_prod'] }),
    customStatusRow({ key: 'in_prod', transitions_to: ['approved', 'cancelled'], allow_builtin_reentry: true }),
  ];
  const graph = transitionGraph(BUILTIN_TRANSITIONS, customs);
  assert.ok(graph.on_hold instanceof Set);
  assert.deepEqual([...graph.on_hold].sort(), ['archived', 'in_prod'],
    'builtin reentry (sent) dropped without opt-in; custom target kept');
  assert.deepEqual([...graph.in_prod].sort(), ['approved', 'cancelled'],
    'allow_builtin_reentry keeps flow-state edges');
  assert.deepEqual([...graph.draft], [...BUILTIN_TRANSITIONS.draft], 'builtin rows preserved');
}
{
  // Override replace-row semantics (statusTransitionMap parity).
  const graph = transitionGraph(BUILTIN_TRANSITIONS, [], { sent: ['on_hold', 'approved'] });
  assert.deepEqual([...graph.sent].sort(), ['approved', 'on_hold'], 'override replaces builtin row wholesale');
  assert.ok(graph.on_hold instanceof Set && graph.on_hold.size === 0,
    'forward-referenced target gets an empty row');
}

// --- isTerminalStatus ------------------------------------------------------------
assert.equal(isTerminalStatus('cancelled', []), true);
assert.equal(isTerminalStatus('archived', []), false, 'archived can unarchive to draft');
assert.equal(isTerminalStatus('sent', []), false);
assert.equal(isTerminalStatus('stuck', [customStatusRow({ key: 'stuck' })]), true,
  'empty-outgoing custom is de facto terminal');
assert.equal(isTerminalStatus('flagged', [customStatusRow({ key: 'flagged', terminal: true, transitions_to: ['archived'] })]), true,
  'terminal flag wins over declared edges');
assert.equal(isTerminalStatus('openish', [customStatusRow({ key: 'openish', transitions_to: ['archived'] })]), false);
assert.equal(isTerminalStatus('mystery', []), false, 'unknown status not terminal');

// --- canTransition --------------------------------------------------------------
{
  const customs = [customStatusRow({ key: 'on_hold', transitions_to: ['sent', 'archived'] })];
  const overrides = { sent: ['approved', 'on_hold', 'archived', 'cancelled'] };
  assert.equal(canTransition('draft', 'sent', { customs }), true, 'builtin edge intact');
  assert.equal(canTransition('sent', 'draft', { customs }), false, 'sent cannot go back to draft');
  assert.equal(canTransition('cancelled', 'draft', { customs }), false, 'cancelled is terminal');
  assert.equal(canTransition('sent', 'on_hold', { customs, overrides }), true, 'override admits builtin→custom');
  assert.equal(canTransition('sent', 'on_hold', { customs }), false, 'no edge without override');
  assert.equal(canTransition('on_hold', 'archived', { customs }), true, 'custom → builtin end state');
  assert.equal(canTransition('on_hold', 'sent', { customs }), false, 'blocked reentry without opt-in');
  assert.equal(canTransition('legacy_state', 'draft', { customs }), true, 'unknown source stays permissive');
  assert.equal(canTransition('sent', 'sent', { customs }), true, 'same-status no-op allowed');
  assert.equal(canTransition('on_hold', 'sent', {
    customs: [customStatusRow({ key: 'on_hold', transitions_to: ['sent'], allow_builtin_reentry: true })],
  }), true, 'opt-in reentry allowed');
}
{
  // Role gate on the target custom row.
  const customs = [
    customStatusRow({ key: 'on_hold', transitions_to: ['archived', 'qa_gate'] }),
    customStatusRow({ key: 'qa_gate', transitions_to: ['archived'], roles: ['admin', 'manager'] }),
  ];
  const overrides = { on_hold: ['archived', 'qa_gate'] };
  assert.equal(canTransition('on_hold', 'qa_gate', { customs, overrides, actor_role: 'admin' }), true);
  assert.equal(canTransition('on_hold', 'qa_gate', { customs, overrides, actor_role: 'sales' }), false,
    'actor role not on the row list is blocked');
  assert.equal(canTransition('on_hold', 'archived', { customs, overrides, actor_role: 'sales' }), true,
    'unrestricted target unaffected by role gate');
}

// --- statusPickerRows -------------------------------------------------------------
{
  const customs = [customStatusRow({ key: 'on_hold', label: 'On Hold', color: '#ff8800', transitions_to: ['archived'] })];
  const vocab = statusVocabulary(BUILTIN_STATUSES, customs);
  const overrides = { sent: ['approved', 'on_hold', 'archived', 'cancelled'] };
  const rows = statusPickerRows(vocab, { current: 'sent', customs, overrides });
  const byValue = Object.fromEntries(rows.map((r) => [r.value, r]));
  assert.equal(byValue.sent.current, true, 'current flagged');
  assert.equal(byValue.sent.disabled, false);
  assert.equal(byValue.approved.disabled, false, 'approved reachable from sent');
  assert.equal(byValue.on_hold.disabled, false, 'override admits custom from sent');
  assert.equal(byValue.on_hold.group, 'custom');
  assert.equal(byValue.on_hold.color, '#ff8800');
  assert.equal(byValue.draft.disabled, true, 'draft unreachable from sent');
  assert.equal(byValue.draft.disabled_reason, 'transition_not_allowed');
  assert.equal(byValue.calculated.disabled_reason, 'transition_not_allowed');
}
{
  // Terminal source disables every non-current option.
  const vocab = statusVocabulary(BUILTIN_STATUSES, []);
  const rows = statusPickerRows(vocab, { current: 'cancelled' });
  assert.ok(rows.filter((r) => !r.current).every((r) => r.disabled && r.disabled_reason === 'terminal_source'),
    'cancelled source → all targets disabled as terminal_source');
}
{
  const customs = [customStatusRow({ key: 'qa_gate', transitions_to: ['archived'], roles: ['admin'] })];
  const vocab = statusVocabulary(BUILTIN_STATUSES, customs);
  const overrides = { sent: ['qa_gate', 'approved', 'archived', 'cancelled'] };
  const rows = statusPickerRows(vocab, { current: 'sent', customs, overrides, actor_role: 'sales' });
  const qa = rows.find((r) => r.value === 'qa_gate');
  assert.equal(qa.disabled, true);
  assert.equal(qa.disabled_reason, 'role_restricted');
}

// --- quoteDefaultsStatusPatch -------------------------------------------------------
{
  const customs = [
    customStatusRow({ key: 'on_hold', label: 'On Hold', color: '#ff8800', transitions_to: ['sent', 'archived'] }),
    customStatusRow({ key: 'in_prod', transitions_to: ['cancelled'], bucket: 'approved', terminal: false }),
  ];
  const patch = quoteDefaultsStatusPatch('{"sent":["approved","on_hold","archived","cancelled"],"gone":["draft"]}', customs);
  assert.equal(patch.custom_statuses, '["on_hold","in_prod"]', 'slug list stored as JSON string');
  const tr = JSON.parse(patch.status_transitions);
  assert.deepEqual(tr.sent.sort(), ['approved', 'archived', 'cancelled', 'on_hold'].sort(),
    'builtin-source override preserved verbatim');
  assert.equal('gone' in tr, false, 'stale override for removed custom dropped');
  assert.deepEqual(tr.on_hold, ['archived'], 'custom row stores constraint-filtered edges');
  assert.deepEqual(tr.in_prod, ['cancelled']);
  const meta = JSON.parse(patch.custom_status_meta);
  assert.equal(meta.on_hold.color, '#ff8800', 'meta carries color');
  assert.equal(meta.in_prod.bucket, 'approved', 'meta carries bucket');
  assert.equal(meta.on_hold.label, undefined, 'humanized-label rows skip meta label');
}
{
  // Removing a custom also scrubs it from every target list (removeStatus parity).
  const patch = quoteDefaultsStatusPatch(
    '{"sent":["approved","on_hold","archived","cancelled"],"on_hold":["archived"]}',
    [],
  );
  assert.equal(patch.custom_statuses, '');
  const tr = JSON.parse(patch.status_transitions);
  assert.deepEqual(tr.sent, ['approved', 'archived', 'cancelled'], 'removed status scrubbed from targets');
  assert.equal('on_hold' in tr, false, 'removed status source row dropped');
  assert.equal(patch.custom_status_meta, '');
}
{
  const patch = quoteDefaultsStatusPatch('', []);
  assert.equal(patch.status_transitions, '', 'empty everything → empty string fields');
}

// --- validateCustomStatuses ----------------------------------------------------------
{
  const errors = validateCustomStatuses([
    { key: 'sent' },                                    // key_collision_builtin
    { key: 'On Hold', transitions_to: ['archived'] },   // invalid_key (space)
    { key: 'on_hold', label: 'Hold', transitions_to: ['neverland', 'sent', 'on_hold'] },
    { key: 'dup', label: 'Same' },
    { key: 'dup2', label: 'same' },                     // duplicate_label
    { key: 'term', terminal: true, transitions_to: ['archived'] }, // terminal_with_outgoing
    { key: 'cycle_a', transitions_to: ['cycle_b'] },    // no_terminal_exit
    { key: 'cycle_b', transitions_to: ['cycle_a'] },    // no_terminal_exit
    { key: 'bad_color', color: 'red' },                 // invalid_color
    { key: 'bad_bucket', bucket: 'won' },               // invalid_bucket
    { key: 'bad_roles', roles: 'admin' },               // invalid_roles
    'not-a-row',                                        // not_a_row
    {},                                                 // missing_key
  ]);
  const codes = errors.map((e) => e.code);
  for (const expected of [
    'key_collision_builtin', 'invalid_key', 'unknown_transition_target', 'builtin_reentry',
    'self_transition', 'duplicate_label', 'terminal_with_outgoing', 'no_terminal_exit',
    'invalid_color', 'invalid_bucket', 'invalid_roles', 'not_a_row', 'missing_key',
  ]) {
    assert.ok(codes.includes(expected), `expected error code ${expected} (got ${codes.join(',')})`);
  }
  assert.equal(errors.filter((e) => e.code === 'no_terminal_exit').length, 2,
    'both cycle members flagged');
  const reentry = errors.find((e) => e.code === 'builtin_reentry');
  assert.equal(reentry.key, 'on_hold');
}
{
  // Clean config validates empty; reentry opt-in clears builtin_reentry.
  const errors = validateCustomStatuses([
    { key: 'on_hold', transitions_to: ['archived', 'in_prod'], color: '#abc' },
    { key: 'in_prod', transitions_to: ['approved', 'cancelled'], allow_builtin_reentry: true },
  ]);
  assert.deepEqual(errors, [], `clean config → no errors (got ${JSON.stringify(errors)})`);
}
{
  // Duplicate key reported once and second row still validated.
  const errors = validateCustomStatuses([
    { key: 'dup', transitions_to: ['archived'] },
    { key: 'dup', transitions_to: ['nope'] },
  ]);
  assert.ok(errors.some((e) => e.code === 'duplicate_key'));
}

// --- canonicalStatusBucket -------------------------------------------------------------
{
  const customs = [
    customStatusRow({ key: 'on_hold' }),
    customStatusRow({ key: 'in_prod', bucket: 'approved' }),
  ];
  assert.equal(canonicalStatusBucket('sent', customs), 'sent', 'builtins report as themselves');
  assert.equal(canonicalStatusBucket('in_prod', customs), 'approved', 'declared bucket wins');
  assert.equal(canonicalStatusBucket('on_hold', customs), 'draft', 'undeclared → open pipeline');
  assert.equal(canonicalStatusBucket('mystery', customs), 'draft', 'unknown → draft');
}

rmSync(out, { force: true });
console.log('PASS custom-status');
