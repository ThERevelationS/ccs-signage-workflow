import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// Vite-style extensionless imports can't be resolved by bare Node — bundle first.
const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(here, '.tmp-double-sided.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/doubleSidedPricing.ts')],
  bundle: true, format: 'esm', outfile: bundlePath, logLevel: 'silent',
});
const {
  DOUBLE_SIDED_MODES, NO_SECOND_SIDE, round2, round4,
  normalizeDoubleSidedMode, isDoubleSided,
  partSecondSideRule, resolveSecondSideRule,
  resolveSecondSidePrice, doubleSidedQuote,
} = await import(pathToFileURL(bundlePath).href);

const P = { id: 'p1', double_sided: true };
const priced = (part, side1, mo, extra = {}) =>
  resolveSecondSidePrice({ part, side1_price: side1, machine_override: mo, ...extra });

// ---------------------------------------------------------- mode vocabulary
assert.deepEqual([...DOUBLE_SIDED_MODES],
  ['full_price', 'half_price', 'percent', 'flat', 'machine_rate', 'free'],
  'F-18 candidate mode set (map §8 documents rules existence only)');
assert.ok(Object.isFrozen(DOUBLE_SIDED_MODES), 'modes frozen');
assert.equal(NO_SECOND_SIDE, 'none', 'disabled sentinel');
assert.equal(normalizeDoubleSidedMode('HALF'), 'half_price', 'alias + case fold');
assert.equal(normalizeDoubleSidedMode('pct'), 'percent');
assert.equal(normalizeDoubleSidedMode('no_charge'), 'free', "'none'-family -> free");
assert.equal(normalizeDoubleSidedMode('bogus'), null, 'unknown -> null');
assert.equal(normalizeDoubleSidedMode({ mode: 'flat' }), null, 'record -> null');
assert.equal(round2(16.665), 16.67, 'EPSILON half-up cents');
assert.equal(round4(0.12345), 0.1235);

// ---------------------------------------------------------- isDoubleSided aliases
assert.equal(isDoubleSided({ double_sided: true }), true, 'spec: double_sided===true');
assert.equal(isDoubleSided({ sides: 2 }), true, 'spec: sides===2');
assert.equal(isDoubleSided({ two_sided: true }), true, 'spec: two_sided===true');
assert.equal(isDoubleSided({ double_sided: false }), false);
assert.equal(isDoubleSided({ sides: 1 }), false);
assert.equal(isDoubleSided({ sides: '2' }), true, "side-count string '2'");
assert.equal(isDoubleSided({ sides: 'double' }), true, "'double' side count word");
assert.equal(isDoubleSided({ duplex: true }), true, 'duplex flag alias');
assert.equal(isDoubleSided({ doubleSided: true }), true, 'camelCase alias');
assert.equal(isDoubleSided({ two_sided: 'yes' }), true, 'string-bool flag');
assert.equal(isDoubleSided({ second_side: true }), true, 'second_side bool flag');
assert.equal(isDoubleSided({ second_side: { mode: 'free' } }), false,
  'second_side RULE record is not a flag — flag still required (fail-closed)');
assert.equal(isDoubleSided({}), false);
assert.equal(isDoubleSided(null), false, 'non-record -> false');
assert.equal(isDoubleSided('p1'), false);

