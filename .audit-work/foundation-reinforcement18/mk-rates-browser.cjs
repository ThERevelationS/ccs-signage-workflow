const fs = require("fs");
const E = ".audit-work/foundation-reinforcement18/";
let s = fs.readFileSync(E + "verify-masonry-browser.mjs", "utf8");
s = s.replace('masonry-material-browser-proof-spec.json', 'masonry-rates-flow-proof-spec.json');
s = s.replace('masonry-material-proof-spec.json', 'masonry-rates-hash-spec.json');
s = s.replace('masonry-material-browser-rows.json', 'masonry-rates-browser-rows.json');
s = s.replace('wall-cap-geometry-sandbox-final-scope.json', 'masonry-material-sandbox-final-scope.json');
s = s.replace('"masonry-material-pole-source.json"]', '"masonry-material-pole-source.json", "masonry-rates-panel-source.json"]');
s = s.replace(`for (const name of Object.keys(HASHSPEC.candidateHashes)) {
  const p = "/app/src/components/estimator/foundation/" + name;
  sources.set(p, fs.readFileSync(DIR + "masonry-material-candidate-" + name, "utf8"));
  assert.equal(hash(sources.get(p)), HASHSPEC.candidateHashes[name], "candidate hash " + name);
}`,
`sources.set("/app/src/components/estimator/foundation/wallCalculator.js", fs.readFileSync(DIR + SPEC.candidate, "utf8"));
assert.equal(hash(sources.get("/app/src/components/estimator/foundation/wallCalculator.js")), "a2eb2806ba70ac52487e3f7e7d1be5e42d0005dc0e8c39952224957677d5fbc8", "rates candidate hash");`);
s = s.replace(`for (const name of Object.keys(HASHSPEC.candidateHashes)) assert.ok(loaded["/app/src/components/estimator/foundation/" + name], "candidate input " + name);`,
'assert.ok(loaded["/app/src/components/estimator/foundation/wallCalculator.js"]);');
s = s.replace(/masonry-material-browser-fixture\.jsx/g, 'masonry-rates-browser-fixture.jsx');
s = s.replace(`DIR + "masonry-material-candidate-FoundationWallsPanel.jsx",
    DIR + "masonry-material-candidate-FoundationBOM.jsx",`,
`DIR + "masonry-rates-candidate-wallCalculator.js",
    "src/components/estimator/foundation/FoundationRatesPanel.jsx",`);
s = s.replace('window.__SEED=${JSON.stringify(seed).replace(/</g, "\\\\u003c")};',
'window.__SEED=${JSON.stringify(seed).replace(/</g, "\\\\u003c")};window.__CASES=${JSON.stringify(SPEC.cases)};');
s = s.replace(/masonry-material-browser/g, 'masonry-rates-browser');
s = s.replace(`for (const mode of SPEC.modes) for (const vp of SPEC.viewports) {`,
`for (const mode of SPEC.cases) for (const vp of SPEC.viewports) {`);
s = s.replace('?mode=${mode.id}', '?case=${mode.id}');
s = s.replace('const expectedRows = ROWS[mode.id];', 'const expectedRows = mode.bomRows;');
s = s.replace('if (mode.panelAmount) {', 'if (mode.wallAmount) {');
s = s.replace('"panel amount " + mode.panelAmount', '"panel amount " + mode.wallAmount');
s = s.replace('.includes(mode.panelAmount)', '.includes(mode.wallAmount)');
s = s.replace('assert.equal(savedNotice, mode.savedNotice, "saved notice");',
'assert.equal(savedNotice, false, "no saved notice");');
s = s.replace('assert.equal(bannerVisible, mode.pricingUnavailable, "BOM banner visible == pricingUnavailable");',
'assert.equal(bannerVisible, false, "no BOM Pricing unavailable banner");');
s = s.replace('assert.equal(Boolean(before.pricingUnavailable), mode.pricingUnavailable, "__M flag independent");',
'assert.equal(Boolean(before.pricingUnavailable), false, "__M flag false");');
s = s.replace('for (const t of mode.diagnosticTextPrefixes || [])', 'for (const t of [])');
s = s.replace('for (const aria of mode.invalidSelectFields || []) {', 'for (const aria of []) {');
s = s.replace(/if \(mode\.id === "both"\) \{[\s\S]*?\n    \}\n/, '\n');
s = s.replace(`    // Layout: padding >= 12px on td edges; no horizontal overflow`,
`    // Rates in Use: numeric settings displayed precisely
    const ratesText = await page.locator('[data-testid="rates-panel"]').innerText();
    assert.ok(ratesText.includes("Wall labor"), "rates panel mounted");
    for (const [k, label] of [["wall_labor_rate", "Wall labor \$/sqft"], ["wall_mortar_cost_per_bag", "Mortar \$/bag"]]) {
      const v = String(mode.settings[k]);
      const idx = ratesText.indexOf(label);
      assert.ok(idx >= 0, label + " label present");
      const after = ratesText.slice(idx + label.length).split("\\n").map((x) => x.trim()).filter(Boolean);
      assert.equal(after[0], v, k + " displayed " + v + " got " + JSON.stringify(after));
    }

    // Layout: padding >= 12px on td edges; no horizontal overflow`);
fs.writeFileSync(E + "verify-masonry-rates-browser.mjs", s);
console.log("written", s.length, "checks:", (s.match(/await check/g) || []).length);
