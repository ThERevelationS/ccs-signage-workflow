import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// Vite-style extensionless imports can't be resolved by bare Node — bundle first.
const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(here, '.tmp-formula-eval.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/formulaEval.ts')],
  bundle: true, format: 'esm', outfile: bundlePath, logLevel: 'silent',
});
const { evaluateFormula, validateFormula, FORMULA_RESERVED_VARS } = await import(pathToFileURL(bundlePath).href);

const eq = (src, expected, env) => {
  const r = evaluateFormula(src, env);
  assert.equal(r.ok, true, `expected ok for "${src}" — got ${JSON.stringify(r)}`);
  assert.ok(Math.abs(r.value - expected) < 1e-9, `"${src}" expected ${expected}, got ${r.value}`);
};
const isErr = (src, match, env) => {
  const r = evaluateFormula(src, env);
  assert.equal(r.ok, false, `expected error for "${src}" — got ${JSON.stringify(r)}`);
  if (match) assert.match(r.error, match, `"${src}" -> "${r.error}"`);
  assert.equal(typeof r.pos, 'number', `"${src}" error has numeric pos`);
  return r;
};

// ---------------------------------------------------------------- arithmetic
eq('1+2*3', 7);                        // precedence: * over +
eq('(1+2)*3', 9);                      // parens override
eq('10-4-3', 3);                       // left assoc
eq('100/10/5', 2);
eq('2^3^2', 512);                      // ^ right assoc: 2^(3^2)=2^9
eq('10/4', 2.5);
eq('17 % 5', 2);
eq('-7 % 3', 2);                       // floored modulo (Excel MOD): sign of divisor
eq('7 % -3', -2);
eq('5.5 % 2', 1.5);
eq('1e3 + .5', 1000.5);                // exponent + leading-dot literals
eq('1. + 2.', 3);
eq('2 * -3', -6);                      // unary minus binds tighter than *
eq('-2^2', -4);                        // math convention: ^ tighter than unary
eq('(-2)^2', 4);
eq('2^-2', 0.25);                      // unary minus in exponent
eq('--5', 5);                          // double unary
eq('5--3', 8);                         // binary minus then unary minus
eq('+7', 7);                           // unary plus no-op
eq('-(3+4)', -7);

// ------------------------------------------------------- comparisons/logical
eq('3 >= 3', 1); eq('2 > 3', 0);
eq('2 <= 1', 0); eq('1 < 2', 1);
eq('4 == 4', 1); eq('4 != 4', 0); eq('4 != 5', 1);
eq('1 < 2 < 3', 1);                    // chained cmp = left-assoc ((1<2)<3)
eq('1 + 2 == 3 && 4 > 2', 1);          // precedence: arith > cmp > &&
eq('1 && 1', 1); eq('1 && 0', 0);
eq('0 || 5', 1); eq('0 || 0', 0);      // logical ops return 1/0 (not coalesce)
eq('!0', 1); eq('!5', 0);
eq('!1 == 0', 1);                      // ! binds tighter than ==
eq('0 && 1/0', 0);                     // short-circuit: RHS never evaluates
eq('1 || 1/0', 1);
eq('x != 0 && 10/x > 2', 0, { x: 0 }); // guarded division — no error

// ------------------------------------------------------------------- ternary
eq('1 ? 10 : 20', 10); eq('0 ? 10 : 20', 20);
eq('Width > 100 ? Width * 2 : Width', 300, { Width: 150 });
eq('Width > 100 ? Width * 2 : Width', 50, { Width: 50 });
eq('0 ? 1 : 0 ? 2 : 3', 3);            // right-assoc else-branch
eq('1 ? 42 : 1/0', 42);                // lazy: dead branch not evaluated
eq('0 ? 1/0 : 42', 42);

// ----------------------------------------------------------------- functions
eq('min(3,1,2)', 1); eq('max(3,1,2)', 3); eq('min(5)', 5);   // variadic >=1
eq('round(2.5)', 3); eq('round(-2.5)', -3);                  // half away from zero
eq('round(3.14159, 2)', 3.14);
eq('round(123.456, -1)', 120);
eq('floor(3.9)', 3); eq('floor(-3.1)', -4); eq('floor(2.345, 2)', 2.34);
eq('ceil(3.1)', 4); eq('ceil(-3.9)', -3);
eq('ceiling(2.1)', 3);                 // alias
eq('abs(-7)', 7);
eq('sqrt(9)', 3);
eq('pow(2,10)', 1024);
eq('if(2 > 1, 100, 200)', 100); eq('if(0, 100, 200)', 200);
eq('if(1, 42, 1/0)', 42);              // lazy branches
eq('MAX(1,2)', 2); eq('CeIl(1.2)', 2); eq('IF(0,1,2)', 2);   // case-insensitive
eq('min(Width, max(0, PartRetail))', 8, { Width: 8, PartRetail: 12 }); // nesting

// ------------------------------------------------------------------- env vars
eq('PartBaseCost * Quantity', 50, { PartBaseCost: 12.5, Quantity: 4 });
eq('Width * Height / 144', 8, { Width: 48, Height: 24 });
eq('PartBaseCost + PartRetail + Width + Height + Depth + Quantity + StitchCount', 7,
  { PartBaseCost: 1, PartRetail: 1, Width: 1, Height: 1, Depth: 1, Quantity: 1, StitchCount: 1 });
assert.deepEqual([...FORMULA_RESERVED_VARS].sort(),
  ['Depth', 'Height', 'PartBaseCost', 'PartRetail', 'Quantity', 'StitchCount', 'Width']);