// ---------------------------------------------------------- all modes on part rule
{
  const mk = (cfg) => ({ ...P, second_side_pricing: cfg });
  const full = priced(mk({ mode: 'full_price' }), 100);
  assert.equal(full.mode, 'full_price');
  assert.equal(full.amount, 100, 'full_price = side1');
  assert.equal(full.second_side_price, 100, 'amount === second_side_price');
  assert.equal(full.total, 200);

  const half = priced(mk({ mode: 'half_price' }), 100);
  assert.equal(half.amount, 50, 'half_price = side1 x 0.5');
  assert.equal(half.total, 150);

  const pct = priced(mk({ mode: 'percent', value: 60 }), 100);
  assert.equal(pct.amount, 60, 'percent = side1 x value/100');
  assert.equal(pct.value, 60);
  assert.equal(pct.total, 160);

  const flat = priced(mk({ mode: 'flat', value: 12.5 }), 100);
  assert.equal(flat.amount, 12.5, 'flat = value (line-level, not per unit)');
  assert.equal(flat.total, 112.5);

  const free = priced(mk({ mode: 'free' }), 100);
  assert.equal(free.amount, 0, 'free = 0');
  assert.equal(free.total, 100);

  const mr = priced(mk({ mode: 'machine_rate', value: 2.5 }), 100, undefined, { qty: 10 });
  assert.equal(mr.amount, 25, 'machine_rate = rate x qty factor (2.5 x 10)');
  assert.equal(mr.total, 125);

  const mrnq = priced(mk({ mode: 'machine_rate', value: 2.5 }), 100);
  assert.equal(mrnq.amount, 2.5, 'no qty factor -> rate applies once');

  const fac = priced(mk({ mode: 'machine_rate', factor: 0.25 }), 100);
  assert.equal(fac.amount, 25, 'factor escape hatch = side1 x factor');

  // Scalar rule shorthand: bare number = percent, mode token = mode.
  assert.equal(priced(mk(35), 100).amount, 35, 'bare number -> percent mode');
  assert.equal(priced(mk('half_price'), 100).amount, 50, 'string mode token');
  assert.equal(priced(mk('60%'), 100).amount, 60, "percent string '60%'");

  // Bare pct field interop (machineCosts second_side_price_pct vocabulary).
  const barePct = priced({ ...P, second_side_price_pct: 60 }, 100);
  assert.equal(barePct.mode, 'percent', 'bare pct field -> percent mode');
  assert.equal(barePct.amount, 60);
  assert.equal(barePct.source, 'part_pct_field');
}

// ---------------------------------------------------------- override precedence
{
  const part = { ...P, second_side_pricing: { mode: 'free' } };
  const ov = priced(part, 100, { mode: 'flat', value: 7 });
  assert.equal(ov.mode, 'flat', 'machine_override mode wins over part free');
  assert.equal(ov.amount, 7);
  assert.equal(ov.source, 'machine_override');
  assert.equal(ov.total, 107);

  // Override scalar shapes.
  assert.equal(priced(part, 100, 40).amount, 40, 'bare-number override -> percent');
  assert.equal(priced(part, 100, { second_side_price_pct: 75 }).amount, 75,
    'machinePartOverride-shaped {second_side_price_pct} -> percent');
  assert.equal(priced(part, 100, { rate: 3 }, { qty: 4 }).amount, 12,
    'mode-less {rate} -> machine_rate x qty');
  assert.equal(priced(part, 100, { flat_fee: 9 }).amount, 9,
    'mode-less {flat_fee} -> flat');
  assert.equal(priced(part, 100, 'half_price').amount, 50, 'scalar token override');

  // Unrecognized override is SKIPPED (unknown price_calc precedent) — part rule applies.
  const bad = priced(part, 100, { mode: 'bogus', value: 5 });
  assert.equal(bad.mode, 'free', 'unknown override mode skipped -> part rule');
  assert.equal(bad.amount, 0);
  assert.ok(bad.warnings.some((w) => /unrecognized machine_override.*bogus/.test(w)),
    'skip surfaces a warning');

  const junk = priced(part, 100, 'zzz');
  assert.equal(junk.mode, 'free', 'junk scalar override ignored');
  assert.ok(junk.warnings.length >= 1, 'junk scalar warns');
}

