import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18/";
const compiled = await build({
  entryPoints: ["src/components/jobs/printTemplates/templates/original.js"],
  bundle: true, platform: "node", format: "esm", write: false, metafile: true,
});
assert.ok(compiled.metafile.inputs["src/components/jobs/printTemplates/templates/original.js"]);
assert.ok(!Object.keys(compiled.metafile.inputs).some(file => /base44Client|@base44/.test(file)));
const { renderOriginalHtml } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
for (const name of ["historical-unknown", "new-accepted-costs"]) {
  const file = DIR + `cost-print-${name}.json`;
  const savedText = fs.readFileSync(file, "utf8");
  const { model } = JSON.parse(savedText);
  const htmlFile = DIR + `cost-print-${name}.html`;
  const baseline = DIR + `cost-print-${name}-before-scroll-region.html`;
  if (!fs.existsSync(baseline)) fs.copyFileSync(htmlFile, baseline);
  const html = renderOriginalHtml(model, { autoPrint: false });
  assert.equal(fs.readFileSync(file, "utf8"), savedText);
  assert.ok(html.includes('aria-label="Work Order products"'));
  assert.ok(html.includes('aria-label="Work Order materials"'));
  assert.ok(html.includes("overflow-x: auto"));
  fs.writeFileSync(htmlFile, html);
  console.log("Rendered frozen model only:", name);
}