eq('Width * 2', 20, { Width: '10' });                 // numeric string coerces
eq('SqFt * Rate', 300, { SqFt: 200, Rate: 1.5 });     // "modifier answer" vars
eq('true', 1); eq('FALSE ? 1 : 2', 2);                // literals
eq('min + 1', 6, { min: 5 });                         // fn name as var outside call
eq('if(Quantity >= 100, PartRetail * Quantity * 0.9, PartRetail * Quantity)', 135,
  { Quantity: 100, PartRetail: 1.5 });                // realistic pricing formula
eq('Width * Height * Quantity / 144', 240, { Width: 48, Height: 24, Quantity: 30 });
eq('StitchCount / 1000 * 1.25 * Quantity', 187.5, { StitchCount: 10000, Quantity: 15 });

// ----------------------------------------------------------- clean errors
{
  const r = isErr('1/0', /division by zero/);
  assert.equal(r.pos, 1, 'div-by-zero pos = the / operator');
}
{
  const r = isErr('10 / 0', /division by zero/);
  assert.equal(r.pos, 3);
}
isErr('10 % 0', /modulo by zero/);
{
  const r = isErr('Foo + 1', /unknown variable 'Foo'/);
  assert.equal(r.pos, 0, 'unknown var pos = identifier start');
}
isErr('width + 1', /did you mean 'Width'/, { Width: 3 });   // near-match hint
isErr('Width + 1', /not a finite number/, { Width: 'abc' });
isErr('W + 1', /not numeric/, { W: null });
isErr('W + 1', /not numeric/, { W: {} });
{
  const r = isErr('1 +', /unexpected end of expression/);
  assert.equal(r.pos, 3, 'syntax pos = src.length at EOF');
}
{
  const r = isErr('(1 + 2', /expected '\)'/);
  assert.equal(r.pos, 6);
}
{
  const r = isErr('1 2', /unexpected number/);
  assert.equal(r.pos, 2);
}
{
  const r = isErr('* 3', /unexpected operator/);
  assert.equal(r.pos, 0);
}
isErr('a = b', /did you mean '=='/);
isErr('a & b', /did you mean '&&'/);
isErr('1 ? 2', /expected ':'/);
isErr('', /empty formula/);
isErr('   ', /empty formula/);
isErr('()', /unexpected/);
isErr('sqrt(-1)', /sqrt of a negative number/);
isErr('pow(10,400)', /non-finite/);                 // overflow
isErr('1e308 * 1e308', /non-finite/);
isErr('min()', /expects/);                          // arity at parse time
isErr('pow(2)', /expects 2 argument/);
isErr('if(1,2)', /expects 3/);
isErr('nosuchfn(1)', /unknown function 'nosuchfn'/);

// ----------------------------------------------------- injection resistance
{
  const r = isErr('process.env', /unexpected character '\.'/);
  assert.equal(r.pos, 7, 'dot in identifier rejected at tokenize');
}
isErr('constructor', /unknown variable 'constructor'/);   // inherited prop blocked
isErr('__proto__', /unknown variable '__proto__'/);
isErr('toString', /unknown variable 'toString'/);
isErr('hasOwnProperty', /unknown variable/);
isErr('eval(1)', /unknown function 'eval'/);
isErr('Function(1)', /unknown function/);
isErr('"$x"', /unexpected character/);                    // no string literals

// ------------------------------------------------------------- nesting bound
isErr('('.repeat(150) + '1' + ')'.repeat(150), /too deeply nested/);
isErr('-'.repeat(120) + '5', /too deeply nested/);
isErr('1?2:'.repeat(150) + '1', /too deeply nested/);     // ternary chain counts
{
  const okChain = '1?2:'.repeat(60) + '1';
  eq(okChain, 2);                                         // 60-deep ternary still fits
}
{
  const flat = Array(300).fill('1').join('+');
  eq(flat, 300);                                          // flat chains don't nest
}
isErr('x'.repeat(20000), /too long/);                     // source length cap

// --------------------------------------------------------- validateFormula()
{
  const v = validateFormula('Width*2 + Quantity');
  assert.equal(v.ok, true);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.vars, ['Quantity', 'Width'], 'vars sorted+unique');
}
{
  const v = validateFormula('min(Width, max(0, PartRetail))');
  assert.equal(v.ok, true);
  assert.deepEqual(v.vars, ['PartRetail', 'Width'], 'fn names excluded from vars');
}
{
  const v = validateFormula('1 + )');
  assert.equal(v.ok, false);
  assert.equal(v.errors.length, 1);
  assert.match(v.errors[0].error, /unexpected/);
  assert.equal(typeof v.errors[0].pos, 'number');
}
{
  const v = validateFormula('Foo + Bar(1)');
  assert.equal(v.ok, false, 'unknown fn caught by validate');
  assert.match(v.errors[0].error, /unknown function 'Bar'/);
  assert.deepEqual(v.vars, ['Foo'], 'vars seen before error still returned');
}
{
  const v = validateFormula('if(1,2)');
  assert.equal(v.ok, false, 'arity caught without env');
  assert.match(v.errors[0].error, /expects 3/);
}
{
  const v = validateFormula('true ? A : B && false');
  assert.equal(v.ok, true);
  assert.deepEqual(v.vars, ['A', 'B'], 'true/false literals excluded');
}

console.log('PASS formula eval (117 cases: arithmetic/precedence/unary/parens/cmp/logical/ternary/fns/env/errors/injection/nesting/validate)');
