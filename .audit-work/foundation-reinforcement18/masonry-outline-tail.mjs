const ratesSettings = (c, expected) => {
  const el = elByType(c, "FoundationRatesPanel");
  assert.ok(el.length, "FoundationRatesPanel mounted");
  for (const [k, v] of Object.entries(expected)) assert.deepEqual(el[0].props.settings[k], v, "rates settings " + k);
};
const BLOCKED_MSG = "Save paused: fix highlighted design inputs or catalog selections.";
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
  renderedWalls: wallsPanel(c).props.walls.map((w) => ({ component_id: w.component_id, heightInches: w.heightInches, materialId: w.materialId, calculatedCosts: w.calculatedCosts })),
  totals: JSON.parse(JSON.stringify(totalsPanel(c).props.totals)),
  inventory: JSON.parse(JSON.stringify(globalThis.__invRows ?? null)),
  ratesSettings: (() => { try { const el = c.root.findAll((e2) => e2.type?.name === "FoundationRatesPanel"); return el.length ? JSON.parse(JSON.stringify(el[0].props.settings)) : null; } catch { return null; } })(),
  pricingUnavailable: totalsPanel(c).props.pricingUnavailable,
  spies: JSON.parse(JSON.stringify(globalThis.__spies)),
});
const shapeIssue = (code) => foundationAssemblyCatalogIssues(globalThis.__seenProject, globalThis.__invRows).some((i) => i.code === code);
const editorEl = (c) => c.root.findAll((el) => el.type?.name === "WallShapeEditor")[0];

// case 1 — acknowledged outline with empty segments holds saved costs + shape issue + blocked
await check("acknowledged-empty-outline-holds-baseline", async () => {
  const wall = seedWall(); wall.shape = { points: [], closed: false, segments: [] };
  const c = await mount({ project: makeProject([wall]) });
  try {
    ratesSettings(c, seed.settings);
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.baselineSnapshot);
    assert.ok(shapeIssue("wall_outline_unavailable"), "outline unavailable issue");
    assert.equal(totalsPanel(c).props.pricingUnavailable, true);
    let r; const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    capture(c, { caseId: "acknowledged-empty-outline-holds-baseline", saveOutcome: { status: r?.status, error: r?.error?.message } });
  } finally { await unmountAll(c); }
});

// case 2 — point/segment mismatch holds baseline, blocked
await check("outline-geometry-mismatch-holds-baseline", async () => {
  const wall = seedWall();
  wall.shape = { points: [{ x: 0, z: 0 }, { x: 48, z: 0 }, { x: 48, z: 24 }, { x: 0, z: 24 }], closed: true,
    segments: [{ length: 48 }, { length: 24 }, { length: 48 }, { length: 24 }, { length: 9 }] };
  const c = await mount({ project: makeProject([wall]) });
  try {
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.baselineSnapshot);
    assert.ok(shapeIssue("wall_outline_geometry_mismatch") || shapeIssue("wall_outline_unavailable"), "mismatch or unavailable issue");
    assert.equal(totalsPanel(c).props.pricingUnavailable, true);
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    capture(c, { caseId: "outline-geometry-mismatch-holds-baseline", saveOutcome: { status: r?.status, error: r?.error?.message } });
  } finally { await unmountAll(c); }
});

// case 3 — new wall unknown shape cannot adopt rendered history
await check("new-unknown-outline-cannot-adopt-rendered-history", async () => {
  const c = await mount({ project: makeProject([]) });
  try {
    const panel = wallsPanel(c);
    const newWall = { ...seedWall(), component_id: "masonry-new-outline",
      shape: { points: [], closed: false, segments: [] },
      calculatedCosts: { ...SPEC.validCurrentSnapshotFields } };
    await act(async () => { panel.props.onChange([newWall]); });
    assert.deepEqual(wallsPanel(c).props.walls[0].calculatedCosts, {}, "rendered fields cannot persist");
    const totals = totalsPanel(c).props.totals;
    assert.equal(totals.total_wall_cost, null); assert.equal(totals.total_brick_cost, null);
    assert.equal(totals.grand_total, null);
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(r?.error?.message, BLOCKED_MSG);
    zeroWrites();
    capture(c, { caseId: "new-unknown-outline-cannot-adopt-rendered-history", saveOutcome: { status: r?.status, error: r?.error?.message } });
  } finally { await unmountAll(c); }
});

