// O-104/O-105 verification — design_basis + site_hazard model, entity schema
// additivity, and a render smoke of FoundationDesignBasisPanel.
//
// Tests the CANDIDATE files under .audit-work/foundation-o104-designbasis/
// (they do not live in src/ yet). Pass --src to re-point at the landed
// src/components/estimator/foundation/ paths after transport.
//
//   node scripts/test-foundation-design-basis.mjs        # candidates
//   node scripts/test-foundation-design-basis.mjs --src  # landed src/
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

let passed = 0;
const ok = async (n, fn) => { await fn(); passed++; console.log('ok', n); };

const here = path.dirname(fileURLToPath(import.meta.url));
const useSrc = process.argv.includes('--src');
const base = useSrc
  ? path.resolve(here, '../src/components/estimator/foundation')
  : path.resolve(here, '../.audit-work/foundation-o104-designbasis/candidates');
const workDir = path.resolve(here, '../.audit-work/foundation-o104-designbasis');
fs.mkdirSync(workDir, { recursive: true });

// ---------- entity schema: parses + purely additive ----------
await ok('entity jsonc parses and is purely additive', async () => {
  const cand = JSON.parse(fs.readFileSync(path.join(workDir, 'candidates/FoundationProject.jsonc'), 'utf8'));
  const remote = JSON.parse(fs.readFileSync(path.join(workDir, 'remote/base44__entities__FoundationProject.jsonc'), 'utf8'));
  const added = Object.keys(cand.properties).filter((k) => !(k in remote.properties));
  assert.deepEqual(added.sort(), ['design_basis', 'site_hazard']);
  for (const k of Object.keys(remote.properties)) {
    assert.deepEqual(cand.properties[k], remote.properties[k], `existing property ${k} must be untouched`);
  }
  assert.deepEqual(cand.required, remote.required);
  assert.deepEqual(cand.rls, remote.rls);
  // acceptance-required members
  for (const k of ['code_edition', 'jurisdiction', 'basis_captured_at', 'basis_source', 'basis_locked', 'code_edition_prior']) {
    assert.ok(k in cand.properties.design_basis.properties, `design_basis.${k}`);
  }
  for (const k of ['latitude', 'longitude', 'units', 'risk_category', 'exposure_category', 'exposure_assumption', 'input_timestamp', 'entry_method']) {
    assert.ok(k in cand.properties.site_hazard.properties, `site_hazard.${k}`);
  }
  assert.deepEqual(cand.properties.design_basis.properties.basis_source.enum, ['manual', 'official_report', 'api']);
  assert.deepEqual(cand.properties.site_hazard.properties.units.enum, ['imperial', 'metric']);
  assert.deepEqual(cand.properties.site_hazard.properties.risk_category.enum, ['I', 'II', 'III', 'IV']);
  assert.deepEqual(cand.properties.site_hazard.properties.exposure_category.enum, ['B', 'C', 'D']);
});

// ---------- model ----------
const modelOut = path.join(workDir, 'bundle-model.mjs');
esbuild.buildSync({
  entryPoints: [path.join(base, 'foundationDesignBasis.js')],
  bundle: true, format: 'esm', outfile: modelOut, logLevel: 'silent',
});
const M = await import(pathToFileURL(modelOut).href);
const { sanitizeDesignBasisWrite, sanitizeSiteHazardWrite } = M;
const T1 = '2026-01-01T12:00:00.000Z';
const T2 = '2026-01-02T12:00:00.000Z';
const T3 = '2026-01-03T12:00:00.000Z';

await ok('first capture stamps version/source/captured_at/updated_at', async () => {
  const r = sanitizeDesignBasisWrite(undefined, { code_edition: 'ASCE 7-22', jurisdiction: 'Milford, Clermont County OH', basis_source: 'manual' }, { now: T1 });
  assert.equal(r.changed, true);
  assert.equal(r.next.version, 1);
  assert.equal(r.next.code_edition, 'ASCE 7-22');
  assert.equal(r.next.jurisdiction, 'Milford, Clermont County OH');
  assert.equal(r.next.basis_source, 'manual');
  assert.equal(r.next.basis_captured_at, T1);
  assert.equal(r.next.basis_updated_at, T1);
});

