// O-093 (CMP-H02) model verification — feet/inches parser matrix, formatter,
// draft boundary, input issue, and the field-meta map. Pure-Node: esbuild
// bundles the candidate modules (React/UI imports stubbed — the component is
// never invoked here; browser harness covers it).
import esbuild from 'esbuild';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SRC = `${here}/candidates`;

const stub = {
  name: 'stub',
  setup(b) {
    b.onResolve({ filter: /^@\/components\/ui\/input$/ }, () => ({ path: 'input-stub', namespace: 'stub' }));
    b.onResolve({ filter: /^react$/ }, () => ({ path: 'react-stub', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({
      contents: a.path === 'react-stub'
        ? 'export const useState = (v) => [v, () => {}]; export const useId = () => "t1"; export const createElement = () => null;'
        : 'export const Input = () => null; export default Input;',
      loader: 'js',
    }));
  },
};

const built = await esbuild.build({
  entryPoints: [`${SRC}/foundationFtInEntry.js`, `${SRC}/foundationGeometryInputs.js`],
  bundle: true, format: 'esm', platform: 'node', write: false, outdir: 'out',
  plugins: [stub], loader: { '.js': 'js' },
});
const outDir = `${here}/verify/out`;
fs.mkdirSync(outDir, { recursive: true });
for (const f of built.outputFiles) fs.writeFileSync(path.join(outDir, path.basename(f.path)), f.text);
const { pathToFileURL } = await import('node:url');
const ft = await import(pathToFileURL(path.join(outDir, 'foundationFtInEntry.js')).href);
const gi = await import(pathToFileURL(path.join(outDir, 'foundationGeometryInputs.js')).href);

const {
  parseFoundationDimension, formatFoundationDimension, foundationDimensionDraftValue,
  foundationDimensionStoredText, foundationDimensionInputIssue, FOUNDATION_DIMENSION_FORMAT_HELP,
} = ft;
const { FOUNDATION_DIMENSION_FIELDS, foundationDimensionFieldMeta } = gi;

const results = [];
const T = (name, fn) => {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, error: String(e.message) }); }
};
const ok = (input, inches) => T(`parse ${JSON.stringify(input)} → ${inches}`, () => {
  const p = parseFoundationDimension(input);
  assert.equal(p.ok, true, `expected ok for ${JSON.stringify(input)}: ${JSON.stringify(p)}`);
  assert.equal(p.inches, inches);
});
const bad = (input) => T(`reject ${JSON.stringify(input)}`, () => {
  const p = parseFoundationDimension(input);
  assert.equal(p.ok, false, `expected reject for ${JSON.stringify(input)}, got ${JSON.stringify(p)}`);
});

// ── required accepted forms ─────────────────────────────────────────────
ok("12' 6\"", 150); ok("12'-6\"", 150); ok("12.5'", 150); ok('150"', 150);
ok('12 6', 150); ok("12'6", 150);
// plain + marked inches
ok('150', 150); ok('12', 12); ok('12.5', 12.5); ok('6', 6); ok('6.5', 6.5);
ok('0.375', 0.375); ok('.5', 0.5); ok('12.', 12); ok('0', 0);
// feet forms
ok("12'", 144); ok("6'", 72); ok("0'", 0); ok("0.5'", 6); ok("1/2'", 6);
ok("12.5' 6\"", 156);
// feet+inches variants
ok("12'6\"", 150); ok("12' 6", 150); ok("6'3\"", 75); ok("12'0\"", 144);
ok('12 6"', 150); ok('12-6"', 150); ok('12.5 6', 156);
// fractions in the inches position
ok('3/8"', 0.375); ok('3/8', 0.375); ok('1/2', 0.5); ok('6 1/2"', 6.5);
ok('6 1/2', 6.5); ok('1 1/2', 1.5); ok('12 1/2', 12.5); ok('12 6 1/2', 150.5);
ok("12' 6 1/2\"", 150.5); ok('1/4"', 0.25);
// inch-marked pairs
ok('6-1/2"', 6.5);                    // handwritten mixed inch, not a feet pair
// signs (offset fields are signed)
ok('-27', -27); ok("-4'", -48); ok('-12 6', -150); ok('+150', 150); ok('-12-6"', -150);
// tolerant spacing / mark variants
ok(' 12 \' 6 "', 150); ok("12' 6 ", 150); ok('12′ 6″', 150); ok('12’6”', 150);
ok("12'- 6\"", 150);
// unclamped inch part (authored sum — documented)
ok("12' 13\"", 157); ok("0' 24\"", 24);
// number passthrough
ok(150, 150); ok(-48, -48); ok(0.375, 0.375);
// big values stay finite-parseable; range checks live in calc layers
ok("9999'", 119988);

