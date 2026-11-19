import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// F-07 suite — global variables registry for pricing formulas.
// Vite-style extensionless imports can't be resolved by bare Node — bundle first.
const here = dirname(fileURLToPath(import.meta.url));
const varBundle = resolve(here, '.tmp-pricing-variables.mjs');
const feBundle = resolve(here, '.tmp-formula-eval.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/pricingVariables.ts')],
  bundle: true, format: 'esm', outfile: varBundle, logLevel: 'silent',
});
buildSync({
  entryPoints: [resolve(here, '../base44/shared/formulaEval.ts')],
  bundle: true, format: 'esm', outfile: feBundle, logLevel: 'silent',
});
const {
  BUILTIN_VARIABLES,
  BUILTIN_VARIABLE_NAMES,
  PRICING_VARIABLE_NAME_RE,
  canonicalVariableName,
  normalizePricingVariables,
  buildFormulaEnv,
  resolveVariable,
} = await import(pathToFileURL(varBundle).href);
const { evaluateFormula } = await import(pathToFileURL(feBundle).href);

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); n++; };

// ---------------------------------------------------------- builtin registry
eq(BUILTIN_VARIABLES.length, 7, 'exactly 7 builtins');
assert.deepEqual(
  BUILTIN_VARIABLES.map(v => v.name),
  ['Quantity', 'Width', 'Height', 'Depth', 'PartBaseCost', 'PartRetail', 'StitchCount'],
  'canonical builtin order',
); n++;
assert.deepEqual([...BUILTIN_VARIABLE_NAMES], BUILTIN_VARIABLES.map(v => v.name),
  'BUILTIN_VARIABLE_NAMES mirrors list'); n++;
for (const v of BUILTIN_VARIABLES) {
  ok(PRICING_VARIABLE_NAME_RE.test(v.name), `builtin '${v.name}' is a valid ident`);
  eq(typeof v.label, 'string'); ok(v.label.length > 0, `'${v.name}' has a label`);
  eq(typeof v.description, 'string'); ok(v.description.length > 0, `'${v.name}' has a description`);
  eq(typeof v.default, 'number'); ok(Number.isFinite(v.default), `'${v.name}' default finite`);
}
eq(BUILTIN_VARIABLES.find(v => v.name === 'Quantity').default, 1, 'Quantity defaults to 1');
eq(BUILTIN_VARIABLES.find(v => v.name === 'Width').default, 0, 'Width defaults to 0');

// ------------------------------------------------------------- normalize()
eq(normalizePricingVariables(undefined).length, 0, 'undefined -> []');
eq(normalizePricingVariables('nope').length, 0, 'non-array -> []');
eq(normalizePricingVariables([]).length, 0, 'empty -> []');

{
  const rows = normalizePricingVariables([
    { name: 'SqFtRate', label: 'SqFt Rate', description: 'per-sqft retail', default_value: 1.5 },
    { name: ' RushFee ', default: 25 },                    // trim + 'default' alias
    { name: 'InstallRate', value: '40' },                  // 'value' alias + numeric string
  ]);
  eq(rows.length, 3, 'three valid rows kept');
  eq(rows[0].name, 'SqFtRate');
  eq(rows[0].status, 'active', 'valid row -> active');
  eq(rows[0].default_value, 1.5);
  eq(rows[1].name, 'RushFee', 'name trimmed');
  eq(rows[1].label, 'RushFee', 'label defaults to name');
  eq(rows[1].default_value, 25, "'default' alias accepted");
  eq(rows[2].default_value, 40, 'numeric string default coerces');
  ok(rows.every(r => ['name','label','description','default_value','status'].every(k => k in r)),
    'rows carry the entity shape');
}

// invalid names -> error entries
{
  const rows = normalizePricingVariables([
    { name: '9Lives', default_value: 1 },
    { name: 'has space', default_value: 1 },
    { name: '', default_value: 1 },
    { name: 'ok_name.9', default_value: 1 },
    { name: '_private', default_value: 2 },                // leading _ is legal
    'not-an-object',
  ]);
  eq(rows.length, 6, 'every row produces an entry');
  eq(rows.filter(r => r.status === 'error').length, 5, 'five error entries');
  eq(rows.filter(r => r.status === 'active').length, 1, "'_private' survives");
  ok(rows[0].error && /invalid variable name/.test(rows[0].error), 'error message names cause');
}