await ok('empty write on absent basis is a no-op (no minted defaults)', async () => {
  const r = sanitizeDesignBasisWrite(undefined, { jurisdiction: '' }, { now: T1 });
  assert.equal(r.changed, false);
  assert.deepEqual(r.next, {});
  const r2 = sanitizeSiteHazardWrite(undefined, { units: '' }, { now: T1 });
  assert.equal(r2.changed, false);
});

await ok('identical re-write is a true no-op (no timestamp churn)', async () => {
  const cur = sanitizeDesignBasisWrite(undefined, { code_edition: 'ASCE 7-22' }, { now: T1 }).next;
  const r = sanitizeDesignBasisWrite(cur, { code_edition: 'ASCE 7-22' }, { now: T2 });
  assert.equal(r.changed, false);
  assert.equal(r.next, cur);
  assert.equal(r.next.basis_updated_at, T1, 'updated_at must not move on a no-op');
});

await ok('post-capture edition change preserves superseded edition + re-marks manual', async () => {
  const cur = sanitizeDesignBasisWrite(undefined, { code_edition: 'ASCE 7-16', basis_source: 'official_report' }, { now: T1 }).next;
  const r = sanitizeDesignBasisWrite(cur, { code_edition: 'ASCE 7-22' }, { now: T2 });
  assert.equal(r.next.code_edition, 'ASCE 7-22');
  assert.equal(r.next.code_edition_prior, 'ASCE 7-16');
  assert.equal(r.next.basis_captured_at, T1, 'captured_at immutable');
  assert.equal(r.next.basis_updated_at, T2);
  assert.equal(r.next.basis_source, 'manual', 'authored edit re-marks manual');
});

await ok('prior edition walks forward on successive changes (A->B->C)', async () => {
  const a = sanitizeDesignBasisWrite(undefined, { code_edition: 'A' }, { now: T1 }).next;
  const b = sanitizeDesignBasisWrite(a, { code_edition: 'B' }, { now: T2 }).next;
  const c = sanitizeDesignBasisWrite(b, { code_edition: 'C' }, { now: T3 }).next;
  assert.equal(c.code_edition_prior, 'B');
  assert.equal(c.code_edition, 'C');
  assert.equal(c.basis_captured_at, T1);
});

await ok('same-edition rewrite and non-edition edits do not touch prior', async () => {
  const cur = sanitizeDesignBasisWrite(undefined, { code_edition: 'ASCE 7-16' }, { now: T1 }).next;
  const r = sanitizeDesignBasisWrite(cur, { code_edition: 'ASCE 7-16', jurisdiction: 'J' }, { now: T2 });
  assert.equal('code_edition_prior' in r.next, false);
  const withPrior = sanitizeDesignBasisWrite(r.next, { code_edition: 'ASCE 7-22' }, { now: T3 }).next;
  assert.equal(withPrior.code_edition_prior, 'ASCE 7-16');
  const r2 = sanitizeDesignBasisWrite(withPrior, { basis_notes: 'amended' }, { now: T3 });
  assert.equal(r2.next.code_edition_prior, 'ASCE 7-16', 'non-edition edit preserves prior');
});

await ok('clearing edition records prior then absent (not silent)', async () => {
  const cur = sanitizeDesignBasisWrite(undefined, { code_edition: 'ASCE 7-16', jurisdiction: 'J' }, { now: T1 }).next;
  const r = sanitizeDesignBasisWrite(cur, { code_edition: '' }, { now: T2 });
  assert.equal('code_edition' in r.next, false);
  assert.equal(r.next.code_edition_prior, 'ASCE 7-16');
  assert.equal(r.next.jurisdiction, 'J');
});

await ok("reserved 'api' source is re-marked manual with an issue", async () => {
  const r = sanitizeDesignBasisWrite(undefined, { code_edition: 'X', basis_source: 'api' }, { now: T1 });
  assert.equal(r.next.basis_source, 'manual');
  assert.ok(r.issues.some((i) => i.code === 'basis_source_reserved'));
});

await ok('explicit official_report source is honored', async () => {
  const r = sanitizeDesignBasisWrite(undefined, { code_edition: 'X', basis_source: 'official_report' }, { now: T1 });
  assert.equal(r.next.basis_source, 'official_report');
  assert.equal(r.issues.length, 0);
});