// ── rejects (ok:false → draft stays verbatim → inline issue) ───────────
for (const v of ['', '   ', 'abc', '12abc', 'abc12', '1e3', '1,2', '12..5',
  '5/0', '6 5/0', '1/2/3', "'", "''", '"', '12\'6"7', "12'6'", '12 6 7',
  '12 6 7 8', '12-6', '-', '+', '--5', '12 -6', '6"5', "'6", "12' '6",
  'Infinity', 'NaN', '12x6', '-12-6', 'e', '/', '1/', '/2', '  -  ',
  "12'-'", null, undefined, {}, [], NaN, Infinity, -Infinity]) {
  bad(v);
}
// `12'-` alone: feet + bare separator = authored 12' → 144 (mid-typing dash is
// a draft-only state; commits canonical feet). `12'-'` closes with a second
// mark → ambiguous, rejected. Documented acceptance.
ok("12'-", 144); bad("12'-'");

// ── formatter ───────────────────────────────────────────────────────────
const fmt = [
  [150, `12' 6"`], [144, `12'`], [12, `1'`], [6.5, `6.5"`], [0.375, `0.375"`],
  [0, `0"`], [-27, `-2' 3"`], [-6, `-6"`], [150.5, `12' 6.5"`], [120, `10'`],
  [24, `2'`], [119988, `9999'`], [1, `1"`], [13, `1' 1"`], [157, `13' 1"`],
];
for (const [n, s] of fmt) T(`format ${n} → ${JSON.stringify(s)}`, () => {
  assert.equal(formatFoundationDimension(n), s);
});
T('format rejects non-finite', () => {
  assert.equal(formatFoundationDimension(NaN), '');
  assert.equal(formatFoundationDimension('abc'), '');
});

// ── write-side draft boundary (verbatim contract) ───────────────────────
T('draft boundary', () => {
  assert.equal(foundationDimensionDraftValue(''), '');
  assert.equal(foundationDimensionDraftValue('   '), '');
  assert.equal(foundationDimensionDraftValue('150'), 150);
  assert.equal(foundationDimensionDraftValue("12'6"), 150);
  assert.equal(foundationDimensionDraftValue('12 6'), 150);
  assert.equal(foundationDimensionDraftValue('abc'), 'abc');
  assert.equal(foundationDimensionDraftValue('12x6'), '12x6');
  assert.equal(foundationDimensionDraftValue(96), 96);          // passthrough
  // parity with inventoryDraftInput on every plain-numeric draft
  assert.equal(foundationDimensionDraftValue('12.5'), 12.5);
  assert.equal(foundationDimensionDraftValue('-3'), -3);
});

// ── stored → display text ───────────────────────────────────────────────
T('stored display', () => {
  assert.equal(foundationDimensionStoredText(150), `12' 6"`);
  assert.equal(foundationDimensionStoredText(0.375), `0.375"`);
  assert.equal(foundationDimensionStoredText('abc'), 'abc');   // verbatim echo
  assert.equal(foundationDimensionStoredText(''), '');
  assert.equal(foundationDimensionStoredText(null), '');
  assert.equal(foundationDimensionStoredText(undefined), '');
});