// ---------------------------------------------------------- defaults + fail-closed
{
  const dflt = priced(P, 100);
  assert.equal(dflt.mode, 'full_price', 'unconfigured duplex -> full_price default');
  assert.equal(dflt.source, 'default');
  assert.equal(dflt.amount, 100, 'DEFAULT_SECOND_SIDE_PCT=100 parity — no silent discount');
  assert.equal(dflt.total, 200);

  const noPct = priced({ ...P, second_side_pricing: { mode: 'percent' } }, 100);
  assert.equal(noPct.amount, 100, 'percent missing value -> 100% assumed');
  assert.ok(noPct.warnings.some((w) => /missing value/.test(w)));

  const noFlat = priced({ ...P, second_side_pricing: { mode: 'flat' } }, 100);
  assert.equal(noFlat.amount, 100, 'flat missing value -> full price (fail-closed)');
  assert.ok(noFlat.warnings.some((w) => /missing value/.test(w)));

  const noRate = priced({ ...P, second_side_pricing: { mode: 'machine_rate' } }, 100);
  assert.equal(noRate.amount, 100, 'machine_rate missing rate -> full price');
  assert.ok(noRate.warnings.some((w) => /missing rate/.test(w)));

  const neg = priced({ ...P, second_side_pricing: { mode: 'percent', value: -10 } }, 100);
  assert.equal(neg.amount, 0, 'negative pct clamped to 0');
  assert.ok(neg.warnings.some((w) => /clamped/.test(w)));

  const over = priced({ ...P, second_side_pricing: { mode: 'percent', value: 150 } }, 100);
  assert.equal(over.amount, 150, 'pct > 100 honored (second side can exceed first)');
  assert.ok(over.warnings.some((w) => /> 100/.test(w)));

  const zeroFlat = priced({ ...P, second_side_pricing: { mode: 'flat', value: 0 } }, 100);
  assert.equal(zeroFlat.amount, 0, 'explicit flat 0 is a real value -> free side');
  assert.equal(zeroFlat.warnings.length, 0, 'explicit zero does not warn');
}

// ---------------------------------------------------------- boolean guard
{
  // Booleans are flags, never numeric rule values (Number(true)=1 must not
  // read as 1% / $1): second_side:true enables the flag; the rule resolves
  // at the full_price default, machine_override:true carries no rule.
  const flag = priced({ second_side: true }, 100);
  assert.equal(flag.mode, 'full_price', 'second_side:true flag -> default rule, not 1%');
  assert.equal(flag.amount, 100);
  const boolOv = priced(P, 100, true);
  assert.equal(boolOv.amount, 100, 'machine_override:true -> no rule -> default');
  assert.ok(boolOv.warnings.some((w) => /unrecognized/.test(w)), 'bool override warned as junk');
  const boolPct = priced({ ...P, second_side_pricing: { mode: 'percent', value: true } }, 100);
  assert.equal(boolPct.amount, 100, 'value:true is not a number -> 100% assumed');
  assert.ok(boolPct.warnings.some((w) => /missing value/.test(w)));
}

// ---------------------------------------------------------- rounding
{
  const r = priced({ ...P, second_side_pricing: { mode: 'percent', value: 50 } }, 33.33);
  assert.equal(r.amount, 16.67, 'half-up cent rounding on odd cents');
  assert.equal(r.total, 50, 'total = round2(s1) + round2(amount), cent-consistent');

  const r2 = priced({ ...P, second_side_pricing: { mode: 'half_price' } }, 10.005);
  assert.equal(r2.side1_price, 10.01, 'side1 rounded on entry');
  assert.equal(r2.amount, 5.01, '10.01 x 0.5 -> 5.005 -> 5.01');
  assert.equal(r2.total, 15.02);
}

// ---------------------------------------------------------- disabled passthrough
{
  const off = resolveSecondSidePrice({ part: { id: 'x' }, side1_price: 80 });
  assert.equal(off.mode, 'none', 'not double_sided -> mode none');
  assert.equal(off.amount, 0);
  assert.equal(off.second_side_price, 0);
  assert.equal(off.total, 80, 'total = side1 passthrough');
  assert.equal(off.double_sided, false);
  assert.equal(off.source, 'disabled');

  const off2 = resolveSecondSidePrice({});
  assert.equal(off2.mode, 'none', 'missing part -> none, never throws');
  assert.equal(off2.total, 0);
}