await ok('lock-only write preserves recorded source', async () => {
  const cur = sanitizeDesignBasisWrite(undefined, { code_edition: 'X', basis_source: 'official_report' }, { now: T1 }).next;
  const r = sanitizeDesignBasisWrite(cur, { basis_locked: true }, { now: T2 });
  assert.equal(r.next.basis_source, 'official_report');
  assert.equal(r.next.basis_locked, true);
});

await ok('locked basis rejects content edits and unlock until confirmed', async () => {
  const cur = sanitizeDesignBasisWrite(undefined, { code_edition: 'X', basis_locked: true }, { now: T1 }).next;
  const r1 = sanitizeDesignBasisWrite(cur, { jurisdiction: 'J' }, { now: T2 });
  assert.equal(r1.rejected, 'basis_locked');
  const r2 = sanitizeDesignBasisWrite(cur, { basis_locked: false }, { now: T2 });
  assert.equal(r2.rejected, 'basis_locked', 'unlock itself is gated');
  const r3 = sanitizeDesignBasisWrite(cur, { basis_locked: false }, { now: T2, confirmed: true });
  assert.equal(r3.changed, true);
  assert.equal('basis_locked' in r3.next, false);
  const r4 = sanitizeDesignBasisWrite(cur, { jurisdiction: 'J' }, { now: T2, confirmed: true });
  assert.equal(r4.next.jurisdiction, 'J');
});

await ok('lock on a contentless block is stripped with an issue', async () => {
  const r = sanitizeDesignBasisWrite(undefined, { basis_locked: true }, { now: T1 });
  assert.equal(r.changed, false, 'nothing to lock -> no-op');
  assert.ok(r.issues.some((i) => i.code === 'basis_lock_nothing'));
});

await ok('clearing all content reduces to store-null (explicit clear)', async () => {
  const cur = sanitizeDesignBasisWrite(undefined, { jurisdiction: 'J' }, { now: T1 }).next;
  const r = sanitizeDesignBasisWrite(cur, { jurisdiction: '', code_edition_prior: '' }, { now: T2 });
  assert.equal(r.next, undefined);
  assert.equal(r.changed, true);
});

await ok('malformed current block tolerated (treated as absent)', async () => {
  const r = sanitizeDesignBasisWrite('garbage', { code_edition: 'X' }, { now: T1 });
  assert.equal(r.next.code_edition, 'X');
  assert.equal(r.next.basis_captured_at, T1);
});

// ---------- site_hazard ----------
await ok('hazard: coords/units/risk/exposure/assumption stamp provenance + ts', async () => {
  const r = sanitizeSiteHazardWrite(undefined, {
    latitude: 39.1031, longitude: -84.2046, units: 'imperial',
    risk_category: 'II', exposure_category: 'C', exposure_assumption: 'open terrain',
  }, { now: T1 });
  assert.equal(r.changed, true);
  assert.equal(r.next.latitude, 39.1031);
  assert.equal(r.next.longitude, -84.2046);
  assert.equal(r.next.units, 'imperial');
  assert.equal(r.next.risk_category, 'II');
  assert.equal(r.next.exposure_category, 'C');
  assert.equal(r.next.entry_method, 'manual', 'authored write -> manual provenance');
  assert.equal(r.next.input_timestamp, T1);
  assert.equal(r.next.version, 1);
});

await ok('hazard: empty coord commits explicit null, never zero', async () => {
  const r = sanitizeSiteHazardWrite(undefined, { latitude: '', longitude: null }, { now: T1 });
  assert.equal(r.next.latitude, null);
  assert.equal(r.next.longitude, null);
  const r2 = sanitizeSiteHazardWrite(r.next, { latitude: '' }, { now: T2 });
  assert.equal(r2.changed, false, 'null->null is a no-op');
});

