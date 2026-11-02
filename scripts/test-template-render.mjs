import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// H-03 suite — notification template renderer (base44/shared/templateRender.ts).
// Vite-style extensionless/.ts imports can't be resolved by bare Node — bundle
// first (sibling-suite convention; see test-modifier-pricing.mjs).
const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(here, '.tmp-template-render.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/templateRender.ts')],
  bundle: true, format: 'esm', outfile: bundlePath, logLevel: 'silent',
});
const {
  TEMPLATE_FORMATTERS,
  TEMPLATE_MAX_PLACEHOLDERS,
  renderTemplate,
  placeholdersIn,
  validateTemplate,
} = await import(pathToFileURL(bundlePath).href);

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); n++; };
const deep = (a, b, msg) => { assert.deepEqual(a, b, msg); n++; };

const ctx = {
  order: {
    number: 'WO-1042',
    total: 1234.56,
    balance: -7.25,
    due_date: '2026-11-02',
    paid: true,
    qty: 0,
    items: [{ name: 'Banner' }, { name: 'Decal' }],
    customer: { nested: 'object terminal' },
  },
  customer: {
    name: 'jOHN dOE',
    billing_contact: { email: 'billing@acme.test' },
  },
  company: { name: 'CCS Signs' },
  bad: { fn: () => 'secret', sym: Symbol('s') },
};

// ------------------------------------------------------------ plain lookups
{
  const r = renderTemplate('Total: {{order.total}}', ctx);
  eq(r.text, 'Total: 1234.56', 'scalar renders via String()');
  deep(r.missing, [], 'clean render -> no missing');
  eq(renderTemplate('{{ order.total }}', ctx).text, '1234.56', 'whitespace tolerated');
  eq(renderTemplate('{{customer.billing_contact.email}}', ctx).text,
    'billing@acme.test', 'nested dot-path');
  eq(renderTemplate('{{order.items.0.name}}', ctx).text, 'Banner', 'array index 0');
  eq(renderTemplate('{{order.items.1.name}}', ctx).text, 'Decal', 'array index 1');
  eq(renderTemplate('{{order.items.length}}', ctx).text, '2', 'array own-prop length');
  eq(renderTemplate('{{order.paid}}', ctx).text, 'true', 'boolean scalar');
  eq(renderTemplate('{{order.qty}}', ctx).text, '0', 'zero is a value, not missing');
  deep(renderTemplate('{{order.qty}}', ctx).missing, [], '0 renders, not recorded');
}

// --------------------------------------------------------------- formatters
{
  eq(renderTemplate('{{order.total | money}}', ctx).text, '$1,234.56', 'money commas+2dp');
  eq(renderTemplate('{{order.balance | money}}', ctx).text, '-$7.25', 'money negative');
  eq(renderTemplate('{{order.number | money}}', ctx).text, '', 'money non-numeric -> ""');
  eq(renderTemplate('{{order.due_date | date}}', ctx).text, '11/2/2026', 'date ISO -> M/D/YYYY');
  eq(renderTemplate('{{x | date}}', { x: '2026-11-02T15:04:00Z' }).text, '11/2/2026',
    'date datetime pinned to UTC calendar date');
  eq(renderTemplate('{{x | date}}', { x: 'not a date' }).text, '', 'date unparseable -> ""');
  eq(renderTemplate('{{customer.name | upper}}', ctx).text, 'JOHN DOE', 'upper');
  eq(renderTemplate('{{x | lower}}', { x: 'ABC DeF' }).text, 'abc def', 'lower');
  eq(renderTemplate('{{customer.name | title}}', ctx).text, 'John Doe', 'title case');
  eq(renderTemplate('{{order.missing | default:"n/a"}}', ctx).text, 'n/a',
    'default fires on unresolved path');
  eq(renderTemplate('{{order.number | default:"n/a"}}', ctx).text, 'WO-1042',
    'default passes present value through');
  eq(renderTemplate('{{x | default:"fbk"}}', { x: '' }).text, 'fbk',
    'default fires on empty-string value');
  eq(renderTemplate('{{order.no | money | default:"n/a"}}', ctx).text, 'n/a',
    'default catches "" produced by earlier formatter');
  eq(renderTemplate('{{order.no | default:"x" | upper}}', ctx).text, 'X', 'pipes compose l2r');
  eq(renderTemplate('{{x | MONEY}}', { x: 5 }).text, '$5.00', 'formatter names case-insensitive');
  eq(renderTemplate("{{x | default:'single'}}", {}).text, 'single', 'single-quoted arg');
  eq(renderTemplate('{{x | default:"a|b"}}', {}).text, 'a|b', 'pipe inside quoted arg literal');
  eq(renderTemplate('{{x | default:"say \\"hi\\""}}', {}).text, 'say "hi"', 'escaped quotes in arg');
  ok(TEMPLATE_FORMATTERS.includes('money') && TEMPLATE_FORMATTERS.includes('default'),
    'registry export lists formatters');
}

