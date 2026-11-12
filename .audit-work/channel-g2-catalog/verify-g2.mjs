// G2 (WS-P audit): catalog-create idempotency contract — the three channel
// catalog tabs route .create through ensureIdempotentEntityCreate keyed on
// the entity's natural name field. Checks the source markers AND the helper
// semantics (retry-same-payload returns the row; same-key different data
// throws — never a silent dup).
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "../../src/components/channelLetterInstall");

let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; console.log("FAIL", n, x); } };

const tabs = [
  { file: "MaterialsInventoryTab.jsx", entity: "ChannelLetterInstallInventory", keyField: "item_name" },
  { file: "EquipmentInventoryTab.jsx", entity: "ChannelLetterInstallEquipment", keyField: "equipment_name" },
  { file: "DimensionalMaterialsTab.jsx", entity: "DimensionalLetterMaterial", keyField: "material_name" },
];
for (const t of tabs) {
  const src = readFileSync(join(SRC, t.file), "utf8");
  ok(src.includes('ensureIdempotentEntityCreate } from "@/components/estimator/idempotentEntityCreate"'), `${t.file}: helper imported`);
  ok(src.includes(`keyField: "${t.keyField}"`) && src.includes(`entity: ${t.entity}`), `${t.file}: create keyed on ${t.keyField}`);
}

// Helper semantics on a stub entity — retry resolves, collision refuses.
import * as esbuild from "esbuild";
const OUT = join(HERE, ".g2-bundle.mjs");
await esbuild.build({
  entryPoints: [join(HERE, "../../src/components/estimator/idempotentEntityCreate.js")],
  bundle: true, format: "esm", platform: "node", outfile: OUT, logLevel: "silent",
  alias: { "@": join(HERE, "../../src") },
});
const idem = await import(pathToFileURL(OUT).href + `?t=${Date.now()}`).catch(() => null);
if (idem?.ensureIdempotentEntityCreate) {
  const rows = [];
  const stub = {
    filter: async (q) => rows.filter((r) => r.item_name === q.item_name),
    create: async (d) => { const r = { ...d, id: `r${rows.length}` }; rows.push(r); return r; },
  };
  const a = await idem.ensureIdempotentEntityCreate({ entity: stub, keyField: "item_name", key: "Acrylic", data: { item_name: "Acrylic", cost: 4 }, label: "T" });
  const b = await idem.ensureIdempotentEntityCreate({ entity: stub, keyField: "item_name", key: "Acrylic", data: { item_name: "Acrylic", cost: 4 }, label: "T" });
  ok(a.id === b.id && rows.length === 1, "helper: identical retry returns same row");
  let threw = false;
  try { await idem.ensureIdempotentEntityCreate({ entity: stub, keyField: "item_name", key: "Acrylic", data: { item_name: "Acrylic", cost: 9 }, label: "T" }); } catch { threw = true; }
  ok(threw && rows.length === 1, "helper: same-key different data throws, no dup");
} else {
  ok(false, "helper import for semantic check");
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} verify-g2: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
