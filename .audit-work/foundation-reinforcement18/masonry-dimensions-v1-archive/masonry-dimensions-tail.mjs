const innerFixture = JSON.parse(fs.readFileSync(DIR + SPEC.innerFixtureArtifact, "utf8"))
  .rows.find((r) => r.name === SPEC.innerFixtureRowName).fixture;
const innerProject = () => {
  const w = { ...JSON.parse(JSON.stringify(innerFixture.project.walls[0])) };
  return makeProject([w]);
};
const materialSelect = (c, aria) => {
  const els = c.root.findAll((el) => el.type === "select" && el.props?.["aria-label"] === aria);
  return els.length ? els[0] : null;
};
const ratesSettings = (c, expected) => {
  const el = elByType(c, "FoundationRatesPanel");
  assert.ok(el.length, "FoundationRatesPanel mounted");
  for (const [k, v] of Object.entries(expected)) assert.deepEqual(el[0].props.settings[k], v, "rates settings " + k);
};
const BLOCKED_MSG = SPEC.blockedSaveMessage;
const ZERO_WRITE_KINDS = ["saveSource", "recordBuilderSave", "pricing", "ensureIdempotent", "estimateWrite", "partGroup", "converter"];
const zeroWrites = () => { for (const k of ZERO_WRITE_KINDS) assert.equal(spyCount(k), 0, "zero " + k); };
const results = [];
const proof = [];
const check = async (id, fn) => {
  try { await fn(); results.push({ id, ok: true }); console.log("ok " + id); }
  catch (e) { results.push({ id, ok: false, error: String(e.stack || e).slice(0, 1500) }); console.log("FAIL " + id + " :: " + String(e.message || e).slice(0, 400)); }
};
const capture = (c, extra = {}) => proof.push({
  ...extra,
  rawDraft: JSON.parse(JSON.stringify(globalThis.__seenProject ?? null)),
  acknowledged: JSON.parse(JSON.stringify(globalThis.__project)),
  renderedWalls: wallsPanel(c).props.walls.map((w) => ({ component_id: w.component_id, heightInches: w.heightInches, materialId: w.materialId, internalMaterialId: w.internalMaterialId, calculatedCosts: w.calculatedCosts })),
  totals: JSON.parse(JSON.stringify(totalsPanel(c).props.totals)),
  pricingUnavailable: totalsPanel(c).props.pricingUnavailable,
  spies: JSON.parse(JSON.stringify(globalThis.__spies)),
});
const invIssues = (inv) => foundationAssemblyCatalogIssues(globalThis.__seenProject, inv);

// case 1 — missing outer unit length holds acknowledged, not guessed
await check("missing-outer-unit-length-holds-acknowledged-not-guessed", async () => {
  const inv = seedInv(); delete inv[0].wall_unit_length_inches;
  const c = await mount({ project: makeProject([seedWall()]), inventory: inv });
  try {
    ratesSettings(c, seed.settings);
    const authoredShape = JSON.parse(JSON.stringify(globalThis.__seenProject.walls[0].shape));
    await editName(c);
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.baselineSnapshot);
    assert.ok(invIssues(inv).some((i) => i.code === "wall_unit_length_inches_unavailable" && i.field === "materialId"), "outer length issue");
    assert.deepEqual(globalThis.__seenProject.walls[0].shape, authoredShape);
    assert.equal(totalsPanel(c).props.pricingUnavailable, true);
    let r; const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    capture(c, { caseId: "missing-outer-unit-length-holds-acknowledged-not-guessed", saveOutcome: { status: r?.status, error: r?.error?.message } });
  } finally { await unmountAll(c); }
});

// case 2 — zero outer unit height is not a default
await check("zero-outer-unit-height-is-not-a-default", async () => {
  const inv = seedInv(); inv[0].wall_unit_height_inches = 0;
  const c = await mount({ project: makeProject([seedWall()]), inventory: inv });
  try {
    ratesSettings(c, seed.settings);
    const authoredShape = JSON.parse(JSON.stringify(globalThis.__seenProject.walls[0].shape));
    await editName(c);
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.baselineSnapshot);
    assert.ok(invIssues(inv).some((i) => i.code === "wall_unit_height_inches_unavailable" && i.field === "materialId"), "outer height issue");
    assert.deepEqual(globalThis.__seenProject.walls[0].shape, authoredShape);
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    capture(c, { caseId: "zero-outer-unit-height-is-not-a-default", saveOutcome: { status: r?.status, error: r?.error?.message } });
  } finally { await unmountAll(c); }
});

// case 3 — unknown internal unit width holds entire wall vector
await check("unknown-internal-unit-width-holds-entire-wall-vector", async () => {
  const inv = JSON.parse(JSON.stringify(innerFixture.inventory));
  const innerRow = inv.find((i) => i.id === "synthetic-inner");
  innerRow.wall_unit_width_inches = null;
  const c = await mount({ project: innerProject(), inventory: inv, settings: innerFixture.settings });
  try {
    ratesSettings(c, innerFixture.settings);
    const authoredShape = JSON.parse(JSON.stringify(globalThis.__seenProject.walls[0].shape));
    await editName(c);
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.baselineSnapshot);
    assert.ok(invIssues(inv).some((i) => i.code === "wall_unit_width_inches_unavailable" && i.field === "internalMaterialId"), "inner width issue");
    assert.deepEqual(globalThis.__seenProject.walls[0].shape, authoredShape);
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    capture(c, { caseId: "unknown-internal-unit-width-holds-entire-wall-vector", saveOutcome: { status: r?.status, error: r?.error?.message } });
  } finally { await unmountAll(c); }
});

