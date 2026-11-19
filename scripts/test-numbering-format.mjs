import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// K-09 suite — numbering format model (pure TS, zero imports): pattern
// compile, token render, seq padding, per-module resolution, counter-row
// selection, reissue policy, preview + validation. Bundle first: bare Node
// can't run .ts (sibling-suite convention).
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const bundlePath = resolve(here, '.tmp-numbering-format.mjs');
buildSync({
  entryPoints: [resolve(root, 'base44/shared/numberingFormatModel.ts')],
  bundle: true, format: 'esm', outfile: bundlePath, logLevel: 'silent',
});
const {
  NUMBER_FORMAT_DEFAULTS,
  DOC_NUMBER_KINDS,
  SHARED_COUNTER_KINDS,
  REISSUE_POLICIES,
  normalizeModuleKey,
  sanitizeModuleCode,
  compilePattern,
  formatNumber,
  patternSeqRegex,
  extractSequence,
  parseModuleFormatMap,
  normalizeNumberSettings,
  resolveFormatFor,
  nextSequenceRow,
  reissuePolicy,
  canReissueNumber,
  previewFormats,
  isLegacyGeneratorPattern,
  validateNumberSettings,
} = await import(pathToFileURL(bundlePath).href);

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); n += 1; };
const throws = (fn, msg) => { assert.throws(fn, undefined, msg); n += 1; };