// ── inline issue text ───────────────────────────────────────────────────
T('input issue', () => {
  assert.match(foundationDimensionInputIssue('abc'), /Not a recognized measurement/);
  assert.match(foundationDimensionInputIssue('abc'), /12' 6/);
  assert.equal(foundationDimensionInputIssue(''), null);
  assert.equal(foundationDimensionInputIssue('   '), null);
  assert.equal(foundationDimensionInputIssue(150), null);
  assert.equal(foundationDimensionInputIssue(null), null);
  assert.match(FOUNDATION_DIMENSION_FORMAT_HELP, /feet\/inches/);
});

// ── field meta map ──────────────────────────────────────────────────────
T('field meta map integrity', () => {
  const sections = ['foundation', 'pole', 'wall', 'wallCap', 'cabinet', 'wallOutline', 'landscape'];
  assert.deepEqual(Object.keys(FOUNDATION_DIMENSION_FIELDS), sections);
  for (const s of sections) {
    for (const [field, meta] of Object.entries(FOUNDATION_DIMENSION_FIELDS[s])) {
      assert.ok(meta.label && meta.label.length >= 3, `${s}.${field} label`);
      assert.ok(meta.help && meta.help.length >= 20, `${s}.${field} help`);
      assert.ok(typeof meta.placeholder === 'string' && meta.placeholder.length > 0, `${s}.${field} placeholder`);
      assert.equal(meta.unit, 'inches', `${s}.${field} unit`);
      assert.equal(meta.ftIn, true, `${s}.${field} ftIn`);
      assert.equal(typeof meta.signed, 'boolean', `${s}.${field} signed`);
      // every placeholder is itself a valid entry (except pure-inch 0"/12" forms — still parse)
      const p = parseFoundationDimension(meta.placeholder);
      assert.equal(p.ok, true, `${s}.${field} placeholder parses: ${meta.placeholder}`);
    }
  }
  assert.equal(FOUNDATION_DIMENSION_FIELDS.foundation.grade_offset_inches.signed, true);
  assert.ok(Object.isFrozen(FOUNDATION_DIMENSION_FIELDS));
});
T('field meta resolver fail-closed', () => {
  assert.equal(foundationDimensionFieldMeta('pole', 'height_inches').label, 'Height above grade (in)');
  assert.equal(foundationDimensionFieldMeta('nope', 'x'), null);
  assert.equal(foundationDimensionFieldMeta('pole', 'nope'), null);
  assert.equal(foundationDimensionFieldMeta(), null);
});
T('prior exports untouched', () => {
  assert.equal(typeof gi.foundationInputNumber, 'function');
  assert.equal(typeof gi.foundationPositiveWholeNumber, 'function');
  assert.equal(typeof gi.foundationGeometryValidation, 'function');
  assert.equal(typeof gi.foundationItemGeometryIssues, 'function');
  const v = gi.foundationGeometryValidation({ foundation_type: 'spread_foot', quantity: 1, length_inches: 48, width_inches: 48, depth_inches: 36 });
  assert.equal(v.issues.length, 0);
  const bad = gi.foundationGeometryValidation({ foundation_type: 'pillar', quantity: 1, diameter: "12'6", depth_inches: 36 });
  assert.equal(bad.issues.some((i) => i.field === 'diameter'), true); // verbatim string still flagged — unchanged behavior
});

const fails = results.filter((r) => !r.ok);
console.log(`${results.length - fails.length}/${results.length} model assertions passed`);
for (const f of fails) console.log('FAIL', f.name, '—', f.error);
fs.writeFileSync(`${here}/verify/o093-model-results.json`, JSON.stringify({ results, pass: results.length - fails.length, total: results.length }, null, 1));
if (fails.length) { console.log('FAIL model'); process.exit(1); }
console.log('PASS o093-model');