await ok('hazard: out-of-range/non-finite coords rejected, prior value kept', async () => {
  const cur = sanitizeSiteHazardWrite(undefined, { latitude: 39.1, longitude: -84.2 }, { now: T1 }).next;
  const r = sanitizeSiteHazardWrite(cur, { latitude: 91, longitude: 'east' }, { now: T2 });
  assert.equal(r.next.latitude, 39.1);
  assert.equal(r.next.longitude, -84.2);
  assert.equal(r.issues.length, 2);
  assert.ok(r.issues.some((i) => i.code === 'latitude_invalid'));
  assert.ok(r.issues.some((i) => i.code === 'longitude_invalid'));
});

await ok('hazard: out-of-enum values rejected, valid values recorded', async () => {
  const r = sanitizeSiteHazardWrite(undefined, { units: 'parsecs', risk_category: 'V', exposure_category: 'E' }, { now: T1 });
  assert.equal('units' in r.next, false);
  assert.equal('risk_category' in r.next, false);
  assert.equal('exposure_category' in r.next, false);
  assert.equal(r.issues.length, 3);
  const r2 = sanitizeSiteHazardWrite(undefined, { units: 'metric', risk_category: 'IV', exposure_category: 'D' }, { now: T1 });
  assert.equal(r2.next.units, 'metric');
  assert.equal(r2.next.risk_category, 'IV');
  assert.equal(r2.next.exposure_category, 'D');
});

await ok("hazard: reserved 'api' entry_method re-marked manual; official_report honored", async () => {
  const r = sanitizeSiteHazardWrite(undefined, { units: 'imperial', entry_method: 'api' }, { now: T1 });
  assert.equal(r.next.entry_method, 'manual');
  assert.ok(r.issues.some((i) => i.code === 'entry_method_reserved'));
  const r2 = sanitizeSiteHazardWrite(undefined, { units: 'imperial', entry_method: 'official_report' }, { now: T1 });
  assert.equal(r2.next.entry_method, 'official_report');
});

await ok('hazard: clearing all content reduces to store-null', async () => {
  const cur = sanitizeSiteHazardWrite(undefined, { units: 'imperial' }, { now: T1 }).next;
  const r = sanitizeSiteHazardWrite(cur, { units: '' }, { now: T2 });
  assert.equal(r.next, undefined);
  assert.equal(r.changed, true);
});

await ok('hazard: non-object current tolerated', async () => {
  const r = sanitizeSiteHazardWrite(42, { risk_category: 'I' }, { now: T1 });
  assert.equal(r.next.risk_category, 'I');
});

// ---------- JSX syntax ----------
await ok('panel + rates panel candidates compile (esbuild jsx)', async () => {
  for (const f of ['FoundationDesignBasisPanel.jsx', 'FoundationRatesPanel.jsx']) {
    esbuild.buildSync({
      entryPoints: [path.join(base, f)],
      bundle: true, format: 'esm', write: false, logLevel: 'silent',
      loader: { '.js': 'jsx', '.jsx': 'jsx' },
      external: ['react', 'react-dom', 'lucide-react', '@/components/ui/*', './foundationDesignBasis'],
    });
  }
});