// reserved-name collisions (case-insensitive) -> error entries
{
  const rows = normalizePricingVariables([
    { name: 'Quantity', default_value: 1 },
    { name: 'quantity', default_value: 1 },
    { name: 'PARTBASECOST', default_value: 1 },
    { name: 'stitchcount', default_value: 1 },
    { name: 'true', default_value: 1 },                    // formula literal
    { name: 'Widthx', default_value: 1 },                  // near-name, NOT reserved
  ]);
  eq(rows.filter(r => r.status === 'error').length, 5, '5 reserved collisions');
  ok(/reserved|builtin/.test(rows[0].error), 'reserved error message');
  eq(rows[5].status, 'active', 'Widthx is a legal custom name');
}

// case-insensitive dedupe — first survives, later dupes error
{
  const rows = normalizePricingVariables([
    { name: 'Rate', default_value: 1 },
    { name: 'RATE', default_value: 2 },
    { name: 'rate', default_value: 3 },
    { name: 'Other', default_value: 4 },
  ]);
  eq(rows.length, 4);
  eq(rows[0].status, 'active', 'first occurrence survives');
  eq(rows[0].default_value, 1, 'kept row keeps its own default');
  eq(rows[1].status, 'error'); ok(/duplicate/.test(rows[1].error));
  eq(rows[2].status, 'error');
  eq(rows[3].status, 'active', 'distinct name unaffected');
}

// non-numeric default -> error entry; sticky errors + idempotency
{
  const rows = normalizePricingVariables([
    { name: 'Bad', default_value: 'abc' },
    { name: 'Good', status: 'archived', default_value: 5 },
  ]);
  eq(rows[0].status, 'error'); ok(/finite number/.test(rows[0].error));
  eq(rows[0].default_value, 0, 'error rows carry numeric default_value 0');
  eq(rows[1].status, 'archived', 'operator status passes through');
  const again = normalizePricingVariables(rows);           // idempotent round-trip
  eq(again.length, rows.length, 're-normalize keeps row count');
  eq(again[0].status, 'error', 'sticky error survives round-trip');
  eq(again[1].status, 'archived', 'archived survives round-trip');
}

// ------------------------------------------------------------- env building
{
  // empty input -> all 7 builtins at their defaults
  const env = buildFormulaEnv();
  eq(Object.keys(env).length, 7, 'bare env = the 7 builtins');
  eq(env.Quantity, 1); eq(env.Width, 0); eq(env.StitchCount, 0);
}

{
  // product fields feed qty/dims/stitch; part fields feed base/retail
  const env = buildFormulaEnv({
    product: { quantity: 4, width: 48, height: 24, depth: 5, stitch_count: 10000 },
    part: { base_cost: 12.5, retail: 30 },
  });
  eq(env.Quantity, 4); eq(env.Width, 48); eq(env.Height, 24); eq(env.Depth, 5);
  eq(env.PartBaseCost, 12.5); eq(env.PartRetail, 30); eq(env.StitchCount, 10000);
}

{
  // alternate field spellings + fallbacks
  const env = buildFormulaEnv({
    product: { product_quantity: '3', width_in: 10 },
    part: { part_qty: 2, unit_cost: 7, retail_price: 15, height: 8 },
  });
  eq(env.Quantity, 3, 'product_quantity coerces (product wins over part_qty)');
  eq(env.Width, 10, 'width_in alias');
  eq(env.Height, 8, 'part dims used when product lacks them');
  eq(env.PartBaseCost, 7, 'unit_cost alias');
  eq(env.PartRetail, 15, 'retail_price alias');
}

{
  // precedence: builtin < global < override
  const globals = [
    { name: 'SqFtRate', default_value: 2.5, status: 'active' },
    { name: 'quantity', default_value: 99, status: 'error' },   // reserved — skipped
    { name: 'Archived', default_value: 7, status: 'archived' }, // non-active — skipped
    { name: 'Bad', default_value: 5, status: 'error' },
  ];
  const env = buildFormulaEnv({
    product: { quantity: 4, width: 48, height: 24 },
    globals,
    builtinOverrides: { quantity: 100, sqftrate: 3.75, NewVar: 11, 'not valid!': 1 },
  });
  eq(env.Quantity, 100, 'override beats builtin product field');
  eq(env.SqFtRate, 3.75, 'ci override canonicalizes onto global casing');
  eq(env.NewVar, 11, 'new vars may be injected via overrides');
  ok(!('not valid!' in env), 'non-ident override keys skipped');
  eq(env.Archived, undefined, 'archived global not injected');
  ok(env.Bad === undefined || env.Bad === 0, 'error global not injected');
  // globals beat builtin defaults but not field-fed builtins
  const env2 = buildFormulaEnv({ globals: [{ name: 'SqFtRate', default_value: 2.5 }] });
  eq(env2.SqFtRate, 2.5, 'active global injects its default');
  eq(env2.Quantity, 1, 'global layer leaves builtins alone');
}