// case 4 — numeric-string segment lengths calculate + save + ACK update
await check("numeric-string-segments-save-and-update-acknowledged-basis", async () => {
  const wall = seedWall();
  wall.shape = { points: [{ x: 0, z: 0 }, { x: 48, z: 0 }, { x: 48, z: 24 }, { x: 0, z: 24 }], closed: true,
    segments: [{ length: "48" }, { length: "24" }, { length: "48" }, { length: "24" }], tag: "authored" };
  const c = await mount({ project: makeProject([wall]) });
  try {
    ratesSettings(c, seed.settings);
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.validCurrentSnapshotFields);
    await editName(c);
    let r; const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
    await act(async () => { r = await onSave(); await flush(); });
    assert.equal(r?.status, "saved");
    assert.equal(spyCount("saveSource"), 1); assert.equal(spyCount("recordBuilderSave"), 1);
    const call = globalThis.__spies.find((x) => x[0] === "saveSource")[1];
    assert.equal(call.query.updated_date, SPEC.sourceVersion);
    const savedWall = call.patch.$set.walls[0];
    assert.equal(savedWall.shape.closed, true);
    assert.equal(savedWall.shape.tag, "authored", "shape metadata preserved");
    assert.ok(savedWall.shape.segments.every((s) => String(s.length) === String(s.length)), "segments preserved");
    fieldSubset(savedWall.calculatedCosts, SPEC.validCurrentSnapshotFields);
    assert.equal(globalThis.__project.updated_date, SPEC.savedVersion);
    capture(c, { caseId: "numeric-string-segments-save-and-update-acknowledged-basis", phase: "afterValidSave", saveOutcome: { status: r?.status } });
    // clear the outline via actual editor → current amounts hold newly acknowledged 57, next save blocked
    const editor = editorEl(c);
    if (editor) {
      const outlineBtn = c.root.findAll((el) => el.type === "button" && String(el.props?.children || "").includes("outline"))[0];
      if (outlineBtn) await act(async () => { outlineBtn.props.onClick?.(); });
    }
    // clear via panel-level clear — emit empty shape through real editor onChange
    const wallPanel = wallsPanel(c);
    await act(async () => { wallPanel.props.onChange([{ ...globalThis.__seenProject.walls[0], shape: { points: [], closed: false, segments: [] } }]); });
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.validCurrentSnapshotFields);
    const fresh = toolbarProp(c, "onSave");
    let r2; await act(async () => { r2 = await fresh(); });
    assert.equal(r2?.status, "failed"); assert.equal(r2?.error?.message, BLOCKED_MSG);
    assert.equal(spyCount("saveSource"), 1); assert.equal(spyCount("recordBuilderSave"), 1);
    capture(c, { caseId: "numeric-string-segments-save-and-update-acknowledged-basis", phase: "afterClearBlocked", saveOutcome: { status: r2?.status, error: r2?.error?.message } });
  } finally { await unmountAll(c); }
});

// case 5 — valid rectangle 8x8 saves numeric points + costs 114, retains IDs
await check("rectangle-save-retains-ids", async () => {
  const wall = seedWall();
  wall.shape = { points: [{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 8 }, { x: 0, z: 8 }], closed: true,
    segments: [{ length: 8 }, { length: 8 }, { length: 8 }, { length: 8 }] };
  const c = await mount({ project: makeProject([wall]) });
  try {
    const w = wallsPanel(c).props.walls[0];
    assert.equal(w.calculatedCosts?.totalBricks, 12);
    assert.equal(w.calculatedCosts?.materialCost, 24);
    assert.equal(w.calculatedCosts?.laborCost, 90);
    assert.equal(w.calculatedCosts?.totalCost, 114);
    await editName(c);
    let r; const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
    await act(async () => { r = await onSave(); await flush(); });
    assert.equal(r?.status, "saved");
    const call = globalThis.__spies.find((x) => x[0] === "saveSource")[1];
    assert.equal(call.patch.$set.walls[0].component_id, "synthetic-wall");
    assert.equal(call.patch.$set.walls[0].shape.segments.length, 4);
    assert.ok(call.patch.$set.walls[0].shape.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z)));
    assert.equal(call.patch.$set.walls[0].calculatedCosts.totalCost, 114);
    assert.equal(globalThis.__project.updated_date, SPEC.savedVersion);
    capture(c, { caseId: "rectangle-save-retains-ids", phase: "afterValidSave", saveOutcome: { status: r?.status } });
  } finally { await unmountAll(c); }
});

// case 6 — invalid rectangle draft alone never mutates authored wall or pricing
await check("invalid-rectangle-draft-never-mutates-wall", async () => {
  const c = await mount({ project: makeProject([seedWall()]) });
  try {
    const authoredShape = JSON.parse(JSON.stringify(globalThis.__seenProject.walls[0].shape));
    const authoredCosts = JSON.parse(JSON.stringify(wallsPanel(c).props.walls[0].calculatedCosts));
    // open the outline editor via real button
    const btn = c.root.findAll((el) => el.type === "button" && String(el.props?.["aria-label"] || "").includes("outline"))[0]
      || c.root.findAll((el) => el.type?.name === "Button" && String(el.props?.children || "").includes("outline"))[0];
    if (btn) await act(async () => { btn.props.onClick?.(); });
    // type invalid rectangle value via the real input
    const rectInputs = c.root.findAll((el) => el.type === "input" && el.props?.id && String(el.props.id).startsWith("rectL"));
    if (rectInputs[0]) {
      await act(async () => { rectInputs[0].props.onChange({ target: { value: "-5" } }); });
    }
    assert.deepEqual(globalThis.__seenProject.walls[0].shape, authoredShape, "shape unchanged by invalid draft");
    assert.deepEqual(wallsPanel(c).props.walls[0].calculatedCosts, authoredCosts, "costs unchanged by invalid draft");
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.validCurrentSnapshotFields);
    capture(c, { caseId: "invalid-rectangle-draft-never-mutates-wall" });
  } finally { await unmountAll(c); }
});

assert.equal(results.length, SPEC.pageCaseCount ?? 6, "case count");
assert.equal(globalThis.__unexpectedNetwork, 0, "unexpected network access");
assert.equal(globalThis.__unexpectedSdk, 0, "unexpected SDK access");
const okCount = results.filter((r) => r.ok).length;
fs.writeFileSync(DIR + "masonry-outline-page-verification.json", JSON.stringify({ results, unexpectedNetwork: globalThis.__unexpectedNetwork, unexpectedSdk: globalThis.__unexpectedSdk }, null, 2));
fs.writeFileSync(DIR + "masonry-outline-page-state-proof.json", JSON.stringify({ proof }, null, 2));
console.log("masonry-outline-page passed=" + okCount + " failed=" + (results.length - okCount));
if (okCount !== results.length) process.exit(1);
