const innerFixture = JSON.parse(fs.readFileSync(DIR + SPEC.innerFixtureArtifact, "utf8"))
  .rows.find((r) => r.name === SPEC.innerFixtureRowName).fixture;
const innerProject = () => {
  const w = { ...JSON.parse(JSON.stringify(innerFixture.project.walls[0])) };
  return makeProject([w]);
};
const heightInputEl = (c, aria) => {
  const els = c.root.findAll((el) => el.type === "input" && el.props?.["aria-label"] === aria);
  return els.length ? els[0] : null;
};
const results = [];
const check = async (id, fn) => {
  try { await fn(); results.push({ id, ok: true }); console.log("ok " + id); }
  catch (e) { results.push({ id, ok: false, error: String(e.stack || e).slice(0, 1500) }); console.log("FAIL " + id + " :: " + String(e.message || e).slice(0, 400)); }
};
const fieldSubset = (actual, expected) => { for (const [k, v] of Object.entries(expected)) assert.deepEqual(actual?.[k], v, "field " + k); };

// case 1 — blank height holds acknowledged snapshot, not preview
await check("blank-height-holds-acknowledged-not-preview", async () => {
  const c = await mount({ project: makeProject([seedWall()]) });
  try {
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.validCurrentSnapshotFields);
    const input = heightInputEl(c, "Wall height (in)"); assert.ok(input, "height input");
    await act(async () => { input.props.onChange({ target: { value: "" } }); });
    assert.equal(globalThis.__seenProject.walls[0].heightInches, "", "raw blank preserved");
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.baselineSnapshot);
    assert.ok(foundationAssemblyCatalogIssues(globalThis.__seenProject, globalThis.__invRows).some((i) => i.code === "wall_height_unavailable"), "wall_height_unavailable");
    assert.equal(totalsPanel(c).props.pricingUnavailable, true);
    let r; const onSave = toolbarProp(c, "onSave"); assert.ok(onSave);
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(spyCount("saveSource"), 0); assert.equal(spyCount("recordBuilderSave"), 0);
  } finally { await unmountAll(c); }
});

// case 2 — zero height is not twenty-four
await check("zero-height-is-not-twenty-four", async () => {
  const c = await mount({ project: makeProject([seedWall()]) });
  try {
    const input = heightInputEl(c, "Wall height (in)"); assert.ok(input);
    await act(async () => { input.props.onChange({ target: { value: "0" } }); });
    assert.equal(globalThis.__seenProject.walls[0].heightInches, 0, "raw 0 preserved");
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.baselineSnapshot);
    assert.ok(foundationAssemblyCatalogIssues(globalThis.__seenProject, globalThis.__invRows).some((i) => i.code === "wall_height_unavailable"), "wall_height_unavailable");
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(spyCount("saveSource"), 0); assert.equal(spyCount("recordBuilderSave"), 0);
  } finally { await unmountAll(c); }
});

// case 3 — blank fill height is not outer height
await check("blank-fill-height-is-not-outer-height", async () => {
  const inv = JSON.parse(JSON.stringify(innerFixture.inventory));
  const c = await mount({ project: innerProject(), inventory: inv,
    settings: Object.entries(innerFixture.settings).map(([k, v]) => ({ setting_name: k, setting_value: v })) });
  try {
    const input = heightInputEl(c, "Internal wall height (in)"); assert.ok(input, "inner height input");
    await act(async () => { input.props.onChange({ target: { value: "" } }); });
    assert.equal(globalThis.__seenProject.walls[0].internalWallHeightInches, "", "raw blank preserved");
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.baselineSnapshot);
    assert.ok(foundationAssemblyCatalogIssues(globalThis.__seenProject, inv).some((i) => i.code === "internal_wall_height_unavailable"), "internal_wall_height_unavailable");
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(spyCount("saveSource"), 0); assert.equal(spyCount("recordBuilderSave"), 0);
  } finally { await unmountAll(c); }
});

// case 4 — new invalid height cannot adopt rendered history
await check("new-invalid-height-cannot-adopt-rendered-history", async () => {
  const c = await mount({ project: makeProject([]) });
  try {
    const panel = wallsPanel(c);
    const newWall = { ...seedWall(), component_id: "masonry-new-height", heightInches: "",
      calculatedCosts: { ...SPEC.validCurrentSnapshotFields } };
    await act(async () => { panel.props.onChange([newWall]); });
    assert.deepEqual(wallsPanel(c).props.walls[0].calculatedCosts, {}, "rendered fields cannot persist");
    const totals = totalsPanel(c).props.totals;
    assert.equal(totals.total_wall_cost, null); assert.equal(totals.total_brick_cost, null);
    assert.equal(totals.grand_total, null);
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); });
    assert.equal(r?.status, "failed"); assert.equal(spyCount("saveSource"), 0); assert.equal(spyCount("recordBuilderSave"), 0);
  } finally { await unmountAll(c); }
});

// case 5 — valid repair saves and updates acknowledged height basis
await check("valid-repair-saves-and-updates-acknowledged-height-basis", async () => {
  const wall = seedWall(); wall.heightInches = "";
  const c = await mount({ project: makeProject([wall]) });
  try {
    const input = heightInputEl(c, "Wall height (in)"); assert.ok(input);
    await act(async () => { input.props.onChange({ target: { value: "9" } }); });
    assert.equal(globalThis.__seenProject.walls[0].heightInches, 9, "numeric 9 persisted in draft");
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.validCurrentSnapshotFields);
    let r; const onSave = toolbarProp(c, "onSave");
    await act(async () => { r = await onSave(); await flush(); });
    assert.equal(r?.status, "saved", "save succeeds " + JSON.stringify(r?.error?.message || "").slice(0, 120));
    assert.equal(spyCount("saveSource"), 1); assert.equal(spyCount("recordBuilderSave"), 1);
    const call = globalThis.__spies.find((x) => x[0] === "saveSource")[1];
    assert.equal(call.query.updated_date, SPEC.sourceVersion);
    assert.equal(call.patch.$set.walls[0].heightInches, 9, "saved numeric 9");
    fieldSubset(call.patch.$set.walls[0].calculatedCosts, SPEC.validCurrentSnapshotFields);
    assert.equal(globalThis.__project.updated_date, SPEC.savedVersion);
    // clear height again — must hold the newly acknowledged 57, not baseline or preview
    const input2 = heightInputEl(c, "Wall height (in)");
    await act(async () => { input2.props.onChange({ target: { value: "" } }); });
    fieldSubset(wallsPanel(c).props.walls[0].calculatedCosts, SPEC.validCurrentSnapshotFields);
    const fresh = toolbarProp(c, "onSave");
    let r2; await act(async () => { r2 = await fresh(); });
    assert.equal(r2?.status, "failed", "next save blocked");
    assert.equal(spyCount("saveSource"), 1); assert.equal(spyCount("recordBuilderSave"), 1);
  } finally { await unmountAll(c); }
});

assert.equal(globalThis.__unexpectedNetwork, 0, "unexpected network access");
assert.equal(globalThis.__unexpectedSdk, 0, "unexpected SDK access");
const okCount = results.filter((r) => r.ok).length;
fs.writeFileSync(DIR + "masonry-height-page-verification.json", JSON.stringify({ results, unexpectedNetwork: globalThis.__unexpectedNetwork, unexpectedSdk: globalThis.__unexpectedSdk }, null, 2));
console.log("masonry-height-page passed=" + okCount + " failed=" + (results.length - okCount));
if (okCount !== results.length) process.exit(1);