// case 4 — new invalid unit dimensions cannot adopt rendered history
await check("new-invalid-unit-dimensions-cannot-adopt-rendered-history", async () => {
  const inv = seedInv(); inv[0].wall_unit_length_inches = "";
  const c = await mount({ project: makeProject([]), inventory: inv });
  try {
    ratesSettings(c, seed.settings);
    const panel = wallsPanel(c);
    const newWall = { ...seedWall(), component_id: "masonry-new-dimensions",
      calculatedCosts: { ...SPEC.validCurrentSnapshotFields } };
    const expectedShape = JSON.parse(JSON.stringify(newWall.shape));
    await act(async () => { panel.props.onChange([newWall]); });
    assert.deepEqual(globalThis.__seenProject.walls[0].shape, expectedShape);
    assert.deepEqual(wallsPanel(c).props.walls[0].calculatedCosts, {}, "rendered fields cannot persist");
    const totals = totalsPanel(c).props.totals;
    assert.equal(totals.total_wall_cost, null); assert.equal(totals.total_brick_cost, null);
    assert.equal(totals.grand_total, null);
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    capture(c, { caseId: "new-invalid-unit-dimensions-cannot-adopt-rendered-history", saveOutcome: { status: r?.status, error: r?.error?.message } });
  } finally { await unmountAll(c); }
});

// case 5 — numeric-string unit dims save + establish new acknowledged basis
await check("numeric-string-unit-dimensions-save-and-establish-new-acknowledged-basis", async () => {
  const inv = seedInv();
  for (const k of ["wall_unit_length_inches", "wall_unit_width_inches", "wall_unit_height_inches"])
    inv[0][k] = String(inv[0][k]);
  inv.push({ ...JSON.parse(JSON.stringify(inv[0])), id: SPEC.badMaterialId, material_name: SPEC.badMaterialName, ...SPEC.badMaterialPatch });
  const c = await mount({ project: makeProject([seedWall()]), inventory: inv });
  try {
    ratesSettings(c, seed.settings);
    const authoredShape = JSON.parse(JSON.stringify(globalThis.__seenProject.walls[0].shape));
    const authoredMatId = globalThis.__seenProject.walls[0].materialId;
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.validCurrentSnapshotFields);
    await editName(c);
    let r; const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
    await act(async () => { r = await onSave(); await flush(); });
    assert.equal(r?.status, "saved", "save " + JSON.stringify(r?.error?.message || "").slice(0, 120));
    assert.equal(spyCount("saveSource"), 1); assert.equal(spyCount("recordBuilderSave"), 1);
    const call = globalThis.__spies.find((x) => x[0] === "saveSource")[1];
    assert.equal(call.query.updated_date, SPEC.sourceVersion);
    const savedWall = call.patch.$set.walls[0];
    assert.equal(savedWall.component_id, "synthetic-wall");
    assert.equal(savedWall.heightInches, 9, "numeric 9 height");
    assert.equal(savedWall.materialId, authoredMatId, "raw material id unchanged");
    assert.deepEqual(savedWall.shape, authoredShape, "CAS shape unchanged");
    fieldSubset(savedWall.calculatedCosts, SPEC.validCurrentSnapshotFields);
    assert.equal(globalThis.__project.updated_date, SPEC.savedVersion);
    capture(c, { caseId: "numeric-string-unit-dimensions-save-and-establish-new-acknowledged-basis", phase: "afterValidSave", saveOutcome: { status: r?.status }, cas: call });
    // select invalid dimensions via actual Wall material select — holds new 57, not old 408
    const sel = materialSelect(c, "Wall material"); assert.ok(sel);
    await act(async () => { sel.props.onChange({ target: { value: SPEC.badMaterialId } }); });
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.validCurrentSnapshotFields);
    const rawInv = globalThis.__seenProject ? JSON.parse(JSON.stringify(globalThis.__invRows)) : null;
    const dimRow = rawInv?.find((i) => i.id === SPEC.badMaterialId);
    assert.equal(dimRow?.wall_unit_length_inches, "", "raw catalog length untouched");
    const fresh = toolbarProp(c, "onSave");
    let r2; await act(async () => { r2 = await fresh(); });
    assert.equal(r2?.status, "failed", "next save blocked");
    assert.equal(r2?.error?.message, BLOCKED_MSG);
    assert.equal(spyCount("saveSource"), 1); assert.equal(spyCount("recordBuilderSave"), 1);
    assert.equal(spyCount("pricing"), 0); assert.equal(spyCount("ensureIdempotent"), 0);
    assert.equal(spyCount("estimateWrite"), 0); assert.equal(spyCount("partGroup"), 0); assert.equal(spyCount("converter"), 0);
    capture(c, { caseId: "numeric-string-unit-dimensions-save-and-establish-new-acknowledged-basis", phase: "afterInvalidSelectBlocked", saveOutcome: { status: r2?.status, error: r2?.error?.message } });
  } finally { await unmountAll(c); }
});

assert.equal(results.length, SPEC.pageCaseCount, "case count " + SPEC.pageCaseCount);
assert.equal(globalThis.__unexpectedNetwork, 0, "unexpected network access");
assert.equal(globalThis.__unexpectedSdk, 0, "unexpected SDK access");
const okCount = results.filter((r) => r.ok).length;
fs.writeFileSync(DIR + "masonry-dimensions-page-verification.json", JSON.stringify({ results, unexpectedNetwork: globalThis.__unexpectedNetwork, unexpectedSdk: globalThis.__unexpectedSdk }, null, 2));
fs.writeFileSync(DIR + "masonry-dimensions-page-state-proof.json", JSON.stringify({ proof }, null, 2));
console.log("masonry-dimensions-page passed=" + okCount + " failed=" + (results.length - okCount));
if (okCount !== results.length) process.exit(1);