// ---------- render smoke ----------
const STUBS = {
  'lucide-react': `export const Landmark=()=>null;export const Lock=()=>null;export const LockOpen=()=>null;export const MapPin=()=>null;`,
  '@/components/ui/input': `import React from 'react';export const Input=React.forwardRef((p,ref)=>React.createElement('input',{...p,ref}));`,
};
const plugin = {
  name: 'stubs',
  setup(b) {
    b.onResolve({ filter: /.*/ }, (a) => (STUBS[a.path] ? { path: a.path, namespace: 'stub' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' }));
  },
};
const bundle = async (entry, out) => {
  const r = await esbuild.build({
    entryPoints: [path.join(base, entry)], bundle: true, format: 'esm', platform: 'node',
    write: false, plugins: [plugin], loader: { '.js': 'jsx', '.jsx': 'jsx' },
    external: ['react', 'react-dom', 'react-test-renderer'],
  });
  fs.writeFileSync(out, r.outputFiles[0].text);
  return import(pathToFileURL(path.resolve(out)).href);
};

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = { confirm: () => true };

await ok('render smoke: binds round-trip on empty + populated + locked projects', async () => {
  const mod = await bundle('FoundationDesignBasisPanel.jsx', path.join(workDir, 'bundle-panel.mjs'));
  const Panel = mod.default;

  // empty project -> capture prompts, no crash
  let changes = [];
  let tr;
  await act(async () => {
    tr = TestRenderer.create(React.createElement(Panel, { project: {}, onChange: (c) => changes.push(c) }));
  });
  const txt = JSON.stringify(tr.toJSON());
  assert.ok(txt.includes('No basis captured yet'));
  assert.ok(txt.includes('No site/hazard inputs recorded yet'));

  // fire exposure_category select -> site_hazard patch with provenance
  const selects = tr.root.findAllByType('select');
  const optionValues = (s) => React.Children.toArray(s.props.children).map((c) => c?.props?.value);
  const exposure = selects.find((s) => optionValues(s).includes('C'));
  assert.ok(exposure, 'exposure select found');
  await act(async () => { exposure.props.onChange({ target: { value: 'C' } }); });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].site_hazard.exposure_category, 'C');
  assert.equal(changes[0].site_hazard.entry_method, 'manual');
  assert.equal(changes[0].site_hazard.version, 1);
  assert.ok(typeof changes[0].site_hazard.input_timestamp === 'string');

  // edition field: draft then blur -> design_basis patch
  const inputs = tr.root.findAllByType('input');
  const edition = inputs.find((i) => i.props.list === 'foundation-code-editions');
  assert.ok(edition, 'edition input found');
  await act(async () => { edition.props.onChange({ target: { value: 'ASCE 7-22' } }); });
  await act(async () => { edition.props.onBlur(); });
  const last = changes[changes.length - 1];
  assert.equal(last.design_basis.code_edition, 'ASCE 7-22');
  assert.equal(last.design_basis.basis_source, 'manual');
  assert.equal(last.design_basis.version, 1);
  assert.ok(typeof last.design_basis.basis_captured_at === 'string');

  // populated + locked project -> gated until confirm arms
  const lockedProject = {
    id: 'p1',
    design_basis: {
      version: 1, code_edition: 'ASCE 7-16', jurisdiction: 'Milford OH',
      basis_source: 'official_report', basis_captured_at: '2026-01-01T00:00:00.000Z',
      basis_updated_at: '2026-01-01T00:00:00.000Z', basis_locked: true,
    },
    site_hazard: { version: 1, latitude: 39.1, longitude: null, units: 'imperial', risk_category: 'II', entry_method: 'manual', input_timestamp: '2026-01-01T00:00:00.000Z' },
  };
  changes = [];
  let tr2;
  await act(async () => {
    tr2 = TestRenderer.create(React.createElement(Panel, { project: lockedProject, onChange: (c) => changes.push(c) }));
  });
  const txt2 = JSON.stringify(tr2.toJSON());
  assert.ok(txt2.includes('Basis locked'));
  assert.ok(txt2.includes('Change basis'));
  const lockedEdition = tr2.root.findAllByType('input').find((i) => i.props.list === 'foundation-code-editions');
  assert.equal(lockedEdition.props.disabled, true, 'locked basis disables edition input');
  // arm via the change-basis button
  const btn = tr2.root.findAllByType('button').find((b) => String(b.props.children).includes('Change basis'));
  await act(async () => { btn.props.onClick(); });
  const armedEdition = tr2.root.findAllByType('input').find((i) => i.props.list === 'foundation-code-editions');
  assert.equal(armedEdition.props.disabled, false, 'armed basis enables edition input');
  // jurisdiction edit after arming lands a patch
  const jur = tr2.root.findAllByType('input').find((i) => typeof i.props.placeholder === 'string' && i.props.placeholder.includes('Milford'));
  await act(async () => { jur.props.onChange({ target: { value: 'New Jurisdiction' } }); });
  const jurPatch = changes[changes.length - 1];
  assert.equal(jurPatch.design_basis.jurisdiction, 'New Jurisdiction');
  assert.equal(jurPatch.design_basis.basis_source, 'manual', 'edit after capture re-marks manual');
  // hazard latitude input shows recorded value
  const lat = tr2.root.findAllByType('input').find((i) => i.props.inputMode === 'decimal');
  assert.equal(lat.props.value, '39.1');
});

console.log(`PASS foundation-design-basis (${passed} groups)`);
