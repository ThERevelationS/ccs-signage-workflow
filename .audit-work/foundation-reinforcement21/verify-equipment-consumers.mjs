// Equipment-pricing — staged remote-bundle build check.
// Bundles the candidate page plus EVERY in-scope consumer of the touched
// modules (EquipmentTab — real, WallsPanel, ItemCard, WallCapsPanel, Totals,
// BOM, PolesPanel) against the frozen remote source map with candidates
// applied. Fails closed on any missing import or build warning; records which
// files loaded.
import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const DIR = ".audit-work/foundation-reinforcement21/";
const read = (n) => JSON.parse(fs.readFileSync(DIR + n, "utf8"));
const hash = (t) => createHash("sha256").update(t).digest("hex");
const SPEC = read("equipment-pricing-flow-proof-spec.json");

const sources = new Map();
for (const f of read(SPEC.dependencyArtifact).files) sources.set("/app/" + f.path, f.content);
for (const f of read(SPEC.sourceArtifact).files) if (f.text !== undefined) sources.set("/app/" + f.path, f.text);
const F = "/app/src/components/estimator/foundation/";
for (const [name, file] of Object.entries(SPEC.candidates))
  sources.set(F + name, fs.readFileSync(DIR + file, "utf8"));
for (const [name, h] of Object.entries(SPEC.candidateHashes))
  assert.equal(hash(sources.get(F + name)), h, "candidate " + name);

// visual-leaf + boundary stubs (same scope as the page harness, minus the
// real EquipmentTab candidate)
const STUB_PREFIX = ["@/components/ui/", "lucide-react", "@/components/auth/", "@/api/", "@/components/utils",
  "@/components/markup/", "@/components/estimator/builder/builderService", "@/components/estimator/idempotentEntityCreate",
  "@/components/estimator/loadAllEntityRows", "@/components/estimator/estimateMutationGuard",
  "@/components/estimator/estimatePersistence", "@/components/estimator/builder/builderPartGroupPersistence",
  "@/components/staff/staffEntities", "@/components/estimator/foundation/convertToBrickStone",
  "@/components/estimator/moduleShared/moduleProjectActions",
  "@/components/estimator/foundation/ConcreteDeliveryPanel", "@/components/estimator/foundation/FoundationToolbar",
  "@/components/estimator/foundation/FoundationSectionBanner", "@/components/estimator/foundation/AiEngineeringAssistant",
  "@/components/estimator/foundation/Foundation3DPreview", "@/components/estimator/foundation/FoundationTemplateDialog",
  "@/components/estimator/foundation/FoundationLayoutCanvas", "@/components/estimator/foundation/SignageCabinetsPanel",
  "@/components/estimator/foundation/LandscapeDesigner", "@/components/estimator/foundation/CustomerPricingPanel",
  "@/components/estimator/foundation/landscapeMaterials",
  "./builderPartGroupPersistence", "./landscapeMaterials"];

// Per-module stubs: emit every named export any frozen source imports from a
// stubbed path, plus a default. Build-only check — implementations are stubs.
const stubContents = (stubPath) => {
  const names = new Set();
  const escaped = stubPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const text of sources.values()) {
    const re = new RegExp("import\\s*\\{([^}]*)\\}\\s*from\\s*[\"']" + escaped + "[\"']", "g");
    for (const m of text.matchAll(re))
      for (const raw of m[1].split(",")) {
        const n = raw.trim().split(/\s+as\s+/)[0].trim();
        if (n && !/^type$/.test(n)) names.add(n);
      }
  }
  return "export default ()=>null;\n" + [...names].map((n) => `export const ${n}=${n === "base44" || n === "staffEntities" ? "{}" : "()=>null"};`).join("\n");
};
const loaded = {};
const plug = { name: "frozen", setup(b) {
  b.onResolve({ filter: /.*/ }, (a) => {
    if (STUB_PREFIX.some((k) => a.path.startsWith(k))) return { path: "s:" + a.path, namespace: "s" };
    let base;
    if (a.path.startsWith("/app/")) base = a.path;
    else if (a.path.startsWith("@/")) base = "/app/src/" + a.path.slice(2);
    else if (a.path.startsWith(".")) base = path.posix.resolve(path.posix.dirname(a.importer), a.path);
    else return { external: true };
    const resolved = [base, base + ".js", base + ".jsx"].find((p) => sources.has(p));
    if (!resolved) throw Error("Missing frozen source: " + a.path + " (imported by " + a.importer + ")");
    return { path: resolved, namespace: "frozen" };
  });
  b.onLoad({ filter: /.*/, namespace: "s" }, (a) => ({
    contents: stubContents(a.path.slice(2)), loader: "jsx", resolveDir: path.resolve(".") }));
  b.onLoad({ filter: /.*/, namespace: "frozen" }, (a) => {
    const contents = sources.get(a.path);
    loaded[a.path] = hash(contents);
    return { contents, loader: a.path.endsWith(".jsx") ? "jsx" : "js" };
  });
}};

const entry = "/app/equipment-consumer-entry.jsx";
sources.set(entry, `
export { default as Page } from "/app/src/pages/FoundationEstimator.jsx";
export { default as EquipmentTab } from "/app/src/components/estimator/foundation/FoundationEquipmentTab.jsx";
export { default as WallsPanel } from "/app/src/components/estimator/foundation/FoundationWallsPanel.jsx";
export { default as ItemCard } from "/app/src/components/estimator/foundation/FoundationItemCard.jsx";
export { default as WallCapsPanel } from "/app/src/components/estimator/foundation/FoundationWallCapsPanel.jsx";
export { default as Totals } from "/app/src/components/estimator/foundation/FoundationTotals.jsx";
export { default as BOM } from "/app/src/components/estimator/foundation/FoundationBOM.jsx";
export { default as PolesPanel } from "/app/src/components/estimator/foundation/FoundationPolesPanel.jsx";
`);

const result = await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", write: false,
  external: ["react", "react-dom", "react-dom/*", "react/*", "react-router-dom", "scheduler", "scheduler/*"],
  plugins: [plug], loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic",
  metafile: true, logLevel: "silent",
});
assert.deepEqual(result.warnings, [], "no build warnings");
const required = [
  "/app/src/pages/FoundationEstimator.jsx",
  F + "FoundationEquipmentTab.jsx", F + "FoundationWallsPanel.jsx", F + "FoundationItemCard.jsx",
  F + "FoundationWallCapsPanel.jsx", F + "FoundationTotals.jsx", F + "FoundationBOM.jsx",
  F + "FoundationPolesPanel.jsx",
  F + "wallCalculator.js", F + "foundationCalc.js", F + "foundationInputValidation.js",
  F + "poleCalculator.js", F + "wallCapCalculator.js", F + "foundationCatalogIntegrity.js",
  F + "foundationEquipmentBindings.js", F + "WallShapeEditor.jsx",
];
for (const r of required) assert.ok(loaded[r], "required input loaded: " + r);
for (const [name, h] of Object.entries(SPEC.candidateHashes))
  assert.equal(loaded[F + name], h, "candidate loaded " + name);
assert.ok(!Object.keys(result.metafile.inputs).some((f) => f.startsWith("/app") && /base44Client|@base44/.test(f)), "no real SDK in bundle");
fs.writeFileSync(DIR + "equipment-consumer-build.json",
  JSON.stringify({ warnings: result.warnings.length, inputs: Object.keys(result.metafile.inputs).length, loaded }, null, 2));
console.log("equipment-consumers ok inputs=" + Object.keys(result.metafile.inputs).length);
