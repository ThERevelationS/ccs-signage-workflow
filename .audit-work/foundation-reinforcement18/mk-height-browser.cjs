const fs = require("fs");
const E = ".audit-work/foundation-reinforcement18/";
let s = fs.readFileSync(E + "verify-masonry-rates-browser.mjs", "utf8");
s = s.replace('masonry-rates-flow-proof-spec.json', 'masonry-height-flow-proof-spec.json');
s = s.replace(/masonry-rates-/g, 'masonry-height-');
s = s.replace(/masonry-height-sandbox-final-scope\.json/g, 'masonry-rates-sandbox-final-scope.json');
s = s.replace(/masonry-height-panel-source\.json/g, 'masonry-rates-panel-source.json');
s = s.replace(/masonry-height-pricing-baseline-probe\.json/g, 'masonry-pricing-baseline-probe.json');
s = s.replace(/masonry-height-material-pole-source\.json/g, 'masonry-material-pole-source.json');
// candidate overrides: calc + panel
s = s.replace(`sources.set("/app/src/components/estimator/foundation/wallCalculator.js", fs.readFileSync(DIR + SPEC.candidate, "utf8"));
assert.equal(hash(sources.get("/app/src/components/estimator/foundation/wallCalculator.js")), "a2eb2806ba70ac52487e3f7e7d1be5e42d0005dc0e8c39952224957677d5fbc8", "rates candidate hash");`,
`sources.set("/app/src/components/estimator/foundation/wallCalculator.js", fs.readFileSync(DIR + SPEC.candidateCalculator, "utf8"));
sources.set("/app/src/components/estimator/foundation/FoundationWallsPanel.jsx", fs.readFileSync(DIR + SPEC.candidatePanel, "utf8"));`);
// CSS content: height panel candidate + applied BOM candidate + fixture + primitives (no RatesPanel)
s = s.replace(`DIR + "masonry-material-candidate-FoundationWallsPanel.jsx",
    DIR + "masonry-material-candidate-FoundationBOM.jsx",
    "src/components/estimator/foundation/FoundationRatesPanel.jsx",`,
`DIR + "masonry-height-candidate-FoundationWallsPanel.jsx",
    DIR + "masonry-material-candidate-FoundationBOM.jsx",`);
// embed __INNER
s = s.replace('window.__CASES=${JSON.stringify(SPEC.cases)};',
'window.__CASES=${JSON.stringify(SPEC.cases)};window.__INNER=${JSON.stringify(innerFixture)};');
// innerFixture loaded near the seed read
s = s.replace('const seed = JSON.parse(fs.readFileSync(DIR + SPEC.fixtureArtifact, "utf8")).fixture;',
'const seed = JSON.parse(fs.readFileSync(DIR + SPEC.fixtureArtifact, "utf8")).fixture;\nconst innerFixture = JSON.parse(fs.readFileSync(DIR + SPEC.innerFixtureArtifact, "utf8")).rows.find((r) => r.name === SPEC.innerFixtureRowName).fixture;');
// modes list
s = s.replace(`for (const mode of SPEC.cases) for (const vp of SPEC.viewports) {`,
`for (const mode of SPEC.browserModes) for (const vp of SPEC.viewports) {`);
// expectedRows already mode.bomRows ✓
// Rates-in-Use block: remove (no RatesPanel in height proof)
s = s.replace(/    \/\/ Rates in Use: numeric settings displayed precisely[\s\S]*?Layout: padding >= 12px/, '    // Layout: padding >= 12px');
// add per-mode asserts: input values + aria-invalid + describedby + diagnostic prefix
s = s.replace(`    // aria-invalid + describedby → visible field-specific diagnostics`,
`    // actual input values
    if (mode.heightValue !== undefined) {
      const inp = page.locator('input[aria-label="Wall height (in)"]').first();
      assert.ok(await inp.count(), "height input present");
      assert.equal(await inp.inputValue(), mode.heightValue, "height value " + mode.id);
    }
    if (mode.internalHeightValue !== undefined) {
      const inp = page.locator('input[aria-label="Internal wall height (in)"]').first();
      assert.ok(await inp.count(), "internal height input present");
      assert.equal(await inp.inputValue(), mode.internalHeightValue, "internal height value " + mode.id);
    }
    // aria-invalid + describedby → visible field-specific diagnostics`);
s = s.replace('for (const aria of []) {', 'for (const aria of [mode.invalidInput].filter(Boolean)) {');
// blank mode interaction: fill 9 → 57 → clear → 408
s = s.replace(`    const png = DIR + \`masonry-height-browser-\${mode.id}-\${vp.width}.png\`;`,
`    if (mode.id === "blank") {
      const inp = page.locator('input[aria-label="Wall height (in)"]').first();
      await inp.fill("9");
      const mid = await page.locator('[data-testid="walls-panel"] .whitespace-nowrap.font-bold').first().innerText();
      assert.ok(mid.includes("$57.00"), "repaired preview 57 got " + mid);
      await inp.fill("");
      const back = await page.locator('[data-testid="walls-panel"] .whitespace-nowrap.font-bold').first().innerText();
      assert.ok(back.includes("$408.00"), "acknowledged 408 after re-blank got " + back);
    }
    const png = DIR + \`masonry-height-browser-\${mode.id}-\${vp.width}.png\`;`);
// forbiddenAmount already guarded (mode.forbiddenAmount) ✓
// case count
s = s.replace('assert.equal(results.length, SPEC.browserCaseCount, "case count " + SPEC.browserCaseCount);', 'assert.equal(results.length, SPEC.browserCaseCount, "case count " + SPEC.browserCaseCount);');
fs.writeFileSync(E + "verify-masonry-height-browser.mjs", s);
console.log("written", s.length);