// === zero imports (pure-model contract) =====================================
{
  const src = readFileSync(resolve(root, 'base44/shared/numberingFormatModel.ts'), 'utf8');
  ok(!/^\s*import\s/m.test(src) && !/require\(/.test(src), 'model has zero imports/requires');
}

// === NUMBER_FORMAT_DEFAULTS registry =========================================
{
  for (const kind of ['estimate', 'quote', 'order', 'invoice', 'purchase_order', 'change_order', 'reconciliation']) {
    ok(NUMBER_FORMAT_DEFAULTS[kind], `defaults cover ${kind}`);
    const d = NUMBER_FORMAT_DEFAULTS[kind];
    ok(d.pattern.includes('{seq') && Number.isInteger(d.next_seq) && d.next_seq >= 1 && d.padding >= 1 && d.counter, `${kind} default shape`);
  }
  eq(NUMBER_FORMAT_DEFAULTS.estimate.counter, 'default', 'estimate shares the global counter');
  eq(NUMBER_FORMAT_DEFAULTS.order.counter, 'default', 'order shares the global counter (EST-/INV- never overlap)');
  eq(NUMBER_FORMAT_DEFAULTS.invoice.counter, 'invoice', 'invoice has a dedicated counter (allocateDocNumber parity)');
  ok(SHARED_COUNTER_KINDS.includes('estimate') && SHARED_COUNTER_KINDS.includes('order'), 'shared-counter kinds registered');
}

// === compilePattern ==========================================================
{
  const c = compilePattern('EST-{seq}');
  eq(c.errors.length, 0, 'plain {seq} compiles clean');
  eq(c.tokens.length, 2, 'lit + seq tokens');
  eq(c.tokens[0].type, 'lit'); eq(c.tokens[0].value, 'EST-');
  eq(c.tokens[1].type, 'seq'); eq(c.tokens[1].width, null, 'bare {seq} defers padding');
  eq(c.has_seq, true);

  const full = compilePattern('{module}-{yyyy}{mm}{dd}-{seq4}');
  eq(full.errors.length, 0, 'all token types compile');
  eq(full.tokens[0].type, 'module');
  eq(full.tokens[2].type, 'date'); eq(full.tokens[2].field, 'yyyy');
  eq(full.tokens[3].field, 'mm'); eq(full.tokens[4].field, 'dd');
  eq(full.tokens[6].type, 'seq'); eq(full.tokens[6].width, 4, '{seq4} carries width 4');

  ok(compilePattern('').errors.length > 0, 'empty pattern rejected');
  ok(compilePattern('   ').errors.length > 0, 'blank pattern rejected');
  ok(compilePattern('EST-{seq').errors.some((e) => e.includes('unclosed')), 'unclosed brace rejected');
  ok(compilePattern('EST-seq}').errors.some((e) => e.includes('unmatched')), 'stray brace rejected');
  ok(compilePattern('EST-{bogus}').errors.some((e) => e.includes('unknown token')), 'unknown token rejected');
  ok(compilePattern('X-{seq0}').errors.some((e) => e.includes('padding')), '{seq0} padding rejected');
  ok(compilePattern('X-{seq11}').errors.some((e) => e.includes('padding')), '{seq11} padding rejected');
  ok(compilePattern('PREFIX-ONLY').errors.some((e) => e.includes('{seq}')), 'missing seq rejected');
  ok(compilePattern('{seq}-{seq}').errors.some((e) => e.includes('at most one')), 'double seq rejected');
  ok(compilePattern(`X`.repeat(70) + '-{seq}').errors.some((e) => e.includes('exceeds')), 'oversized pattern rejected');
}

// === formatNumber ============================================================
{
  eq(formatNumber('EST-{seq}', { seq: 42, default_padding: 5 }), 'EST-00042', 'bare {seq} pads to default');
  eq(formatNumber('EST-{seq5}', { seq: 42 }), 'EST-00042', '{seq5} equals {seq}@pad5');
  eq(formatNumber('Q-{seq3}', { seq: 42 }), 'Q-042', 'explicit width 3');
  eq(formatNumber('Q-{seq3}', { seq: 123456 }), 'Q-123456', 'seq wider than pad is not truncated');
  eq(formatNumber('EST-{seq}', { seq: 7 }), 'EST-00007', 'default pad 5 when unset');
  eq(formatNumber('26-{seq}-REV', { seq: 9, default_padding: 4 }), '26-0009-REV', 'suffix pattern renders');
  eq(formatNumber('{module}-{seq}', { seq: 3, module_code: 'channel_letters' }), 'CHANNEL_LETTERS-00003', 'module token sanitizes+uppercases');
  eq(formatNumber('{yyyy}-{mm}-{dd}-{seq}', { seq: 5, at: '2026-03-07T23:59:00Z' }), '2026-03-07-00005', 'UTC date tokens render');
  eq(formatNumber('{yy}{mm}{dd}{seq2}', { seq: 8, at: new Date(Date.UTC(2026, 10, 30)) }), '26113008', 'compound date+seq renders');
  // compiled-token input renders identically to the string form
  const compiled = compilePattern('INV-{seq4}');
  eq(formatNumber(compiled, { seq: 55 }), 'INV-0055', 'compiled tokens render');
  throws(() => formatNumber('EST-{bogus}', { seq: 1 }), 'invalid pattern throws');
  throws(() => formatNumber('EST-{seq}', { seq: 3.5 }), 'non-integer seq throws');
  throws(() => formatNumber('EST-{seq}', { seq: -1 }), 'negative seq throws');
  throws(() => formatNumber('EST-{seq}', { seq: 1, at: 'not-a-date' }), 'invalid at throws');
}

// === patternSeqRegex / extractSequence =======================================
{
  const rx = patternSeqRegex('EST-{seq5}');
  eq(rx.exec('EST-00042')[1], '00042', 'regex captures seq digits');
  assert.deepEqual(rx.exec('EST-00042')[0], 'EST-00042'); n += 1;
  eq(extractSequence('EST-00123', 'EST-{seq5}'), 123, 'extracts issued seq for seeding');
  eq(extractSequence('INV-00123', 'EST-{seq5}'), null, 'foreign number does not match');
  eq(extractSequence('CH-0007', '{module}-{seq4}'), 7, 'module-token pattern extracts');
  eq(extractSequence('garbage', 'EST-{seq}'), null, 'unmatched number -> null');
}

// === parseModuleFormatMap ====================================================
{
  const { map, errors } = parseModuleFormatMap('{"channel_letters":"CH-{seq}","Vinyl":"VN-{seq4}"}');
  eq(errors.length, 0, 'clean JSON map parses');
  eq(map.channel_letters, 'CH-{seq}');
  eq(map.vinyl, 'VN-{seq4}', 'module keys normalize to lowercase');
  eq(parseModuleFormatMap('').map.constructor === Object, true, 'blank input -> empty map');
  eq(parseModuleFormatMap(null).errors.length, 0, 'null input -> no errors');
  ok(parseModuleFormatMap('{oops').errors.length > 0, 'malformed JSON reported');
  ok(parseModuleFormatMap('[1,2]').errors.length > 0, 'non-object JSON reported');
  ok(parseModuleFormatMap('{"a":"","b":"B-{seq}"}').errors.some((e) => e.includes('empty')), 'blank module pattern reported');
}

// === normalizeNumberSettings (both persistence shapes) =======================
{
  const legacy = normalizeNumberSettings({
    estimate_number_format: 'EST-{seq}',
    order_number_format: 'INV-{seq}',
    doc_number_padding: 6,
    module_number_prefixes: '{"vinyl":"VN-{seq}"}',
    number_reissue_policy: 'never_reuse',
  });
  eq(legacy.padding, 6, 'doc_number_padding honored');
  eq(legacy.kinds.estimate.pattern, 'EST-{seq}');
  eq(legacy.kinds.order.pattern, 'INV-{seq}');
  eq(legacy.kinds.invoice.pattern, 'INV-{seq5}', 'unconfigured kind falls back to default pattern');
  eq(legacy.modules.vinyl.pattern, 'VN-{seq}');
  eq(legacy.errors.length, 0, 'legacy row normalizes clean');

  const structured = normalizeNumberSettings({
    padding: 4,
    reissue_policy: 'never_reuse',
    kinds: { estimate: { pattern: 'E{seq4}-{yy}', counter_name: 'default', counter_scope: 'global' } },
    modules: { 'Channel Letters': { pattern: 'CL-{seq}', counter_scope: 'module' } },
  });
  eq(structured.kinds.estimate.pattern, 'E{seq4}-{yy}');
  eq(structured.modules.channel_letters.counter_scope, 'module', 'structured module scope honored');
  eq(structured.modules.channel_letters.pattern, 'CL-{seq}');

  // GlobalSettings row unwrap + idempotency
  const wrapped = normalizeNumberSettings({ setting_key: 'docNumberFormats', setting_value: { padding: 7, kinds: {} } });
  eq(wrapped.padding, 7, 'GlobalSettings row unwraps setting_value');
  const twice = normalizeNumberSettings(legacy);
  eq(twice.padding, 6, 'normalize is idempotent on padding');
  eq(twice.modules.vinyl.pattern, 'VN-{seq}', 'normalize is idempotent on modules');
}

// === resolveFormatFor — module -> kind -> default chain ======================
{
  const s = {
    estimate_number_format: 'EST-{seq}',
    module_number_prefixes: '{"vinyl":"VN-{seq4}","cnc":"{oops"}',
  };
  const mod = resolveFormatFor('vinyl', s);
  eq(mod.pattern, 'VN-{seq4}', 'module-specific pattern wins (#499)');
  eq(mod.source, 'module');
  eq(mod.counter_scope, 'global', 'mask-only module still shares the kind counter');
  eq(mod.counter_name, 'default');

  const badMod = resolveFormatFor('cnc', s);
  eq(badMod.pattern, 'EST-{seq}', 'broken module pattern falls through to the kind format');
  eq(badMod.source, 'kind');

  const plain = resolveFormatFor('metal', s);
  eq(plain.pattern, 'EST-{seq}', 'unconfigured module uses the kind format');
  eq(plain.source, 'kind');

  const dflt = resolveFormatFor('metal', {});
  eq(dflt.pattern, 'EST-{seq5}', 'unconfigured everything uses the built-in default');
  eq(dflt.source, 'default');

  const dedicated = resolveFormatFor('signs', { modules: { signs: { pattern: 'SG-{seq}', counter_scope: 'module' } } });
  eq(dedicated.counter_scope, 'module', 'module with own sequence resolves module scope');
  eq(dedicated.counter_name, 'module:signs', 'module counter namespaced');

  throws(() => resolveFormatFor('', {}, 'bogus_kind'), 'unknown kind throws');
}

// === nextSequenceRow =========================================================
{
  const est = nextSequenceRow({ kind: 'estimate', settings: {} });
  eq(est.config_name, 'default', 'estimate allocates the shared default counter');
  eq(est.scope, 'global');
  const inv = nextSequenceRow({ kind: 'invoice', settings: {} });
  eq(inv.config_name, 'invoice', 'invoice allocates its dedicated counter (allocateDocNumber parity)');
  eq(inv.scope, 'kind');
  const po = nextSequenceRow({ kind: 'purchase_order', settings: {} });
  eq(po.config_name, 'purchase_order', 'purchase order counter name matches the function');
  const modScoped = nextSequenceRow({ kind: 'estimate', module_id: 'vinyl', settings: { modules: { vinyl: { pattern: 'VN-{seq}', counter_scope: 'module' } } } });
  eq(modScoped.config_name, 'module:vinyl', 'module-scoped counter row namespaced');
  eq(modScoped.scope, 'module');
  const maskOnly = nextSequenceRow({ kind: 'estimate', module_id: 'vinyl', settings: { modules: { vinyl: { pattern: 'VN-{seq}' } } } });
  eq(maskOnly.config_name, 'default', 'mask-only module keeps the kind counter');
}

// === reissue policy ==========================================================
{
  const spec = reissuePolicy();
  eq(spec.policy, 'never_reuse', 'deployed policy name');
  eq(spec.voided, 'never_reissue');
  eq(spec.draft, 'may_reuse_until_sent');
  eq(spec.deleted, 'archive_seq');
  eq(spec.sent, 'never_reissue');
  ok(REISSUE_POLICIES.includes('never_reuse'), 'policy registry matches the deployed value');

  eq(canReissueNumber({ status: 'draft' }, {}), true, 'unsent draft may reuse its number');
  eq(canReissueNumber({ status: 'draft', sent_at: '2026-01-01' }, {}), false, 'sent draft may not');
  eq(canReissueNumber({ status: 'sent' }, {}), false, 'sent number never reissues');
  eq(canReissueNumber({ status: 'voided' }, {}), false, 'voided number never reissues');
  eq(canReissueNumber({ status: 'cancelled' }, {}), false, 'cancelled number never reissues');
  eq(canReissueNumber({ status: 'draft', deleted: true }, {}), false, 'soft-deleted row never reissues');
  eq(canReissueNumber({ status: 'draft', archived_seq: true }, {}), false, 'archived seq never reissues');
  eq(canReissueNumber({ status: 'draft' }, { deleted: true }), false, 'deleted context blocks reuse');
  eq(canReissueNumber({ status: 'draft' }, { sent: true }), false, 'sent context blocks reuse');
  eq(canReissueNumber({ status: 'converted' }, {}), false, 'converted estimate never reissues');
  eq(canReissueNumber({}, { state: 'weird_future_state' }), false, 'unknown states fail closed');
  eq(canReissueNumber({ status: 'draft', reissued: true }, {}), false, 'already-reissued flag blocks');
}

// === previewFormats ==========================================================
{
  const preview = previewFormats(
    { estimate_number_format: 'EST-{seq}', order_number_format: 'INV-{seq}', module_number_prefixes: '{"vinyl":"VN-{module}-{seq4}"}' },
    { seq: 42, module_code: 'sign', at: '2026-03-07T00:00:00Z' },
  );
  eq(preview.estimate, 'EST-00042', 'estimate preview renders');
  eq(preview.order, 'INV-00042', 'order preview renders');
  eq(preview.invoice, 'INV-00042', 'invoice preview renders');
  eq(preview.purchase_order, 'PO-00042', 'purchase order preview renders');
  eq(preview['module:vinyl'], 'VN-VINYL-0042', 'module preview uses the module code');
  ok('module:vinyl' in preview, 'module entries keyed module:<key>');
}

// === validateNumberSettings ==================================================
{
  eq(validateNumberSettings({}).length, 0, 'defaults validate clean');
  eq(validateNumberSettings({ estimate_number_format: 'EST-{seq}', module_number_prefixes: '{"vinyl":"VN-{seq}"}' }).length, 0, 'live QuoteDefaults shape validates clean');

  ok(validateNumberSettings({ estimate_number_format: 'EST-{bogus}' }).some((e) => e.includes('unknown token')), 'bad token flagged');
  ok(validateNumberSettings({ doc_number_padding: 11 }).some((e) => e.includes('padding')), 'padding >10 flagged');
  ok(validateNumberSettings({ doc_number_padding: 0 }).some((e) => e.includes('padding')), 'padding <1 flagged');
  ok(validateNumberSettings({ module_number_prefixes: '{"v":"   "}' }).some((e) => e.includes('empty')), 'empty module pattern flagged');
  eq(validateNumberSettings({ estimate_number_format: '   ' }).length, 0, 'blank kind format = unset, falls back to default (deployed semantics)');
  ok(validateNumberSettings({ module_number_prefixes: '{broken' }).some((e) => e.includes('JSON')), 'broken module map flagged');
  ok(validateNumberSettings({ number_reissue_policy: 'recycle' }).some((e) => e.includes('reissue')), 'unsupported policy flagged');
  ok(validateNumberSettings({ kinds: { estimate: { pattern: 'E-{seq}', counter_scope: 'module' } } }).some((e) => e.includes('module counter scope')), 'kind claiming module scope flagged');
  ok(validateNumberSettings({ kinds: { invoice: { pattern: 'I-{seq}', counter_name: 'default' }, purchase_order: { pattern: 'P-{seq}', counter_name: 'default' } } }).some((e) => e.includes('claimed by')), 'dup counter scope flagged');
  ok(validateNumberSettings({ kinds: { invoice: { pattern: 'I-{seq}', counter_name: 'shared_pool' }, purchase_order: { pattern: 'P-{seq}', counter_name: 'shared_pool' } } }).some((e) => e.includes('"shared_pool"')), 'two kinds claiming one non-default counter flagged');
  eq(validateNumberSettings({ kinds: { invoice: { pattern: 'I-{seq}', counter_name: 'invoice_x' } } }).length, 0, 'dedicated non-default counter accepted');

  // legacy-generator compatibility gate
  ok(validateNumberSettings({ estimate_number_format: 'EST-{seq5}' }, { legacy_generator_compat: true }).some((e) => e.includes('deployed generator')), '{seq5} flagged under legacy gate');
  eq(validateNumberSettings({ estimate_number_format: 'EST-{seq}' }, { legacy_generator_compat: true }).length, 0, '{seq} passes legacy gate');
  ok(validateNumberSettings({ estimate_number_format: 'EST {seq}' }, { legacy_generator_compat: true }).some((e) => e.includes('deployed generator')), 'charset violation flagged under legacy gate');
  eq(isLegacyGeneratorPattern('EST-{seq}'), true, 'legacy gate accepts {seq}');
  eq(isLegacyGeneratorPattern('EST-{seq5}'), false, 'legacy gate rejects {seq5}');
  eq(isLegacyGeneratorPattern('E{module}-{seq}'), false, 'legacy gate rejects {module}');
}

rmSync(bundlePath, { force: true });
console.log(`PASS numbering-format (${n} asserts)`);
