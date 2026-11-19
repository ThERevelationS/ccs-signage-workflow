const fs = require('fs');
const p = 'scripts/test-foundation-template.mjs';
const raw = fs.readFileSync(p, 'utf8'); const crlf = raw.includes('\r\n'); let t = raw.replace(/\r\n/g, '\n');
const once = (a, b) => { const n = t.split(a).length - 1; if (n !== 1) throw new Error(`anchor x${n}: ${a.slice(0, 70)}`); t = t.replace(a, () => b); };
once("const model = await import('../src/components/estimator/foundation/foundationTemplateModel.js');",
`const model = await import('../src/components/estimator/foundation/foundationTemplateModel.js');
const presetMod = await mk('src/components/estimator/foundation/foundationAssemblyPresets.js', '.audit-work/foundation-template05/presets.bundle.mjs');
const { FOUNDATION_ASSEMBLY_PRESETS, foundationAssemblyPresetTemplateData } = presetMod;`);
once(`  const btn = (label) => c.root.findAll(el => el?.props?.children === label).map(el => el.props);
  return { c, alerts, btn,`,
`  const btn = (label) => c.root.findAll(el => el?.props?.children === label).map(el => el.props);
  // The load view lists O-094 assembly presets first, then saved templates;
  // Apply lookups are scoped to their section so the two lists never mix.
  const section = (heading) => c.root.findAll(el => el.type === 'div' && (el.children || []).some(ch => ch?.type === 'p'
    && (Array.isArray(ch.props?.children) ? ch.props.children : [ch.props?.children]).includes(heading)));
  const inSection = (heading, label) => section(heading).flatMap(s => s.findAll(el => el?.props?.children === label).map(el => el.props));
  const tplBtn = (label) => inSection('Saved templates', label);
  const presetBtn = (label) => inSection('Start from an assembly preset', label);
  return { c, alerts, btn, tplBtn, presetBtn,`);
const before = (t.match(/\b(m|mL2|m2)\.btn\('Apply'\)/g) || []).length;
t = t.replace(/\b(m|mL2|m2)\.btn\('Apply'\)/g, "$1.tplBtn('Apply')");
const anchor = "await ok('dialog: apply rejection stays open; apply success closes'";
once(anchor, `await ok('dialog: O-094 assembly presets listed; apply rides onApply with the exact preset template data', async () => {
  assert.ok(FOUNDATION_ASSEMBLY_PRESETS.length >= 1, 'preset catalog is non-empty');
  let got = null; globalThis.__closed = false;
  const m = await mountDlg({ rows: [{ id: 't1', template_name: 'A', project_data: { items: [] } }], onApply: (data) => { got = data; return true; } });
  assert.equal(m.presetBtn('Apply').length, FOUNDATION_ASSEMBLY_PRESETS.length, 'one Apply per preset');
  assert.equal(m.tplBtn('Apply').length, 1, 'saved-template rows listed separately');
  await act(async () => { m.presetBtn('Apply')[0].onClick(); });
  assert.deepEqual(got, foundationAssemblyPresetTemplateData(FOUNDATION_ASSEMBLY_PRESETS[0]), 'exact preset data');
  assert.equal(globalThis.__closed, true, 'accepted preset closes');
  globalThis.__closed = false;
  const r = await mountDlg({ onApply: () => false });
  await act(async () => { r.presetBtn('Apply')[0].onClick(); });
  assert.equal(globalThis.__closed, false, 'rejected preset keeps dialog open');
  assert.ok(r.alerts().length >= 1, 'rejection surfaced');
  await m.cleanup(); await r.cleanup();
});

await ok('dialog: save is blocked with the page-supplied reason while pricing is unavailable', async () => {
  let calls = 0; globalThis.__tplSave = () => { calls++; return Promise.resolve({ id: 't1' }); };
  const m = await mountDlg({ mode: 'save', saveDisabled: true, saveDisabledReason: 'Pricing unavailable: test reason' });
  const reason = m.c.root.findAll(el => el.type === 'p' && el.props?.children === 'Pricing unavailable: test reason');
  assert.equal(reason.length, 1, 'reason rendered');
  const save = m.btn('Save Template')[0];
  assert.equal(save.disabled, true, 'Save Template disabled');
  await act(async () => { await save.onClick?.(); });
  assert.equal(calls, 0, 'no save request while disabled');
  await m.cleanup();
});

${anchor}`);
fs.writeFileSync(p, crlf ? t.replace(/\n/g, '\r\n') : t);
console.log('retargeted template Apply lookups:', before);