// ---------------------------------------------------------- rule-level API
{
  const part = { ...P, second_side_pricing: { mode: 'percent', value: 25 } };
  const rule = partSecondSideRule(part);
  assert.equal(rule.mode, 'percent');
  assert.equal(rule.source, 'part');
  assert.equal(partSecondSideRule({}), null, 'unconfigured part -> null');

  const eff = resolveSecondSideRule(part, { mode: 'flat', value: 5 });
  assert.equal(eff.mode, 'flat', 'override wins at rule level');
  const eff2 = resolveSecondSideRule(part, { mode: 'bogus' });
  assert.equal(eff2.mode, 'percent', 'bogus override falls through to part rule');
  assert.equal(resolveSecondSideRule({}).mode, 'full_price', 'nothing -> default');
}

// ---------------------------------------------------------- doubleSidedQuote
{
  const q = doubleSidedQuote(P, 10, 5);
  assert.equal(q.side1_total, 50, 'qty x unit');
  assert.equal(q.side2_total, 50, 'default full second side');
  assert.equal(q.total, 100);
  assert.equal(q.mode, 'full_price');
  assert.equal(q.second_side_unit_price, 5, '50 / 10 units');

  const half = doubleSidedQuote(
    { ...P, second_side_pricing: { mode: 'half_price' } }, 4, 12.5);
  assert.equal(half.side1_total, 50);
  assert.equal(half.side2_total, 25);
  assert.equal(half.total, 75);
  assert.equal(half.second_side_unit_price, 6.25);

  const flatQ = doubleSidedQuote(
    { ...P, second_side_pricing: { mode: 'flat', value: 15 } }, 3, 10);
  assert.equal(flatQ.side2_total, 15, 'flat is line-level — NOT x qty');
  assert.equal(flatQ.total, 45);

  const mrQ = doubleSidedQuote(P, 8, 10, { mode: 'machine_rate', value: 2 });
  assert.equal(mrQ.side1_total, 80);
  assert.equal(mrQ.side2_total, 16, 'rate 2 x qty 8 via quote qty forwarding');
  assert.equal(mrQ.total, 96);

  const ovQ = doubleSidedQuote(
    { ...P, second_side_pricing: { mode: 'free' } }, 2, 25, { mode: 'percent', value: 80 });
  assert.equal(ovQ.side2_total, 40, 'override flows through quote');
  assert.equal(ovQ.total, 90);
  assert.equal(ovQ.source, 'machine_override');

  const dis = doubleSidedQuote({ id: 'x' }, 5, 10);
  assert.equal(dis.mode, 'none', 'disabled-part passthrough');
  assert.equal(dis.side1_total, 50);
  assert.equal(dis.side2_total, 0);
  assert.equal(dis.total, 50, 'total = side1 only');
  assert.equal(dis.double_sided, false);

  const zero = doubleSidedQuote({ ...P, second_side_pricing: { mode: 'flat', value: 10 } }, 0, 10);
  assert.equal(zero.side1_total, 0);
  assert.equal(zero.side2_total, 10, 'flat fee still applies at qty 0');
  assert.equal(zero.second_side_unit_price, 0, 'no per-unit at qty 0');
}

console.log('PASS double-sided (125+ asserts: mode vocabulary + freeze, flag aliases incl spec triple, all six modes, scalar shorthand, bare pct-field interop, machine_override precedence + all override shapes, unrecognized-mode skip + warnings, fail-closed missing values, clamps, >100% honored, boolean flag guard, cent-safe rounding, disabled passthrough, rule API precedence, quote qty forwarding + flat line-level + per-unit)');