{
  // override can rest on a name matching a builtin in ANY case
  const env = buildFormulaEnv({ builtinOverrides: { STITCHCOUNT: 500 } });
  eq(env.StitchCount, 500, 'ci key normalized to canonical builtin casing');
  ok(!('STITCHCOUNT' in env), 'no duplicate non-canonical key left behind');
}

{
  // globals passed as a wrapped GlobalSettings-style row
  const env = buildFormulaEnv({
    globals: { pricing_variables: [{ name: 'ShopRate', default_value: 65 }] },
  });
  eq(env.ShopRate, 65, 'wrapped pricing_variables row unwraps');
}

// ------------------------------------------------------- engine integration
{
  const env = buildFormulaEnv({
    product: { quantity: 30, width: 48, height: 24 },
    part: { base_cost: 3, retail: 2 },
    globals: [{ name: 'WasteFactor', default_value: 1.1 }],
    builtinOverrides: { Quantity: 100 },
  });
  const r = evaluateFormula('Width * Height * Quantity / 144', env);
  eq(r.ok, true, 'env feeds evaluateFormula');
  eq(r.value, 800, '48*24*100/144');
  const r2 = evaluateFormula('PartRetail * Quantity + PartBaseCost', env);
  eq(r2.value, 203, '2*100+3');
  const r3 = evaluateFormula('SqFt * WasteFactor', { SqFt: 10, ...env });
  ok(Math.abs(r3.value - 11) < 1e-9, 'global var resolves in formula');
  const r4 = evaluateFormula('StitchCount / 1000 * 1.25', env);
  eq(r4.value, 0, 'builtin default (0) present — no unknown-var error');
}

// --------------------------------------------------------- resolveVariable
{
  const env = buildFormulaEnv({
    product: { quantity: 5 },
    globals: [{ name: 'SqFtRate', default_value: 2.5 }],
  });
  eq(resolveVariable('Quantity', env), 5, 'exact-case hit');
  eq(resolveVariable('quantity', env), 5, 'case-insensitive fallback');
  eq(resolveVariable('SQFTRATE', env), 2.5, 'ci hit on a global');
  eq(resolveVariable('Nope', env), null, 'missing -> null');
  eq(resolveVariable('Width', { Width: 'abc' }), null, 'non-numeric -> null');
  eq(resolveVariable('Width', { Width: '12' }), 12, 'numeric string coerces');
  eq(resolveVariable('', env), null, 'blank name -> null');
  eq(resolveVariable('Quantity', null), null, 'null env -> null');
  eq(resolveVariable('__proto__', env), null, 'inherited props never resolve');
}

// -------------------------------------------------- entity schema (additive)
{
  const schema = JSON.parse(
    readFileSync(resolve(here, '../base44/entities/GlobalSettings.jsonc'), 'utf8'),
  );
  const pv = schema.properties.pricing_variables;
  ok(pv, 'pricing_variables property exists');
  eq(pv.type, 'array', 'pricing_variables is an array');
  eq(pv.items.type, 'object', 'items are objects');
  for (const f of ['name', 'label', 'description', 'status']) {
    eq(pv.items.properties[f].type, 'string', `items.${f}: string`);
  }
  eq(pv.items.properties.default_value.type, 'number', 'items.default_value: number');
  assert.deepEqual(Object.keys(pv.items.properties).sort(),
    ['default_value', 'description', 'label', 'name', 'status'],
    'exactly the five declared item fields'); n++;
  // additive only — pre-existing fields untouched
  for (const f of ['setting_key', 'setting_value', 'hoursOfOperation', 'emailDelivery',
    'deadlineRules', 'creditTermsDefaults', 'autoInactiveMonths']) {
    ok(schema.properties[f], `pre-existing field '${f}' still present`);
  }
  assert.deepEqual(schema.required, ['setting_key'], 'required list unchanged'); n++;
  eq(schema.rls.read.user_condition.role, '__globalsettings_backend_only__', 'rls unchanged');
}

rmSync(varBundle, { force: true }); // generated bundle — keep the tree clean

console.log(`PASS pricing variables (${n} asserts: builtins/normalize/dedupe/reserved/env precedence/case-normalization/engine/entity)`);