// ----------------------------------------------------- missing + strict mode
{
  const r = renderTemplate('{{customer.phone}} done', ctx);
  eq(r.text, ' done', 'missing path -> empty string');
  deep(r.missing, ['customer.phone'], 'path recorded in missing');
  const dedup = renderTemplate('{{x}} {{x}} {{y}}', {});
  deep(dedup.missing, ['x', 'y'], 'missing deduped in encounter order');
  const s = renderTemplate('{{customer.phone}}!', ctx, { strict: true });
  eq(s.text, '{{customer.phone}}!', 'strict renders literal placeholder');
  deep(s.missing, ['customer.phone'], 'strict still records missing');
  eq(renderTemplate('{{no | default:"y"}}', ctx, { strict: true }).text, 'y',
    'strict: non-empty default output still renders');
  eq(renderTemplate('{{no | default:""}}', ctx, { strict: true }).text, '{{no | default:""}}',
    'strict: empty default output -> literal');
  // injection safety — prototype members can never resolve
  const inj = renderTemplate('{{constructor.name}}|{{x.constructor.name}}', { x: {} });
  eq(inj.text, '|', 'prototype-chain reads -> empty');
  deep(inj.missing, ['constructor.name', 'x.constructor.name'], 'proto paths recorded');
  eq(renderTemplate('{{bad.fn}}', ctx).text, '', 'function value never called/rendered');
  deep(renderTemplate('{{bad.fn}}', ctx).missing, ['bad.fn'], 'function recorded missing');
  eq(renderTemplate('{{bad.fn.name}}', ctx).text, '', 'functions never traversed');
  eq(renderTemplate('{{order.customer}}', ctx).text, '', 'object terminal -> ""');
  deep(renderTemplate('{{order.customer}}', ctx).missing, ['order.customer'],
    'object terminal recorded');
  eq(renderTemplate('{{v}}', { v: new Date('2026-11-02T00:00:00Z') }).text,
    '2026-11-02T00:00:00.000Z', 'Date terminal -> ISO (use | date for pretty)');
}

// ----------------------------------------------------------- malformed input
{
  eq(renderTemplate('a {{unclosed b', ctx).text, 'a {{unclosed b', 'unclosed stays literal');
  eq(renderTemplate('a }} stray', ctx).text, 'a }} stray', 'stray close stays literal');
  const emp = renderTemplate('x{{}}y', ctx);
  eq(emp.text, 'xy', 'empty placeholder -> ""');
  eq(emp.missing.length, 1, 'empty placeholder recorded');
  eq(renderTemplate('x{{}}y', ctx, { strict: true }).text, 'x{{}}y', 'strict empty -> literal');
  eq(renderTemplate('{{ a } b }}', ctx).text, '{{ a } b }}', 'brace inside -> literal whole');
  eq(renderTemplate('{{{order.qty}}}', ctx).text, '{0}', 'triple braces: inner renders');
  eq(renderTemplate('{{order..total}}', ctx).text, '', 'empty segment -> unparseable ""');
  eq(renderTemplate('{{ order.total }}', ctx).text, '1234.56', 'ws inside braces ok');
  eq(renderTemplate(null, ctx).text, '', 'null template -> ""');
  eq(renderTemplate(42, ctx).text, '42', 'numeric template coerced');
  deep(renderTemplate('{{a}}', null).missing, ['a'], 'non-object ctx -> everything missing');
  eq(renderTemplate('{{a}}', null).text, '', 'non-object ctx safe');
}

// ------------------------------------------------------------ placeholdersIn
{
  deep(placeholdersIn('{{a}} hi {{ b.c | money }} {{a}}'), ['a', 'b.c | money', 'a'],
    'expressions in encounter order, trimmed, not deduped');
  deep(placeholdersIn('no placeholders'), [], 'none found -> []');
  deep(placeholdersIn(null), [], 'non-string -> []');
  deep(placeholdersIn('{{unclosed'), [], 'unclosed not listed');
}

// ---------------------------------------------------------- validateTemplate
{
  const good = validateTemplate('{{order.total | money}} — {{customer.name | title}}', ctx);
  eq(good.ok, true, 'clean template validates');
  deep(good.missing, []); deep(good.unknownFormatters, []);
  const bad = validateTemplate('{{order.phone}} {{x | bogus}} {{y | wat:1}}', ctx);
  eq(bad.ok, false, 'missing + unknown fmt -> not ok');
  deep(bad.missing, ['order.phone', 'x', 'y'], 'validate dry-run collects missing');
  deep(bad.unknownFormatters, ['bogus', 'wat:1'], 'unknown formatters flagged sorted+deduped');
  const onlyFmt = validateTemplate('{{order.total | monee}}', ctx);
  eq(onlyFmt.ok, false, 'typo formatter -> not ok');
  deep(onlyFmt.unknownFormatters, ['monee'], 'unknown name reported');
  eq(renderTemplate('{{order.total | monee}}', ctx).text, '1234.56',
    'render-time unknown formatter is a no-op');
  const emptyFmt = validateTemplate('{{order.total | }}', ctx);
  eq(emptyFmt.ok, false); deep(emptyFmt.unknownFormatters, ['(empty formatter)'],
    'empty formatter spec flagged');
}

// -------------------------------------------------------------------- bounds
{
  const many = Array.from({ length: TEMPLATE_MAX_PLACEHOLDERS + 3 }, (_, i) => `{{k${i}}}`).join('');
  const r = renderTemplate(many, {});
  eq(r.missing.length, TEMPLATE_MAX_PLACEHOLDERS + 3, 'all unresolved recorded');
  ok(r.text.endsWith(`{{k${TEMPLATE_MAX_PLACEHOLDERS + 2}}}`),
    'placeholders past cap stay literal');
}

rmSync(bundlePath, { force: true }); // generated bundle — keep the tree clean

console.log(`PASS template-render (${n} asserts: paths/array-index/formatters/money/date/upper/lower/title/default+pipe order/strict+missing/malformed braces/proto-safety/placeholdersIn/validateTemplate/cap)`);
