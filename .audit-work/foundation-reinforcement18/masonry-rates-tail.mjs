const results = [];
const check = async (id, fn) => {
  try { await fn(); results.push({ id, ok: true }); console.log("ok " + id); }
  catch (e) { results.push({ id, ok: false, error: String(e.stack || e).slice(0, 1500) }); console.log("FAIL " + id + " :: " + String(e.message || e).slice(0, 400)); }
};

const caseWall = (c) => { const w = seedWall(); Object.assign(w, c.wallPatch || {}); return w; };
const caseInv = (c) => { const inv = seedInv(); if (c.outerMaterialPatch) Object.assign(inv[0], c.outerMaterialPatch); return inv.concat(c.additionalInventory || []); };
for (const tc of SPEC.cases) {
  await check(tc.id, async () => {
    const c = await mount({ project: makeProject([caseWall(tc)]), inventory: caseInv(tc), settings: tc.settings });
    try {
      assert.equal(spyCount("saveSource"), 0); assert.equal(spyCount("recordBuilderSave"), 0);
      assert.equal(totalsPanel(c).props.pricingUnavailable, false, "pricingUnavailable false");
      const w = wallsPanel(c).props.walls[0];
      for (const [k, v] of Object.entries(tc.expectedCosts)) assert.deepEqual(w.calculatedCosts?.[k], v, "field " + k);
      await editName(c);
      const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
      let r; await act(async () => { r = await onSave(); await flush(); });
      assert.equal(r?.status, "saved", "save succeeds: " + JSON.stringify(r?.error?.message || r?.error).slice(0, 200));
      assert.equal(spyCount("saveSource"), 1); assert.equal(spyCount("recordBuilderSave"), 1);
      const call = globalThis.__spies.find((x) => x[0] === "saveSource")[1];
      assert.equal(call.query.updated_date, SPEC.sourceVersion, "expectedUpdatedAt");
      const saved = call.patch.$set.walls[0];
      assert.equal(saved.component_id, "synthetic-wall");
      assert.deepEqual(saved.shape?.segments?.length, (tc.wallPatch?.shape || seedWall().shape).segments.length, "authored shape");
      for (const [k, v] of Object.entries(tc.expectedCosts)) assert.deepEqual(saved.calculatedCosts?.[k], v, "persisted " + k);
      assert.equal(globalThis.__project.updated_date, SPEC.savedVersion, "v2");
    } finally { await unmountAll(c); }
  });
}

assert.equal(globalThis.__unexpectedNetwork, 0, "unexpected network access");
assert.equal(globalThis.__unexpectedSdk, 0, "unexpected SDK access");
const okCount = results.filter((r) => r.ok).length;
fs.writeFileSync(DIR + "masonry-rates-page-verification.json", JSON.stringify({ results, unexpectedNetwork: globalThis.__unexpectedNetwork, unexpectedSdk: globalThis.__unexpectedSdk }, null, 2));
console.log("masonry-rates-page passed=" + okCount + " failed=" + (results.length - okCount));
if (okCount !== results.length) process.exit(1);
