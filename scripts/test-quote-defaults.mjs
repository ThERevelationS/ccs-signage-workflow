import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// K-10 suite — quote defaults depth. Bundles the pure TS model (bare Node
// can't run .ts — sibling-suite convention), then asserts every listed
// default resolves AND reaches its documented output slot, plus the expiry
// math edges, the #486 tax-source chain, and the email template tokens.
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const bundlePath = resolve(here, '.tmp-quote-defaults.mjs');
const feBundlePath = resolve(here, '.tmp-quote-defaults-fe.mjs');
const feStubPath = resolve(here, '.tmp-quote-defaults-stub.mjs');
buildSync({
  entryPoints: [resolve(root, 'base44/shared/quoteDefaultsModel.ts')],
  bundle: true, format: 'esm', outfile: bundlePath, logLevel: 'silent',
});
// Deployed loader bundle (parity guard — replaces the retired FE-only suite):
// quoteDefaults.js imports the SDK + staffEntities; stub both so the pure
// exports resolve under Node.
writeFileSync(feStubPath, 'export const base44 = {}; export const staffEntities = {};');
buildSync({
  entryPoints: [resolve(root, 'src/components/estimator/quoteDefaults.js')],
  bundle: true, format: 'esm', outfile: feBundlePath, logLevel: 'silent',
  alias: { '@/api/base44Client': feStubPath, '@/components/staff/staffEntities': feStubPath },
});
const {
  QUOTE_DEFAULT_KEYS: FE_KEYS,
  DEFAULT_QUOTE_SETTINGS: FE_SETTINGS,
  quoteDefaultsPayload: fePayload,
  quoteDefaultsForm: feForm,
  canonicalQuoteDefaults: feCanonical,
} = await import(pathToFileURL(feBundlePath).href);
const {
  QUOTE_DEFAULT_KEYS,
  BUILTIN_QUOTE_DEFAULTS,
  QUOTE_PRINT_TOGGLES,
  PROPOSED_QUOTE_DEFAULT_KEYS,
  TAX_RATE_SOURCES,
  canonicalQuoteDefaultsRow,
  resolveQuoteDefaults,
  estimateDefaultsPatch,
  quoteExpiryFrom,
  estimateExpirationDay,
  quoteExpiredOn,
  quoteValiditySentence,
  QUOTE_EMAIL_TOKENS,
  quoteEmailTemplateValues,
  interpolateQuoteTemplate,
  quoteEmailSubject,
  quoteEmailMessage,
  resolveTaxRateSource,
  quotePrintModel,
  QUOTE_DEFAULT_OUTPUT_PROOF,
} = await import(pathToFileURL(bundlePath).href);

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); n += 1; };
const deq = (a, b, msg) => { assert.deepEqual(a, b, msg); n += 1; };

