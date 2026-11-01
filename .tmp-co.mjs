import fs from "node:fs";
const f = "src/pages/ChangeOrders.jsx";
let s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const must = (old, nu) => {
  if (!s.includes(old)) { console.error("MISS:", JSON.stringify(old.slice(0, 80))); process.exit(1); }
  s = s.replace(old, nu);
};
must(
  `import SavedViews from "@/components/workflow/SavedViews";`,
  `import SavedViews from "@/components/workflow/SavedViews";
import { ExportChangeOrdersButton } from "@/components/importer/ImportExportButtons";`
);
must(
  `            onApply={(s, name) => { setStatus(s.status || ""); setQuery(s.query || ""); setViewName(name || ""); }}
          />`,
  `            onApply={(s, name) => { setStatus(s.status || ""); setQuery(s.query || ""); setViewName(name || ""); }}
          />
        <ExportChangeOrdersButton rows={changeOrders} />`
);
fs.writeFileSync(f, s);
console.log("PATCHED", f);