// === zero imports (pure-model contract) =====================================
{
  const src = readFileSync(resolve(root, 'base44/shared/quoteDefaultsModel.ts'), 'utf8');
  ok(!/^\s*import\s/m.test(src) && !/require\(/.test(src), 'model has zero imports/requires');
}

// === canonicalQuoteDefaultsRow — earliest-created singleton ==================
{
  const rows = [
    { id: 'b', created_date: '2026-02-01T00:00:00Z' },
    { id: 'a', created_date: '2026-01-01T00:00:00Z' },
    { id: 'c', updated_date: '2026-01-15T00:00:00Z' },
  ];
  eq(canonicalQuoteDefaultsRow(rows).id, 'a', 'earliest created_date wins');
  eq(canonicalQuoteDefaultsRow([]), null, 'empty rows -> null');
  eq(canonicalQuoteDefaultsRow([{ id: 'z' }, { id: 'y' }]).id, 'y', 'no dates -> id tiebreak');
}

// === resolveQuoteDefaults — normalization ====================================
{
  const d = resolveQuoteDefaults(null);
  eq(d.quote_title, 'Project Estimate', 'missing row -> builtin title');
  eq(d.quote_valid_days, 30, 'missing row -> 30 valid days');
  eq(d.quote_accent_color, '#4f46e5', 'builtin accent color');
  eq(d.doc_number_padding, 5, 'builtin padding');
  eq(d.tax_rate_source, 'auto', 'unset tax source -> auto (deployed chain)');
  eq(d.number_reissue_policy, 'never_reuse', 'reissue policy default');
  eq(d.signature_text, '', 'proposed signature_text defaults blank');
  eq(d.disclaimer_text, '', 'proposed disclaimer_text defaults blank');
  eq(d.config_name, 'default', 'config_name resolves');
  eq(d.company.name, '', 'company name blank');

  const raw = {
    config_name: 'default', company_name: 'CCS', quote_valid_days: 45.9,
    doc_number_padding: 99, default_tax_group: 'Ohio (7.5%)',
    show_tax_line: false, some_random_field: 'x',
  };
  const r = resolveQuoteDefaults(raw);
  eq(r.quote_valid_days, 45, 'fractional days floored');
  eq(r.doc_number_padding, 10, 'padding clamps to 10');
  eq(r.default_tax_group, 'Ohio (7.5%)', 'shop tax group name passes through');
  eq(r.print_options.show_tax_line, false, 'explicit toggle false honored');
  eq(r.print_options.show_terms_block, true, 'missing toggle -> factory true');
  ok(r.unmapped_keys.includes('some_random_field'), 'unmapped keys surfaced');

  eq(resolveQuoteDefaults({ quote_valid_days: -5 }).quote_valid_days, 0, 'negative days clamp to 0');
  eq(resolveQuoteDefaults({ quote_valid_days: 'abc' }).quote_valid_days, 30, 'non-numeric days -> 30');
  eq(resolveQuoteDefaults({ quote_valid_days: 0 }).quote_valid_days, 0, 'explicit 0 days honored (no forever sentinel)');
  eq(resolveQuoteDefaults({ doc_number_padding: 1 }).doc_number_padding, 3, 'padding clamps to 3');
  eq(resolveQuoteDefaults({ tax_rate_source: 'Customer Default' }).tax_rate_source, 'customer_default', 'tax source normalizes');
  eq(resolveQuoteDefaults({ tax_rate_source: 'bogus' }).tax_rate_source, 'auto', 'bad tax source -> auto');
  ok(TAX_RATE_SOURCES.includes('customer_default') && TAX_RATE_SOURCES.includes('none'), 'source enum covers real chain values');

  // rows-array input -> canonical pick
  const arr = resolveQuoteDefaults([{ company_name: 'B', created_date: '2026-02-01' }, { company_name: 'A', created_date: '2026-01-01' }]);
  eq(arr.company.name, 'A', 'array input resolves canonical row');
}

// === print_options coverage ==================================================
{
  const d = resolveQuoteDefaults({});
  eq(Object.keys(d.print_options).length, 24, 'all 24 print toggles resolve');
  eq(QUOTE_PRINT_TOGGLES.length, 24, 'toggle registry = panel TOGGLES');
  for (const [key, fallback] of QUOTE_PRINT_TOGGLES) {
    eq(d.print_options[key], fallback, `factory default for ${key}`);
  }
}

// === estimateDefaultsPatch — quoteDefaultsPayload parity =====================
{
  const patch = estimateDefaultsPatch({ company_name: 'CCS', quote_valid_days: 45, not_a_key: 1, show_tax_line: null });
  eq(patch.company_name, 'CCS', 'whitelist key copied');
  eq(patch.quote_valid_days, 45, 'numeric default copied');
  ok(!('not_a_key' in patch), 'non-whitelist key dropped');
  ok(!('show_tax_line' in patch), 'null values skipped (payload parity)');
  const proposed = estimateDefaultsPatch({ signature_text: 'Sign here', custom_status_meta: '{"a":{}}' }, { include_proposed: true });
  eq(proposed.signature_text, 'Sign here', 'proposed keys copy when enabled');
  ok(PROPOSED_QUOTE_DEFAULT_KEYS.includes('signature_text'), 'proposed registry covers signature_text');
  ok(!('custom_status_meta' in estimateDefaultsPatch({ custom_status_meta: 'x' })), 'status meta stays shop-global (K-11 intent)');
}

// === quoteExpiryFrom — deployed issue+days math ==============================
{
  eq(quoteExpiryFrom('2026-11-01', { valid_days: 30 }).expiration_day, '2026-12-01', 'issue + 30 days');
  eq(quoteExpiryFrom('2026-11-01', { valid_days: 30 }).source, 'computed', 'computed source');
  eq(quoteExpiryFrom('2026-11-01', { valid_days: 0 }).expiration_day, '2026-11-01', '0 days = expires on issue day (no forever)');
  eq(quoteExpiryFrom('2026-11-01', { valid_days: 0 }).expiration_day !== '', true, '0-day expiry still exists');
  eq(quoteExpiryFrom('2026-12-15', { valid_days: 45 }).expiration_day, '2027-01-29', 'month boundary rolls');
  eq(quoteExpiryFrom('2024-02-28', { valid_days: 2 }).expiration_day, '2024-03-01', 'leap-year day math');
  eq(quoteExpiryFrom('2026-11-01', { valid_days: 'garbage' }).expiration_day, '2026-12-01', 'non-numeric days -> builtin 30');
  eq(quoteExpiryFrom('2026-11-01', { valid_days: -7 }).expiration_day, '2026-11-01', 'negative days clamp to issue day');
  eq(quoteExpiryFrom('2026-11-01', { valid_days: 30, expiration_override: '2026-12-25' }).expiration_day, '2026-12-25', 'stored override wins');
  eq(quoteExpiryFrom('2026-11-01', { expiration_override: '12/25/2026' }).source, 'computed', 'malformed override ignored -> computed');
  eq(quoteExpiryFrom('', { valid_days: 30 }).expiration_day, '', 'blank issue + no fallback -> no expiry');
  eq(quoteExpiryFrom('', { valid_days: 30, fallback_day: '2026-11-01' }).expiration_day, '2026-12-01', 'fallback_day mirrors estimateQuoteExpiration today-anchor');
  eq(quoteExpiryFrom('bad-day', { valid_days: 30 }).source, 'none', 'unparseable issue day -> none');

  // expired strictly AFTER the expiration day (valid THROUGH it)
  ok(!quoteExpiredOn('2026-12-01', '2026-12-01'), 'expiration day itself still valid');
  ok(quoteExpiredOn('2026-12-01', '2026-12-02'), 'day after expiration = expired');
  ok(!quoteExpiredOn('2026-12-01', '2026-11-30'), 'before expiration = valid');
  ok(!quoteExpiredOn('', '2026-12-02'), 'no expiry -> never expired');

  // estimateExpirationDay — estimateQuoteExpiration parity
  eq(estimateExpirationDay({ quote_issue_date: '2026-11-01', quote_valid_days: 14 }), '2026-11-15', 'estimate issue+days');
  eq(estimateExpirationDay({ quote_issue_date: '2026-11-01', quote_expiration_date: '2026-12-31' }), '2026-12-31', 'override wins over computed');
  eq(estimateExpirationDay({}), '', 'no issue date -> blank');
}

// === quoteValiditySentence — both render surfaces ============================
{
  const exp = quoteExpiryFrom('2026-11-01', { valid_days: 30 });
  eq(quoteValiditySentence(exp), 'This estimate is valid through 2026-12-01 (30 days) unless otherwise stated.', 'panel sentence carries (N days)');
  eq(quoteValiditySentence(exp, { surface: 'export' }), 'This estimate is valid through 2026-12-01 unless otherwise stated.', 'export drops the (N days) note');
  eq(quoteValiditySentence({ ...exp, expiration_day: '' }), 'This estimate is valid for 30 days unless otherwise stated.', 'no-expiry panel fallback');
  eq(quoteValiditySentence({ ...exp, expiration_day: '' }, { surface: 'export' }), 'This estimate is valid for 30 days unless otherwise stated.', 'no-expiry export fallback');
  eq(quoteValiditySentence(exp, { format_label: (d) => `~${d}~` }), 'This estimate is valid through ~2026-12-01~ (30 days) unless otherwise stated.', 'label formatter applied');
}

// === email template tokens + subject/message ================================
{
  const est = {
    estimate_number: 'EST-00042', project_name: 'Pylon Sign', client_name: 'Acme Corp',
    order_contact: 'Jo Smith', company_name: 'CCS Signs', quote_total: 1234.5,
    quote_expiration_date: '2026-12-01',
    email_subject_template: 'Quote {estimate_number} for {client_name} — {quote_total}',
    email_message_template: 'Hi {contact_name}, {project_name} is attached. Valid until {quote_valid_until}. {unknown_token}',
  };
  const vals = quoteEmailTemplateValues(est);
  eq(vals.estimate_number, 'EST-00042', 'token values resolve');
  eq(vals.contact_name, 'Jo Smith', 'order_contact wins for contact_name');
  eq(vals.quote_total, '$1234.50', 'money token formats 2dp');
  eq(vals.quote_valid_until, '2026-12-01', 'valid_until falls back to expiration_date');
  eq(QUOTE_EMAIL_TOKENS.length, 7, 'exactly 7 deployed tokens');

  eq(quoteEmailSubject(est), 'Quote EST-00042 for Acme Corp — $1234.50', 'subject template interpolates');
  eq(quoteEmailMessage(est), 'Hi Jo Smith, Pylon Sign is attached. Valid until 2026-12-01. {unknown_token}', 'unknown token passes through verbatim');
  eq(quoteEmailSubject({ estimate_number: 'E-1\nE-2', project_name: 'P' }), 'Estimate #E-1 E-2 — P', 'subject fallback strips newlines');
  eq(quoteEmailSubject({}), 'Project Estimate', 'blank subject -> bare title');
  const msg = quoteEmailMessage({ project_name: 'X', order_contact: 'Sam', company_name: 'CCS' });
  ok(msg.startsWith('Good afternoon Sam,'), 'message fallback greeting uses contact');
  ok(msg.includes('Thank you,\nCCS'), 'message fallback closes with company');
  ok(quoteEmailMessage({}).startsWith('Good afternoon,'), 'no contact -> generic greeting');
  eq(quoteEmailSubject({ email_subject_template: '   ' }), 'Project Estimate', 'blank template -> fallback');
}

// === resolveTaxRateSource — the #486 chain ===================================
{
  const groups = [
    { group_name: 'Ohio', tax_percent: 7.5 },
    { group_name: 'Kentucky', tax_percent: 6, is_default: true },
    { group_name: 'Bad', tax_percent: 140 },
  ];
  const cust = { default_tax_group: 'Ohio' };
  const defs = resolveQuoteDefaults({ default_tax_group: 'Bad', tax_rate_source: 'auto' });

  const r1 = resolveTaxRateSource({ customer: cust, defaults: defs, groups });
  eq(r1.source, 'customer_default', 'customer default wins the chain');
  eq(r1.tax_group, 'Ohio'); eq(r1.tax_percent, 7.5, 'group percent resolves');
  ok(r1.resolved, 'customer chain resolved');

  const r2 = resolveTaxRateSource({ customer: {}, defaults: defs, groups });
  eq(r2.source, 'shop_default', 'no customer default -> shop default');
  eq(r2.resolved, false, 'out-of-range percent fails validation');
  eq(r2.tax_percent, 0, 'invalid percent -> untaxed');
  ok(r2.warnings[0].includes('out-of-range'), 'invalid percent warns');

  const r3 = resolveTaxRateSource({ customer: {}, defaults: resolveQuoteDefaults({}), groups });
  eq(r3.source, 'group_default', 'is_default group is the last resort');
  eq(r3.tax_group, 'Kentucky'); eq(r3.tax_percent, 6);

  const r4 = resolveTaxRateSource({ customer: {}, defaults: resolveQuoteDefaults({}), groups: [] });
  eq(r4.source, 'none', 'no sources -> none');
  eq(r4.tax_percent, 0, 'untaxed default');

  // Stale customer default: name wins the chain but matches no group ->
  // UNTAXED with no fall-through to the shop default (deployed edge).
  const r5 = resolveTaxRateSource({ customer: { default_tax_group: 'Deleted Group' }, defaults: defs, groups });
  eq(r5.source, 'customer_default');
  eq(r5.resolved, false, 'stale customer name resolves untaxed');
  eq(r5.tax_group, '', 'no tax group applied');
  ok(r5.warnings[0].includes('no fall-through'), 'stale-default warning documents no fall-through');

  // Manual estimate pick wins over every default source.
  const r6 = resolveTaxRateSource({ customer: cust, defaults: defs, groups, manual_tax_group: 'Ohio' });
  eq(r6.source, 'manual', 'estimate picker wins');
  eq(r6.tax_percent, 7.5);

  // Policy pins
  const r7 = resolveTaxRateSource({ customer: cust, defaults: { default_tax_group: 'Kentucky', tax_rate_source: 'shop_default' }, groups });
  eq(r7.source, 'shop_default', 'shop_default policy skips the customer');
  eq(r7.tax_group, 'Kentucky');
  const r8 = resolveTaxRateSource({ customer: cust, defaults: { tax_rate_source: 'none' }, groups });
  eq(r8.source, 'none', 'none policy starts untaxed');
  const r9 = resolveTaxRateSource({ customer: cust, defaults: { tax_rate_source: 'manual' }, groups });
  eq(r9.source, 'manual', 'manual policy never seeds defaults');
}

// === quotePrintModel — composition order + per-default proof =================
{
  const defaults = resolveQuoteDefaults({
    company_name: 'CCS', warranty_text: '2-year warranty', payment_terms: 'Net 30',
    quote_terms_conditions: 'All sales final.', quote_footer_text: 'Thanks!',
    disclaimer_text: 'Colors approximate.', signature_text: 'Authorized signature',
    quote_valid_days: 15, lead_time_text: '3 weeks',
  });
  const est = { quote_issue_date: '2026-11-01', estimate_number: 'EST-1', client_name: 'Acme' };
  const m = quotePrintModel(est, defaults);

  const slots = m.sections.map((s) => s.slot);
  deq(slots, [
    'header.company_block', 'header.title_block', 'header.parties',
    'body.intro', 'body.items_table', 'body.totals', 'body.scope_lists',
    'text.lead_time', 'text.warranty', 'text.notes', 'text.terms', 'signature',
  ], 'section render order matches the panel article');

  const bySlot = Object.fromEntries(m.sections.map((s) => [s.slot, s]));
  eq(bySlot['header.company_block'].content.name, 'CCS', 'company name default reaches header');
  eq(bySlot['header.title_block'].content.valid_through, '2026-11-16', 'issue+15d reaches header');
  ok(bySlot['header.title_block'].drives.includes('quote_valid_days'), 'header valid-through driven by quote_valid_days');
  eq(bySlot['text.warranty'].content, '2-year warranty', 'warranty default reaches text block');
  ok(bySlot['text.warranty'].visible, 'warranty block visible (toggle on + text present)');
  eq(bySlot['text.terms'].content, 'Net 30\n\nAll sales final.', 'terms composes payment_terms + \\n\\n + terms');
  eq(bySlot['signature'].content.lines[0], 'Authorized signature', 'signature_text overrides the hardcoded line');
  ok(!bySlot['signature'].content.uses_default_text, 'custom signature text flagged');
  eq(bySlot['text.notes'].visible, false, 'notes hidden by factory default');

  const foot = m.footer_lines.map((f) => f.slot);
  deq(foot, ['footer.quote_footer_text', 'footer.disclaimer', 'footer.validity'], 'footer order: text → disclaimer → validity');
  eq(m.footer_lines[1].content, 'Colors approximate.', 'disclaimer reaches its slot');
  eq(m.footer_lines[2].content, 'This estimate is valid through 2026-11-16 (15 days) unless otherwise stated.', 'validity line uses resolved days');

  // Estimate field wins over defaults (per-estimate customization).
  const m2 = quotePrintModel({ ...est, warranty_text: 'Custom 5yr' }, defaults);
  eq(m2.sections.find((s) => s.slot === 'text.warranty').content, 'Custom 5yr', 'estimate override beats default');

  // Toggle-off hides the block even with text present.
  const m3 = quotePrintModel({ ...est, show_warranty_block: false }, defaults);
  eq(m3.sections.find((s) => s.slot === 'text.warranty').visible, false, 'show_warranty_block=false hides warranty');
  const m4 = quotePrintModel(est, resolveQuoteDefaults({ show_signature_block: false }));
  eq(m4.sections.find((s) => s.slot === 'signature').visible, false, 'defaults-level toggle hides signature');

  // Bundled mode + column toggles.
  const m5 = quotePrintModel({ ...est, hide_section_prices: true, show_quantity_column: true }, defaults);
  eq(m5.sections.find((s) => s.slot === 'body.items_table').content.bundled, true, 'hide_section_prices bundles');
  ok(m5.sections.find((s) => s.slot === 'body.items_table').content.columns.includes('quantity'), 'qty column opt-in');

  // Signature default lines when signature_text unset.
  const m6 = quotePrintModel(est, resolveQuoteDefaults({}));
  deq(m6.sections.find((s) => s.slot === 'signature').content.lines, ['Customer acceptance / signature', 'Date'], 'hardcoded signature lines when no signature_text');
  ok(m6.sections.find((s) => s.slot === 'signature').content.uses_default_text, 'default signature text flagged');

  // Empty defaults still produce a valid model (built-in fallbacks).
  eq(m6.sections.find((s) => s.slot === 'header.title_block').title, 'Project Estimate', 'title falls back to builtin');
  eq(m6.footer_lines[2].content, 'This estimate is valid through 2026-12-01 (30 days) unless otherwise stated.', 'builtin 30 days when neither estimate nor defaults set days');
  // Estimate-side copy wins over the resolved default (stamped at create).
  const m7 = quotePrintModel({ ...est, quote_valid_days: 7 }, defaults);
  eq(m7.footer_lines[2].content, 'This estimate is valid through 2026-11-08 (7 days) unless otherwise stated.', 'estimate quote_valid_days beats the default');
  // Stored expiration override wins over every computed path.
  const m8 = quotePrintModel({ ...est, quote_expiration_date: '2027-01-15' }, defaults);
  eq(m8.footer_lines[2].content, 'This estimate is valid through 2027-01-15 (15 days) unless otherwise stated.', 'stored override wins; default days still fill the (N) note');
}

// === proof map — every listed default reaches its slot =======================
{
  const byKey = Object.fromEntries(QUOTE_DEFAULT_OUTPUT_PROOF.map((p) => [p.key, p]));
  // The item's named defaults all resolve AND have a mapped output.
  for (const key of ['quote_valid_days', 'signature_text', 'disclaimer_text', 'default_tax_group', 'tax_rate_source',
    'quote_footer_text', 'quote_terms_conditions', 'warranty_text', 'payment_terms', 'lead_time_text', 'email_signature']) {
    ok(byKey[key], `proof map covers ${key}`);
    ok(byKey[key].outputs.length > 0, `${key} names its output slot`);
  }
  eq(byKey.signature_text.status, 'proposed', 'signature_text flagged as schema gap');
  eq(byKey.disclaimer_text.status, 'proposed', 'disclaimer_text flagged as schema gap');
  eq(byKey.tax_rate_source.status, 'proposed', 'tax_rate_source flagged as schema gap');
  eq(byKey.quote_accent_color.status, 'stored_not_rendered', 'accent color dead-default flagged');
  eq(byKey.scope_auto_apply.status, 'stored_not_rendered', 'scope_auto_apply dead-default flagged');
  // Every whitelisted copy key is in the map; every declared toggle present.
  for (const key of QUOTE_DEFAULT_KEYS) ok(byKey[key], `whitelist key ${key} has an output proof`);
  // Undeclared-but-stored keys are marked.
  for (const key of ['email_signature', 'email_subject_template', 'email_message_template', 'estimate_number_format',
    'order_number_format', 'doc_number_padding', 'module_number_prefixes', 'display_timezone', 'default_tax_group', 'number_reissue_policy']) {
    eq(byKey[key].declared_on_defaults, false, `${key} recorded as undeclared on QuoteDefaults schema`);
  }
  // Print toggles each drive exactly one article slot.
  for (const [key] of QUOTE_PRINT_TOGGLES) {
    const p = byKey[key];
    ok(p && p.status === 'drives_output', `toggle ${key} drives output`);
  }
  // The model's drives annotations only name keys that exist in the registry.
  const model = quotePrintModel({ quote_issue_date: '2026-11-01' }, null);
  for (const s of model.sections.concat(model.footer_lines)) {
    for (const k of s.drives) ok(byKey[k] || k === 'scope_auto_apply', `drives key ${k} is a real default key`);
  }
}

// === deployed-loader parity (model mirrors quoteDefaults.js exactly) ========
{
  // Whitelist is identical — the model must never drift from the deployed keys.
  deq(QUOTE_DEFAULT_KEYS, FE_KEYS, 'whitelist mirrors deployed QUOTE_DEFAULT_KEYS');
  for (const key of FE_KEYS) {
    ok(key in BUILTIN_QUOTE_DEFAULTS, `model builtin covers ${key}`);
    deq(BUILTIN_QUOTE_DEFAULTS[key], FE_SETTINGS[key], `builtin value matches deployed default for ${key}`);
  }
  // Payload parity: same row → same estimate patch.
  const row = { company_name: 'CCS', quote_valid_days: 45, hacker: true, show_logo: undefined, terms: null, custom_status_meta: '{"x":1}' };
  deq(estimateDefaultsPatch(row), fePayload(row), 'estimateDefaultsPatch == quoteDefaultsPayload');
  const form = feForm(row);
  eq(form.quote_valid_days, 45, 'form merge keeps saved values');
  eq(form.quote_title, 'Project Estimate', 'form falls back to builtin (quoteDefaultsForm parity)');
  // Canonical-row parity.
  const rows = [{ id: 'b', created_date: '2026-02-01' }, { id: 'a', created_date: '2026-01-01' }];
  eq(canonicalQuoteDefaultsRow(rows)?.id, feCanonical(rows)?.id, 'canonical row matches deployed pick');
  eq(canonicalQuoteDefaultsRow(null), feCanonical(null), 'null input -> null');
}

rmSync(bundlePath, { force: true });
rmSync(feBundlePath, { force: true });
rmSync(feStubPath, { force: true });
console.log(`PASS quote-defaults (${n} asserts)`);
